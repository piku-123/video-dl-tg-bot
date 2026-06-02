const axios = require('axios');
const { DL_API } = require('../config');

const downloadAndSendVideo = async (bot, chatId, url, statusMsgId = null) => {
    const editMsg = async (text) => {
        if (statusMsgId) {
            await bot.editMessageText(text, { chat_id: chatId, message_id: statusMsgId });
        } else {
            const msg = await bot.sendMessage(chatId, text);
            return msg.message_id;
        }
    };

    try {
        await editMsg('⏳ লিংক প্রসেস করা হচ্ছে...');

        const apiUrl = `${DL_API}${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, { timeout: 30000 });

        if (!response.data?.status) {
            throw new Error(response.data?.message || 'API রেসপন্স সঠিক নয়');
        }

        const data = response.data.data;
        if (!data || !data.links || !data.links.length) {
            throw new Error('API থেকে কোনো লিংক পাওয়া যায়নি');
        }

        // ১) ভিডিও লিংক নির্বাচন: প্রথমে HD, তারপর SD, যে কোনো ভিডিও
        const videoLinks = data.links.filter(link => {
            const type = (link.type || '').toLowerCase();
            return type === 'video' || type === 'mp4';
        });

        if (videoLinks.length === 0) {
            throw new Error('ভিডিও টাইপের লিংক খুঁজে পাওয়া যায়নি');
        }

        // HD কে প্রাধান্য দাও (quality 'HD' অথবা '720p' বা উচ্চ রেজোলিউশন)
        let selectedVideo = videoLinks.find(link => link.quality === 'HD' || link.quality === '720p');
        if (!selectedVideo) {
            selectedVideo = videoLinks.find(link => link.quality === 'SD');
        }
        if (!selectedVideo) {
            selectedVideo = videoLinks[0]; // ডিফল্ট প্রথমটা
        }

        const videoUrl = selectedVideo.url;
        const title = data.title || 'ভিডিও';
        const caption = `${title}\n\n🔗 উৎস: ${url}`;

        // ২) সাইজ চেক (হেডার রিকোয়েস্ট)
        await editMsg('📊 ভিডিওর সাইজ চেক করা হচ্ছে...');
        let fileSizeMB = 0;
        try {
            const headRes = await axios.head(videoUrl, { timeout: 10000 });
            const fileSizeBytes = parseInt(headRes.headers['content-length'] || '0');
            fileSizeMB = fileSizeBytes / (1024 * 1024);
        } catch (e) {
            console.warn('সাইজ চেক ব্যর্থ, ধরে নিচ্ছি ৫০ এমবির কম');
        }

        if (fileSizeMB > 0 && fileSizeMB > 50) {
            const linkMsg = `⚠️ ভিডিওটির সাইজ ${fileSizeMB.toFixed(2)} MB, যা টেলিগ্রামের ৫০ MB সীমা অতিক্রম করে।\n\nডাউনলোড লিংক নিচে দেওয়া হলো:\n${videoUrl}`;
            await editMsg(linkMsg);
            return;
        }

        // ৩) সরাসরি ভিডিও পাঠানো
        await editMsg('📥 ভিডিও ডাউনলোড করে পাঠানো হচ্ছে...');
        const videoStream = await axios.get(videoUrl, { responseType: 'stream', timeout: 60000 });
        await bot.sendVideo(chatId, videoStream.data, {
            caption: caption,
            supports_streaming: true,
        });

        if (statusMsgId) await bot.deleteMessage(chatId, statusMsgId);

    } catch (error) {
        console.error('Download error:', error.message);
        const errorText = `❌ ডাউনলোড ব্যর্থ:\n${error.message}\n\nআবার চেষ্টা করুন।`;
        if (statusMsgId) {
            await bot.editMessageText(errorText, { chat_id: chatId, message_id: statusMsgId });
        } else {
            await bot.sendMessage(chatId, errorText);
        }
    }
};

module.exports = { downloadAndSendVideo };
