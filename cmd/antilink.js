const fs = require('fs');
const config = require('../config');
const { storage } = require('../storage');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, isGroup } = context;
    
    try {
        if (!isGroup) {
            return await reply(config.GROUP_ONLY);
        }
        
        const isAdmin = await sock.groupMetadata(chatId).then(meta => 
            meta.participants.find(p => p.id === senderId)?.admin
        );
        
        if (!isAdmin && senderId !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            return await reply(config.ADMIN_ONLY);
        }
        
        await react('🔗');
        
        const currentSettings = await storage.getAntilinkSettings(chatId);
        const newStatus = !currentSettings.enabled;
        
        await storage.saveAntilinkSettings(chatId, { 
            enabled: newStatus,
            action: 'delete'
        });
        
        const statusMessage = `🔗 *ANTILINK ${newStatus ? 'ENABLED' : 'DISABLED'}* 🔗

Status: ${newStatus ? '✅ Active' : '❌ Inactive'}
Action: Delete message
Group: ${chatId.split('@')[0]}

${newStatus ? '⚠️ Links will be automatically deleted!' : '💡 Links are now allowed in this group.'}

${config.BOT_FOOTER}`;

        await reply(statusMessage);
        
    } catch (error) {
        await reply('❌ Error toggling antilink!');
    }
};

module.exports = {
    nomCom: "antilink",
    reaction: '🔗',
    categorie: "admin",
    adminOnly: true,
    groupOnly: true,
    execute: fana
};
