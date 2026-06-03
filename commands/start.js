module.exports = (bot) => {
    bot.onText(/\/start/, (msg) => {
        const firstName = msg.from.first_name || 'there';
        const welcomeText =
            `👋 Hey ${firstName}!\n\n` +
            `I'm a video downloader bot. Just send me any video link and I'll let you pick the quality, then send it right to you.\n\n` +
            `📌 Supported platforms: Instagram (Reels, Posts), YouTube (Shorts), Twitter/X, Facebook, TikTok, and more.\n\n` +
            `📤 Supports files up to *2 GB*\n\n` +
            `🔗 Just paste a link to get started.\n` +
            `ℹ️ Help: /help`;
        bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown' });
    });
};
