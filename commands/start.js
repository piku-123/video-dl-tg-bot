module.exports = (bot) => {
    bot.onText(/\/start/, (msg) => {
        const firstName = msg.from.first_name || 'বন্ধু';
        const welcomeText = 
            `👋 হ্যালো ${firstName}!\n\n` +
            `আমি একটি ডাউনলোড বট। যেকোনো সোশ্যাল মিডিয়া ভিডিওর লিংক পাঠালেই আমি সেটি ডাউনলোড করে ভিডিও ফাইল আকারে পাঠিয়ে দেব।\n\n` +
            `📌 সমর্থিত প্ল্যাটফর্ম: ইনস্টাগ্রাম (রিল, পোস্ট, রিলস), ইউটিউব (শর্টস সহ), টুইটার, ফেসবুক ইত্যাদি (API যেটা সাপোর্ট করে) \n\n` +
            `🔗 শুধু লিংক পাঠান।\n` +
            `ℹ️ সাহায্য: /help`;
        bot.sendMessage(msg.chat.id, welcomeText);
    });
};
