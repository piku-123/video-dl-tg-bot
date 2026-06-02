const TOKEN = process.env.TOKEN || 'YOUR_BOT_TOKEN_HERE';
const BOT_USERNAME = process.env.BOT_USERNAME || 'Zeroex Video Downloader';
const DL_API = process.env.DL_API || 'https://zeroex-all-rest-api.onrender.com/api/dl/download?url=';

module.exports = {
    TOKEN,
    BOT_USERNAME,
    DL_API
};
