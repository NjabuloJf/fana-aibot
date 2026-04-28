const fs = require('fs');
const config = require('../config');
const { exec } = require('child_process');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId } = context;
    
    try {
        if (senderId !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            return await reply(config.OWNER_ONLY);
        }
        
        await react('🔄');
        
        const updateMessage = `🔄 *UPDATING BOT* 🔄

⏳ Checking for updates...
📦 Current Version: ${config.BOT_VERSION}

Please wait...`;

        const sentMsg = await reply(updateMessage);
        
        exec('git pull origin main', async (error, stdout, stderr) => {
            try {
                if (error) {
                    const errorMsg = `❌ *UPDATE FAILED* ❌

Error: ${error.message}

${config.BOT_FOOTER}`;
                    return await reply(errorMsg);
                }
                
                const successMsg = `✅ *UPDATE COMPLETED* ✅

📦 Bot updated successfully!
🔄 Restarting bot...

Changes:
${stdout || 'No changes detected'}

${config.BOT_FOOTER}`;

                await reply(successMsg);
                
                // Restart the bot
                setTimeout(() => {
                    process.exit(0);
                }, 3000);
                
            } catch (err) {
                await reply('❌ Error during update process!');
            }
        });
        
    } catch (error) {
        await reply('❌ Error updating bot!');
    }
};

module.exports = {
    nomCom: "update",
    reaction: '🔄',
    categorie: "owner",
    ownerOnly: true,
    execute: fana
};
