const { downloadAndSendVideo } = require('../utils/downloader');

// URL ডিটেক্ট করার রেজেক্স (সাধারণ ওয়েব লিংক)
const urlRegex = /(https?:\/\/[^\s]+)/g;

module.exports = (bot) => {
    // যেকোনো মেসেজে URL খোঁজা
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        // কমান্ড ইগনোর করো
        if (!text || text.startsWith('/')) return;

        // URL বের করা
        const urls = text.match(urlRegex);
        if (!urls || urls.length === 0) return;

        // প্রথম URL নেওয়া
        const videoUrl = urls[0];

        // প্রসেসিং বার্তা
        const statusMsg = await bot.sendMessage(chatId, `🔍 লিংক প্রসেস করা হচ্ছে:\n${videoUrl}`);

        // ডাউনলোড ও সেন্ড
        await downloadAndSendVideo(bot, chatId, videoUrl, statusMsg.message_id);
    });
};
