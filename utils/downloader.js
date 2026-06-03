const axios = require('axios');
const { DL_API } = require('../config');

// Your Render service public URL — set this in config.js or env
// e.g. https://video-dl-tg-bot.onrender.com
const { BASE_URL } = require('../config');

const pendingSelections = {};

const escapeMarkdown = (text) => (text || '').replace(/[_*`\[]/g, '\\$&');

const getFileSizeMB = async (url) => {
    try {
        const res = await axios.head(url, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const bytes = parseInt(res.headers['content-length'] || '0');
        return bytes > 0 ? bytes / (1024 * 1024) : 0;
    } catch (_) { return 0; }
};

const formatSize = (mb) => {
    if (mb <= 0) return null;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

// Build proxy URL — Telegram fetches this, we stream from real source
const proxyUrl = (videoUrl) =>
    `${BASE_URL}/proxy?url=${encodeURIComponent(videoUrl)}`;

const fetchAndShowQualities = async (bot, chatId, url, statusMsgId) => {
    const editMsg = async (text, options = {}) => {
        try {
            await bot.editMessageText(text, { chat_id: chatId, message_id: statusMsgId, ...options });
        } catch (e) { console.error('editMsg error:', e.message); }
    };

    try {
        await editMsg('🔍 Fetching available qualities...');

        const apiUrl = `${DL_API}${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, { timeout: 30000 });

        if (!response.data?.status) {
            throw new Error(response.data?.message || 'Invalid API response.');
        }

        const data = response.data.data;
        if (!data || !data.links || !data.links.length) {
            throw new Error('No downloadable links found from API.');
        }

        const videoLinks = data.links.filter(link => {
            const type = (link.type || '').toLowerCase();
            return type === 'video' || type === 'mp4';
        });

        if (videoLinks.length === 0) throw new Error('No video format links found. Try a different URL.');

        const title = data.title || 'Video';

        await editMsg('📊 Checking file sizes...');

        const sizes = await Promise.all(videoLinks.map(link => getFileSizeMB(link.url)));

        const storeKey = `${chatId}_${statusMsgId}`;
        pendingSelections[storeKey] = { videoLinks, sizes, title, url };

        const keyboard = videoLinks.map((link, index) => {
            const quality = link.quality || `Option ${index + 1}`;
            const sizeLabel = sizes[index] > 0 ? ` · ${formatSize(sizes[index])}` : '';
            return [{ text: `📥 ${quality}${sizeLabel}`, callback_data: `dl_${storeKey}_${index}` }];
        });
        keyboard.push([{ text: '❌ Cancel', callback_data: `dl_cancel_${storeKey}` }]);

        await editMsg(
            `🎬 *${escapeMarkdown(title)}*\n\nChoose a quality to download:`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
        );

    } catch (error) {
        console.error('Fetch error:', error.message);
        await editMsg(`❌ *Failed to process link*\n\n${error.message}\n\nPlease try again.`, {
            parse_mode: 'Markdown'
        });
    }
};

const downloadSelectedQuality = async (bot, chatId, storeKey, qualityIndex, callbackQueryId) => {
    const entry = pendingSelections[storeKey];
    if (!entry) {
        await bot.answerCallbackQuery(callbackQueryId, { text: '⚠️ Session expired. Please send the link again.' });
        return;
    }

    const { videoLinks, sizes, title, url } = entry;
    const selectedVideo = videoLinks[qualityIndex];
    if (!selectedVideo) {
        await bot.answerCallbackQuery(callbackQueryId, { text: '⚠️ Invalid selection.' });
        return;
    }

    delete pendingSelections[storeKey];
    await bot.answerCallbackQuery(callbackQueryId, { text: '⏳ Processing...' });

    const statusMsgId = parseInt(storeKey.split('_')[1]);
    const editMsg = async (text, options = {}) => {
        try {
            await bot.editMessageText(text, { chat_id: chatId, message_id: statusMsgId, ...options });
        } catch (e) { console.error('editMsg error:', e.message); }
    };

    const videoUrl = selectedVideo.url;
    const quality = selectedVideo.quality || 'Unknown';
    const fileSizeMB = sizes?.[qualityIndex] || 0;
    const sizeLabel = fileSizeMB > 0 ? ` · ${formatSize(fileSizeMB)}` : '';
    const caption = `🎬 *${escapeMarkdown(title)}*\n📊 ${escapeMarkdown(quality)}${sizeLabel}`;

    try {
        await editMsg(`📥 Sending${sizeLabel ? ` ${sizeLabel.trim()}` : ''}...`);

        // Give Telegram our proxy URL — Telegram fetches it server-side,
        // our /proxy endpoint streams from the real source.
        // This bypasses the 50MB bot-library streaming limit entirely.
        await bot.sendVideo(chatId, proxyUrl(videoUrl), {
            caption,
            parse_mode: 'Markdown',
            supports_streaming: true,
        });

        try { await bot.deleteMessage(chatId, statusMsgId); } catch (_) {}

        await bot.sendMessage(chatId,
            `✅ *Done!* — ${escapeMarkdown(quality)}${sizeLabel}`,
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        console.error('Download error:', error.message);
        // Last resort: direct download button
        await editMsg(
            `⚠️ *Couldn't send directly*\n\nQuality: ${escapeMarkdown(quality)}${sizeLabel}\n\nUse the button below:`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '⬇️ Download Now', url: videoUrl }]]
                }
            }
        );
    }
};

const cancelSelection = async (bot, chatId, storeKey, callbackQueryId, statusMsgId) => {
    delete pendingSelections[storeKey];
    await bot.answerCallbackQuery(callbackQueryId, { text: 'Cancelled.' });
    try {
        await bot.editMessageText('❌ Download cancelled.', {
            chat_id: chatId,
            message_id: parseInt(statusMsgId)
        });
    } catch (_) {}
};

module.exports = { fetchAndShowQualities, downloadSelectedQuality, cancelSelection };
