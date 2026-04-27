const fs = require('fs');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, isGroup } = context;
    
    try {
        if (!isGroup) {
            return await reply(config.GROUP_ONLY);
        }
        
        const groupMetadata = await sock.groupMetadata(chatId);
        const isAdmin = groupMetadata.participants.find(p => p.id === senderId)?.admin;
        
        if (!isAdmin && senderId !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            return await reply(config.ADMIN_ONLY);
        }
        
        await react('⬇️');
        
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        
        let targetUser = null;
        
        if (quotedMessage) {
            targetUser = message.message.extendedTextMessage.contextInfo.participant;
        } else if (mentionedJid && mentionedJid.length > 0) {
            targetUser = mentionedJid[0];
        }
        
        if (!targetUser) {
            return await reply('❌ Please reply to a message or mention a user to demote!');
        }
        
        const targetIsAdmin = groupMetadata.participants.find(p => p.id === targetUser)?.admin;
        
        if (!targetIsAdmin) {
            return await reply('❌ User is not an admin!');
        }
        
        await sock.groupParticipantsUpdate(chatId, [targetUser], 'demote');
        
        const demoteMessage = `⬇️ *USER DEMOTED* ⬇️

@${targetUser.split('@')[0]} has been demoted from admin.

👤 Now a regular member
📋 Please continue following group rules

Demoted by: @${senderId.split('@')[0]}

${config.BOT_FOOTER}`;

        await sock.sendMessage(chatId, {
            text: demoteMessage,
            mentions: [targetUser, senderId]
        });
        
    } catch (error) {
        await reply('❌ Error demoting user! Make sure I have admin permissions.');
    }
};

module.exports = {
    nomCom: "demote",
    reaction: '⬇️',
    categorie: "admin",
    adminOnly: true,
    groupOnly: true,
    execute: fana
};
