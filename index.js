const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { TOKEN, BOT_USERNAME } = require('./config');

const bot = new TelegramBot(TOKEN, { polling: true });

// Load commands
require('./commands/start')(bot);
require('./commands/help')(bot);
require('./commands/download')(bot);

console.log('✅ Video Downloader Bot is running...');

// Express server for health checks / uptime monitoring
const app = express();
app.get('/', (req, res) => res.send('Telegram Video Downloader Bot is running!'));
app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// Global error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
