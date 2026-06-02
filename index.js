const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { TOKEN, BOT_USERNAME } = require('./config');

// বট ইনিশিয়ালাইজ
const bot = new TelegramBot(TOKEN, { polling: true });

// কমান্ড লোড
require('./commands/start')(bot);
require('./commands/help')(bot);
require('./commands/download')(bot);

console.log('✅ ডাউনলোড বট চালু হয়েছে...');

// এক্সপ্রেস সার্ভার (অপশনাল - হেলথ চেকের জন্য)
const app = express();
app.get('/', (req, res) => {
    res.send('Telegram Download Bot is running!');
});
app.get('/ping', (req, res) => {
    res.send('pong');
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 ওয়েব সার্ভার চলছে পোর্ট ${PORT} এ`);
});

// অনাকাঙ্ক্ষিত error হ্যান্ডলিং
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});
