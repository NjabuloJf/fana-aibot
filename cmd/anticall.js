const fs = require('fs');
const config = require('../config');
const { storage } = require('../storage');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId } = context;
    
    try {
        if (senderId !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            return await reply(config.OWNER_ONLY);
        }
        
        await react('📞');
        
        const currentSettings = await storage.getSetting('anticallSettings', {
            enabled: true,
            action: 'reject',
            blockCaller: false
        });
        
        const newStatus = !currentSettings.enabled;
        
        await storage.saveSetting('anticallSettings', {
            ...currentSettings,
            enabled: newStatus
        });
        
        const anticallMessage = `📞 *ANTI-CALL ${newStatus ? 'ENABLED' : 'DISABLED'}* 📞

Status: ${newStatus ? '✅ Active' : '❌ Inactive'}
Action: ${currentSettings.action}
Block Caller: ${currentSettings.blockCaller ? '✅ Yes' : '❌ No'}

${newStatus ? 
    '🚫 Incoming calls will be automatically rejected!' : 
    '📞 Incoming calls are now allowed.'
}

*Settings:*
• ${config.PREFIX}anticall - Toggle on/off
• Action: Reject call and send message
• Auto-block: Disabled

${config.BOT_FOOTER}`;

        await reply(anticallMessage);
        
    } catch (error) {
        await reply('❌ Error toggling anti-call!');
    }
};

module.exports = {
    nomCom: "anticall",
    reaction: '📞',
    categorie: "owner",
    ownerOnly: true,
    execute: fana
};
