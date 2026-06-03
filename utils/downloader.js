const axios = require('axios');
const { DL_API } = require('../config');

// In-memory store: maps "chatId_msgId" -> array of quality options
const pendingSelections = {};

/**
 * Fetch available qualities from API and show inline keyboard to user.
 */
const fetchAndShowQualities = async (bot, chatId, url, statusMsgId) => {
    const editMsg = async (text, options = {}) => {
        try {
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: statusMsgId,
                ...options
            });
        } catch (e) {
            console.error('editMsg error:', e.message);
        }
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

        // Filter video links only
        const videoLinks = data.links.filter(link => {
            const type = (link.type || '').toLowerCase();
            return type === 'video' || type === 'mp4';
        });

        if (videoLinks.length === 0) {
            throw new Error('No video format links found. Try a different URL.');
        }

        const title = data.title || 'Video';

        // Store options keyed by chatId + statusMsgId
        const storeKey = `${chatId}_${statusMsgId}`;
        pendingSelections[storeKey] = { videoLinks, title, url };

        // Build inline keyboard — one button per quality
        const keyboard = videoLinks.map((link, index) => {
            const quality = link.quality || `Option ${index + 1}`;
            const type = link.type?.toUpperCase() || 'VIDEO';
            return [{ text: `📥 ${quality} (${type})`, callback_data: `dl_${storeKey}_${index}` }];
        });

        // Add cancel button
        keyboard.push([{ text: '❌ Cancel', callback_data: `dl_cancel_${storeKey}` }]);

        await editMsg(
            `🎬 *${escapeMarkdown(title)}*\n\n` +
            `Choose a quality to download:`,
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }
        );

    } catch (error) {
        console.error('Fetch error:', error.message);
        await editMsg(`❌ *Failed to process link*\n\n${error.message}\n\nPlease try again.`, {
            parse_mode: 'Markdown'
        });
    }
};

/**
 * Download selected quality and send to user.
 * Handles files up to 2GB using Telegram's URL-based sendVideo/sendDocument.
 */
const downloadSelectedQuality = async (bot, chatId, storeKey, qualityIndex, callbackQueryId) => {
    const entry = pendingSelections[storeKey];

    if (!entry) {
        await bot.answerCallbackQuery(callbackQueryId, { text: '⚠️ Session expired. Please send the link again.' });
        return;
    }

    const { videoLinks, title, url } = entry;
    const selectedVideo = videoLinks[qualityIndex];

    if (!selectedVideo) {
        await bot.answerCallbackQuery(callbackQueryId, { text: '⚠️ Invalid selection.' });
        return;
    }

    // Clean up stored selection
    delete pendingSelections[storeKey];

    // Acknowledge the callback
    await bot.answerCallbackQuery(callbackQueryId, { text: '⏳ Processing your download...' });

    // Parse statusMsgId from storeKey: "chatId_msgId"
    const statusMsgId = parseInt(storeKey.split('_')[1]);

    const editMsg = async (text, options = {}) => {
        try {
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: statusMsgId,
                ...options
            });
        } catch (e) {
            console.error('editMsg error:', e.message);
        }
    };

    const videoUrl = selectedVideo.url;
    const quality = selectedVideo.quality || 'Unknown';
    const caption = `🎬 *${escapeMarkdown(title)}*\n📊 Quality: ${quality}\n🔗 Source: ${url}`;

    try {
        await editMsg('📊 Checking file size...');

        // Check file size via HEAD request
        let fileSizeMB = 0;
        try {
            const headRes = await axios.head(videoUrl, { timeout: 15000 });
            const bytes = parseInt(headRes.headers['content-length'] || '0');
            fileSizeMB = bytes / (1024 * 1024);
        } catch (e) {
            console.warn('Size check failed, proceeding anyway...');
        }

        console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);

        if (fileSizeMB > 50) {
            // Over 50MB — don't stream, just send direct link
            // Avoids server load and Telegram URL fetch failures
            const sizeText = fileSizeMB > 0 ? `📦 Size: ${fileSizeMB.toFixed(2)} MB\n` : '';
            await editMsg(
                `🎬 *${escapeMarkdown(title)}*\n` +
                `📊 Quality: ${escapeMarkdown(quality)}\n` +
                `${sizeText}\n` +
                `⚠️ File is too large to send directly.\n` +
                `Tap the button below to download:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬇️ Download Now', url: videoUrl }
                        ]]
                    }
                }
            );
            return;
        }

        // Under 50MB — stream directly
        await editMsg('📥 Downloading and sending...');
        const videoStream = await axios.get(videoUrl, {
            responseType: 'stream',
            timeout: 120000
        });
        await bot.sendVideo(chatId, videoStream.data, {
            caption,
            parse_mode: 'Markdown',
            supports_streaming: true,
        });

        // Delete status message after successful send
        try {
            await bot.deleteMessage(chatId, statusMsgId);
        } catch (_) {}

        // Send success summary
        const sizeText = fileSizeMB > 0 ? ` (${fileSizeMB.toFixed(2)} MB)` : '';
        await bot.sendMessage(chatId,
            `✅ *Done!*\n📊 Quality: ${quality}${sizeText}`,
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        console.error('Download error:', error.message);
        await editMsg(
            `❌ *Download Failed*\n\n${error.message}\n\nTry again or use the direct link:\n${videoUrl}`,
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle cancel button press.
 */
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

// Escape only the characters that break Telegram's Markdown v1 parser
const escapeMarkdown = (text) => {
    return (text || '').replace(/[_*`\[]/g, '\\$&');
};

module.exports = {
    fetchAndShowQualities,
    downloadSelectedQuality,
    cancelSelection
};
