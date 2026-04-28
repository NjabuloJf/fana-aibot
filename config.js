module.exports = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_TYPING: 'true',
    AUTO_WELCOME: 'true', 
    AUTO_ANTILINK: 'true', 
    AUTO_UPDATE_BOT: 'true',
    AUTO_JOIN_GROUP: 'true',        // Added missing value and colon
    AUTO_JOIN_CHANNEL: 'true',      // Added missing value and colon
    AUTO_LIKE_EMOJI: ['🌸', '🪴', '💫', '🍂', '🌟','🫀', '👀', '🤖', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/your-group-link',  // Add your group link
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: './media/images/',                                    // Added path
    NEWSLETTER_JID: '120363123456789012@newsletter',                  // Add your newsletter JID
    NEWSLETTER_MESSAGE_ID: '',
    OTP_EXPIRY: 300000,
    NEWS_JSON_URL: 'https://newsapi.org/v2/top-headlines',           // Added news API URL
    BOT_NAME: 'Fana AI Bot',                                         // Added bot name
    OWNER_NAME: 'Fana AI',                                           // Added owner name
    OWNER_NUMBER: '1234567890',                                      // Add your WhatsApp number
    BOT_VERSION: '1.0.0',
    BOT_FOOTER: '© 2024 Fana AI Bot - Powered by AI',               // Added footer
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VaAkETLLY6d8qhLmZt2v',  // Updated channel link
    
    // ========== ADDITIONAL SETTINGS ==========
    PORT: process.env.PORT || 3000,
    
    // ========== MESSAGES ==========
    WELCOME_MESSAGE: `🎉 *Welcome @user!* 🎉

Hello! Welcome to our group! 👋
Type .menu to see available commands!`,

    GOODBYE_MESSAGE: `👋 *Goodbye @user!*
Thanks for being part of our group!`,

    ANTILINK_WARNING: `⚠️ *Link Detected!* ⚠️
Links are not allowed in this group!`,

    // ========== ERROR MESSAGES ==========
    COMMAND_NOT_FOUND: '❓ Command not found! Type .menu to see commands.',
    NO_PERMISSION: '🚫 You don\'t have permission!',
    OWNER_ONLY: '👑 Owner only command!',
    ADMIN_ONLY: '👮‍♂️ Admin only command!',
    GROUP_ONLY: '👥 Group only command!',
    
    // ========== SUCCESS MESSAGES ==========
    SUCCESS: '✅ Success!',
    PROCESSING: '⏳ Processing...',
    DONE: '✅ Done!'
}; // ← ADD THIS CLOSING BRACE AND SEMICOLON
