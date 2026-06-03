const { fetchAndShowQualities, downloadSelectedQuality, cancelSelection } = require('../utils/downloader');

const urlRegex = /(https?:\/\/[^\s]+)/g;

module.exports = (bot) => {

    // ── 1. Detect URL in any message ────────────────────────────────────────
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text || text.startsWith('/')) return;

        const urls = text.match(urlRegex);
        if (!urls || urls.length === 0) return;

        const videoUrl = urls[0];

        const statusMsg = await bot.sendMessage(chatId, `🔍 Processing link...\n${videoUrl}`);
        await fetchAndShowQualities(bot, chatId, videoUrl, statusMsg.message_id);
    });

    // ── 2. Handle inline keyboard button presses ─────────────────────────────
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const callbackQueryId = query.id;

        // Cancel button: dl_cancel_chatId_msgId
        if (data.startsWith('dl_cancel_')) {
            const storeKey = data.replace('dl_cancel_', '');
            const msgId = storeKey.split('_')[1];
            await cancelSelection(bot, chatId, storeKey, callbackQueryId, msgId);
            return;
        }

        // Download button: dl_chatId_msgId_qualityIndex
        if (data.startsWith('dl_')) {
            const parts = data.split('_');
            // data format: "dl_{chatId}_{msgId}_{index}"
            const qualityIndex = parseInt(parts[parts.length - 1]);
            const storeKey = parts.slice(1, parts.length - 1).join('_');
            await downloadSelectedQuality(bot, chatId, storeKey, qualityIndex, callbackQueryId);
            return;
        }
    });
};
