const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const { TOKEN } = require('./config');

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();

// ── Proxy endpoint ────────────────────────────────────────────────────────────
// Telegram calls this URL, we stream the real video from source.
// This bypasses the 50MB bot-library limit because Telegram fetches directly.
app.get('/proxy', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send('Missing url');

    try {
        const upstream = await axios.get(videoUrl, {
            responseType: 'stream',
            timeout: 300000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });

        // Forward content-type and content-length if available
        const ct = upstream.headers['content-type'] || 'video/mp4';
        const cl = upstream.headers['content-length'];
        res.setHeader('Content-Type', ct);
        if (cl) res.setHeader('Content-Length', cl);
        res.setHeader('Content-Disposition', 'inline; filename="video.mp4"');

        upstream.data.pipe(res);

        upstream.data.on('error', (err) => {
            console.error('Proxy stream error:', err.message);
            if (!res.headersSent) res.status(500).send('Stream error');
        });
    } catch (err) {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) res.status(502).send('Failed to fetch video');
    }
});

// ── Export app so downloader can build proxy URLs ─────────────────────────────
module.exports.app = app;

// ── Load commands ─────────────────────────────────────────────────────────────
require('./commands/start')(bot);
require('./commands/help')(bot);
require('./commands/download')(bot);

console.log('✅ Video Downloader Bot is running...');

// ── Web server ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Telegram Video Downloader Bot is running!'));
app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled Rejection:', reason); });
