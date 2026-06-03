module.exports = (bot) => {
    bot.onText(/\/help/, (msg) => {
        const helpText =
            `📖 *How to use:*\n\n` +
            `1️⃣ Copy the link of the video you want to download.\n` +
            `2️⃣ Paste it into this chat and send.\n` +
            `3️⃣ Choose your preferred quality from the list.\n` +
            `4️⃣ The bot will send the video file directly to you.\n\n` +
            `⚙️ *Commands:*\n` +
            `/start — Welcome message\n` +
            `/help — This help message\n\n` +
            `📦 *File size limits:*\n` +
            `• Under 50 MB → sent instantly\n` +
            `• 50 MB – 2 GB → uploaded via Telegram servers (may take a moment)\n` +
            `• Over 2 GB → direct download link provided\n\n` +
            `⚠️ Large videos may take a few seconds to process. Please be patient.`;
        bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    });
};
