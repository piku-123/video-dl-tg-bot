const axios = require('axios');
const { DL_API } = require('../config');

// In-memory store: maps "chatId_msgId" -> quality options
const pendingSelections = {};

// Escape only chars that break Telegram Markdown v1
const escapeMarkdown = (text) => {
    return (text || '').replace(/[_*`\[]/g, '\\$&');
};

// Try to get file size via HEAD request (returns MB or 0 if unavailable)
const getFileSizeMB = async (url) => {
    try {
        const res = await axios.head(url, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const bytes = parseInt(res.headers['content-length'] || '0');
        return bytes > 0 ? bytes / (1024 * 1024) : 0;
    } catch (_) {
        return 0;
    }
};

// Format size for display
const formatSize = (mb) => {
    if (mb <= 0) return null;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

/**
 * Fetch available qualities from API and show inline keyboard to user.
 * Attempts to show file size on each quality button.
 */
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

        if (videoLinks.length === 0) {
            throw new Error('No video format links found. Try a different URL.');
        }

        const title = data.title || 'Video';

        await editMsg('📊 Checking file sizes...');

        // Try to get size for each quality in parallel
        const sizes = await Promise.all(videoLinks.map(link => getFileSizeMB(link.url)));

        // Store with sizes
        const storeKey = `${chatId}_${statusMsgId}`;
        pendingSelections[storeKey] = { videoLinks, sizes, title, url };

        // Build keyboard with size info
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

/**
 * Stream video directly from source URL and pipe to Telegram.
 * Works for all sizes — no intermediate file, no temp storage.
 * For DASH/stream URLs where content-length is unavailable, still streams fine.
 */
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
        await editMsg(`📥 Downloading${sizeLabel ? ` ${sizeLabel.trim()}` : ''}...`);

        // Stream directly from source and pipe to Telegram — no temp file
        const videoStream = await axios.get(videoUrl, {
            responseType: 'stream',
            timeout: 300000, // 5 min timeout for large files
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': new URL(url).origin,
            }
        });

        await bot.sendVideo(chatId, videoStream.data, {
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

        // Fallback: give direct link if streaming fails
        await editMsg(
            `⚠️ *Couldn't send directly*\n\n` +
            `Quality: ${escapeMarkdown(quality)}${sizeLabel}\n\n` +
            `Use the button below to download manually:`,
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
