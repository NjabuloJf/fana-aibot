const fs = require('fs');
const config = require('../config');
const { storage } = require('../storage');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, isGroup, args } = context;
    
    try {
        if (!isGroup) {
            return await reply(config.GROUP_ONLY);
        }
        
        const groupMetadata = await sock.groupMetadata(chatId);
        const isAdmin = groupMetadata.participants.find(p => p.id === senderId)?.admin;
        
        if (!isAdmin && senderId !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            return await reply(config.ADMIN_ONLY);
        }
        
        await react('👋');
        
        const currentSettings = await storage.getWelcomeSettings(chatId);
        
        if (!args[0]) {
            const statusMessage = `👋 *WELCOME SETTINGS* 👋

Current Status: ${currentSettings.enabled ? '✅ Enabled' : '❌ Disabled'}
Template: ${currentSettings.welcomeTemplate || 'default'}
Goodbye: ${currentSettings.goodbyeEnabled ? '✅ Enabled' : '❌ Disabled'}

*Usage:*
• ${config.PREFIX}welcome on - Enable welcome
• ${config.PREFIX}welcome off - Disable welcome
• ${config.PREFIX}welcome test - Test welcome message

${config.BOT_FOOTER}`;
            
            return await reply(statusMessage);
        }
        
        const action = args[0].toLowerCase();
        
        switch (action) {
            case 'on':
            case 'enable':
                await storage.saveWelcomeSettings(chatId, { 
                    enabled: true,
                    welcomeTemplate: 'default'
                });
                await reply(`✅ Welcome messages enabled for this group!`);
                break;
                
            case 'off':
            case 'disable':
                await storage.saveWelcomeSettings(chatId, { enabled: false });
                await reply(`❌ Welcome messages disabled for this group!`);
                break;
                
            case 'test':
                const testMessage = `🎉 *TEST WELCOME MESSAGE* 🎉

Hello @${senderId.split('@')[0]}! 👋

Welcome to *${groupMetadata.subject}*!

📋 *Group Rules:*
• Be respectful to all members
• No spam or inappropriate content
• Use ${config.PREFIX} as command prefix
• Have fun and enjoy! 🎊

Type ${config.PREFIX}menu to see available commands!

${config.BOT_FOOTER}`;

                await sock.sendMessage(chatId, {
                    text: testMessage,
                    mentions: [senderId]
                });
                break;
                
            default:
                await reply(`❌ Invalid option! Use: on, off, or test`);
        }
        
    } catch (error) {
        await reply('❌ Error managing welcome settings!');
    }
};

module.exports = {
    nomCom: "welcome",
    reaction: '👋',
    categorie: "admin",
    adminOnly: true,
    groupOnly: true,
    execute: fana
};
