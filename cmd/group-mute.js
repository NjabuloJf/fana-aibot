const fs = require('fs');
const config = require('../config');
const { GroupUtils } = require('../data/group-handler');
const moment = require('moment-timezone');

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
        
        await react('🔇');
        
        const action = args[0]?.toLowerCase();
        
        if (!action || !['mute', 'unmute'].includes(action)) {
            const helpMessage = `🔇 *GROUP MUTE COMMANDS* 🔇

*Usage:*
• ${config.PREFIX}group-mute mute @user [time] [reason]
• ${config.PREFIX}group-mute unmute @user

*Examples:*
• ${config.PREFIX}group-mute mute @user 1h Spamming
• ${config.PREFIX}group-mute mute @user Inappropriate behavior
• ${config.PREFIX}group-mute unmute @user

*Time formats:*
• 30s = 30 seconds
• 5m = 5 minutes  
• 1h = 1 hour
• 1d = 1 day

${config.BOT_FOOTER}`;
            
            return await reply(helpMessage);
        }
        
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        
        let targetUser = null;
        
        if (quotedMessage) {
            targetUser = message.message.extendedTextMessage.contextInfo.participant;
        } else if (mentionedJid && mentionedJid.length > 0) {
            targetUser = mentionedJid[0];
        }
        
        if (!targetUser) {
            return await reply('❌ Please reply to a message or mention a user!');
        }
        
        if (targetUser === senderId) {
            return await reply('❌ You cannot mute/unmute yourself!');
        }
        
        const targetIsAdmin = groupMetadata.participants.find(p => p.id === targetUser)?.admin;
        if (targetIsAdmin && senderId !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            return await reply('❌ You cannot mute/unmute other admins!');
        }
        
        if (action === 'mute') {
            // Check if already muted
            if (GroupUtils.isUserMuted(targetUser, chatId)) {
                return await reply('❌ User is already muted!');
            }
            
            // Parse duration
            let duration = null;
            let reason = 'No reason provided';
            
            if (args[1]) {
                const timeArg = args[1];
                const timeMatch = timeArg.match(/^(\d+)([smhd])$/);
                
                if (timeMatch) {
                    const value = parseInt(timeMatch[1]);
                    const unit = timeMatch[2];
                    
                    switch (unit) {
                        case 's': duration = value * 1000; break;
                        case 'm': duration = value * 60 * 1000; break;
                        case 'h': duration = value * 60 * 60 * 1000; break;
                        case 'd': duration = value * 24 * 60 * 60 * 1000; break;
                    }
                    
                    reason = args.slice(2).join(' ') || reason;
                } else {
                    reason = args.slice(1).join(' ') || reason;
                }
            }
            
            // Mute user
            const success = await GroupUtils.muteUser(targetUser, chatId, reason, senderId, duration);
            
            if (success) {
                const durationText = duration ? moment.duration(duration).humanize() : 'indefinitely';
                
                const muteMessage = `🔇 *USER MUTED* 🔇

@${targetUser.split('@')[0]} has been muted for ${durationText}.

📋 *Details:*
• Reason: ${reason}
• Muted by: @${senderId.split('@')[0]}
• Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}
${duration ? `• Expires: ${moment().add(duration, 'ms').format('DD/MM/YYYY HH:mm:ss')}` : '• Duration: Permanent'}

${config.BOT_FOOTER}`;

                await sock.sendMessage(chatId, {
                    text: muteMessage,
                    mentions: [targetUser, senderId]
                });
            } else {
                await reply('❌ Failed to mute user!');
            }
            
        } else if (action === 'unmute') {
            // Check if user is muted
            if (!GroupUtils.isUserMuted(targetUser, chatId)) {
                return await reply('❌ User is not muted!');
            }
            
            // Get mute info
            const muteInfo = GroupUtils.getMuteInfo(targetUser, chatId);
            
            // Unmute user
            const success = await GroupUtils.unmuteUser(targetUser, chatId);
            
            if (success) {
                const unmuteMessage = `🔊 *USER UNMUTED* 🔊

@${targetUser.split('@')[0]} has been unmuted.

📋 *Details:*
• Originally muted for: ${muteInfo?.reason || 'Unknown reason'}
• Muted by: @${muteInfo?.mutedBy?.split('@')[0] || 'Unknown'}
• Unmuted by: @${senderId.split('@')[0]}
• Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

You can now send messages again! ✅

${config.BOT_FOOTER}`;

                await sock.sendMessage(chatId, {
                    text: unmuteMessage,
                    mentions: [targetUser, senderId]
                });
            } else {
                await reply('❌ Failed to unmute user!');
            }
        }
        
    } catch (error) {
        await reply('❌ Error executing mute command!');
    }
};

module.exports = {
    nomCom: "group-mute",
    aliases: ["gmute", "mute"],
    reaction: '🔇',
    categorie: "admin",
    adminOnly: true,
    groupOnly: true,
    execute: fana
};
