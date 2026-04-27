const fs = require('fs');
const config = require('../config');
const { storage } = require('../storage');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, isGroup, args } = context;
    
    try {
        if (senderId !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            return await reply(config.OWNER_ONLY);
        }
        
        await react('⚙️');
        
        if (!args[0]) {
            const settingsMessage = `⚙️ *BOT SETTINGS* ⚙️

📊 *Current Settings:*
• Auto View Status: ${config.AUTO_VIEW_STATUS}
• Auto Like Status: ${config.AUTO_LIKE_STATUS}
• Auto Typing: ${config.AUTO_TYPING}
• Auto Welcome: ${config.AUTO_WELCOME}
• Auto Antilink: ${config.AUTO_ANTILINK}
• Auto Join Group: ${config.AUTO_JOIN_GROUP}
• Auto Join Channel: ${config.AUTO_JOIN_CHANNEL}

*Usage:*
• ${config.PREFIX}setting view - Toggle auto view status
• ${config.PREFIX}setting like - Toggle auto like status
• ${config.PREFIX}setting typing - Toggle auto typing
• ${config.PREFIX}setting welcome - Toggle auto welcome
• ${config.PREFIX}setting antilink - Toggle auto antilink

${config.BOT_FOOTER}`;
            
            return await reply(settingsMessage);
        }
        
        const setting = args[0].toLowerCase();
        let currentValue, newValue, settingName;
        
        switch (setting) {
            case 'view':
            case 'status':
                currentValue = await storage.getSetting('AUTO_VIEW_STATUS', config.AUTO_VIEW_STATUS);
                newValue = currentValue === 'true' ? 'false' : 'true';
                await storage.saveSetting('AUTO_VIEW_STATUS', newValue);
                settingName = 'Auto View Status';
                break;
                
            case 'like':
                currentValue = await storage.getSetting('AUTO_LIKE_STATUS', config.AUTO_LIKE_STATUS);
                newValue = currentValue === 'true' ? 'false' : 'true';
                await storage.saveSetting('AUTO_LIKE_STATUS', newValue);
                settingName = 'Auto Like Status';
                break;
                
            case 'typing':
                currentValue = await storage.getSetting('AUTO_TYPING', config.AUTO_TYPING);
                newValue = currentValue === 'true' ? 'false' : 'true';
                await storage.saveSetting('AUTO_TYPING', newValue);
                settingName = 'Auto Typing';
                break;
                
            case 'welcome':
                currentValue = await storage.getSetting('AUTO_WELCOME', config.AUTO_WELCOME);
                newValue = currentValue === 'true' ? 'false' : 'true';
                await storage.saveSetting('AUTO_WELCOME', newValue);
                settingName = 'Auto Welcome';
                break;
                
            case 'antilink':
                currentValue = await storage.getSetting('AUTO_ANTILINK', config.AUTO_ANTILINK);
                newValue = currentValue === 'true' ? 'false' : 'true';
                await storage.saveSetting('AUTO_ANTILINK', newValue);
                settingName = 'Auto Antilink';
                break;
                
            default:
                return await reply('❌ Invalid setting! Use: view, like, typing, welcome, antilink');
        }
        
        const resultMessage = `✅ *SETTING UPDATED* ✅

Setting: ${settingName}
Previous: ${currentValue === 'true' ? '✅ Enabled' : '❌ Disabled'}
Current: ${newValue === 'true' ? '✅ Enabled' : '❌ Disabled'}

${newValue === 'true' ? 
    `🟢 ${settingName} is now enabled!` : 
    `🔴 ${settingName} is now disabled!`
}

${config.BOT_FOOTER}`;

        await reply(resultMessage);
        
    } catch (error) {
        await reply('❌ Error updating settings!');
    }
};

module.exports = {
    nomCom: "setting",
    aliases: ["settings", "config"],
    reaction: '⚙️',
    categorie: "owner",
    ownerOnly: true,
    execute: fana
};
