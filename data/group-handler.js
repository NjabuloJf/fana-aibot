const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('../config');
const { messageUtils } = require('../msg');
const { storage } = require('../storage');

// Group Handler Class
class GroupHandler {
    constructor() {
        this.groupCache = new Map();
        this.adminCache = new Map();
        this.groupEvents = new Map();
        this.mutedUsers = new Map();
        this.groupStats = new Map();
        
        this.initializeGroupHandler();
    }

    // Initialize group handler
    async initializeGroupHandler() {
        try {
            // Load group data from storage
            await this.loadGroupData();
            
            // Load muted users
            await this.loadMutedUsers();
            
            // Load group statistics
            await this.loadGroupStats();
            
            console.log(chalk.green('✅ Group handler initialized'));
        } catch (error) {
            console.error(chalk.red('❌ Error initializing group handler:'), error);
        }
    }

    // Handle group messages
    async handleGroupMessage(sock, message, messageContent, chatId, senderId) {
        try {
            // Update group cache
            await this.updateGroupCache(sock, chatId);
            
            // Check if user is muted
            if (this.isUserMuted(senderId, chatId)) {
                await this.handleMutedUser(sock, message, chatId, senderId);
                return true; // Message handled (blocked)
            }
            
            // Update group statistics
            await this.updateGroupStats(chatId, 'messages');
            
            // Handle group-specific features
            await this.handleGroupFeatures(sock, message, messageContent, chatId, senderId);
            
            // Log group activity
            await this.logGroupActivity(chatId, senderId, 'message', messageContent.text);
            
            return false; // Message not blocked
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling group message:'), error);
            return false;
        }
    }

    // Handle group events
    async handleGroupEvent(sock, update) {
        try {
            const { id: groupId, participants, action, author } = update;
            
            console.log(chalk.blue(`👥 Group event: ${action} in ${groupId}`));
            
            // Update group cache
            await this.updateGroupCache(sock, groupId);
            
            // Handle different group events
            switch (action) {
                case 'add':
                    await this.handleMemberAdd(sock, groupId, participants, author);
                    break;
                    
                case 'remove':
                    await this.handleMemberRemove(sock, groupId, participants, author);
                    break;
                    
                case 'promote':
                    await this.handleMemberPromote(sock, groupId, participants, author);
                    break;
                    
                case 'demote':
                    await this.handleMemberDemote(sock, groupId, participants, author);
                    break;
                    
                case 'subject':
                    await this.handleSubjectChange(sock, groupId, update.subject, author);
                    break;
                    
                case 'description':
                    await this.handleDescriptionChange(sock, groupId, update.description, author);
                    break;
                    
                case 'picture':
                    await this.handlePictureChange(sock, groupId, author);
                    break;
                    
                case 'announce':
                    await this.handleAnnounceChange(sock, groupId, update.announce, author);
                    break;
                    
                case 'restrict':
                    await this.handleRestrictChange(sock, groupId, update.restrict, author);
                    break;
            }
            
            // Log group event
            await this.logGroupActivity(groupId, author, action, JSON.stringify(update));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling group event:'), error);
        }
    }

    // Handle member add
    async handleMemberAdd(sock, groupId, participants, author) {
        try {
            for (const userId of participants) {
                // Update group statistics
                await this.updateGroupStats(groupId, 'joins');
                
                // Check if group has member limit
                const groupSettings = await this.getGroupSettings(groupId);
                if (groupSettings.memberLimit > 0) {
                    const groupMetadata = await sock.groupMetadata(groupId);
                    if (groupMetadata.participants.length > groupSettings.memberLimit) {
                        await this.handleMemberLimitExceeded(sock, groupId, userId);
                        continue;
                    }
                }
                
                // Check if user is banned
                if (await storage.isBanned(userId)) {
                    await this.handleBannedUserJoin(sock, groupId, userId);
                    continue;
                }
                
                // Send admin notification if enabled
                if (groupSettings.notifyAdmins) {
                    await this.notifyAdmins(sock, groupId, `👤 New member: @${userId.split('@')[0]} added by @${author?.split('@')[0] || 'Unknown'}`);
                }
                
                console.log(chalk.green(`👤 Member added: ${userId} to ${groupId}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling member add:'), error);
        }
    }

    // Handle member remove
    async handleMemberRemove(sock, groupId, participants, author) {
        try {
            for (const userId of participants) {
                // Update group statistics
                await this.updateGroupStats(groupId, 'leaves');
                
                // Clean up user data
                this.cleanupUserData(userId, groupId);
                
                // Send admin notification if enabled
                const groupSettings = await this.getGroupSettings(groupId);
                if (groupSettings.notifyAdmins) {
                    await this.notifyAdmins(sock, groupId, `👤 Member removed: @${userId.split('@')[0]} by @${author?.split('@')[0] || 'Unknown'}`);
                }
                
                console.log(chalk.yellow(`👤 Member removed: ${userId} from ${groupId}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling member remove:'), error);
        }
    }

    // Handle member promote
    async handleMemberPromote(sock, groupId, participants, author) {
        try {
            for (const userId of participants) {
                // Update admin cache
                await this.updateAdminCache(sock, groupId);
                
                // Update group statistics
                await this.updateGroupStats(groupId, 'promotions');
                
                // Send admin notification
                const groupSettings = await this.getGroupSettings(groupId);
                if (groupSettings.notifyAdmins) {
                    await this.notifyAdmins(sock, groupId, `👑 Member promoted: @${userId.split('@')[0]} by @${author?.split('@')[0] || 'Unknown'}`);
                }
                
                console.log(chalk.blue(`👑 Member promoted: ${userId} in ${groupId}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling member promote:'), error);
        }
    }

    // Handle member demote
    async handleMemberDemote(sock, groupId, participants, author) {
        try {
            for (const userId of participants) {
                // Update admin cache
                await this.updateAdminCache(sock, groupId);
                
                // Update group statistics
                await this.updateGroupStats(groupId, 'demotions');
                
                // Send admin notification
                const groupSettings = await this.getGroupSettings(groupId);
                if (groupSettings.notifyAdmins) {
                    await this.notifyAdmins(sock, groupId, `⬇️ Member demoted: @${userId.split('@')[0]} by @${author?.split('@')[0] || 'Unknown'}`);
                }
                
                console.log(chalk.yellow(`⬇️ Member demoted: ${userId} in ${groupId}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling member demote:'), error);
        }
    }

    // Handle subject change
    async handleSubjectChange(sock, groupId, newSubject, author) {
        try {
            // Update group cache
            await this.updateGroupCache(sock, groupId);
            
            // Send notification
            const groupSettings = await this.getGroupSettings(groupId);
            if (groupSettings.notifyChanges) {
                const message = `📝 *GROUP NAME CHANGED* 📝

New name: *${newSubject}*
Changed by: @${author?.split('@')[0] || 'Unknown'}
Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, groupId, message, author ? [author] : []);
            }
            
            console.log(chalk.blue(`📝 Group subject changed: ${groupId} -> ${newSubject}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling subject change:'), error);
        }
    }

    // Handle description change
    async handleDescriptionChange(sock, groupId, newDescription, author) {
        try {
            // Update group cache
            await this.updateGroupCache(sock, groupId);
            
            // Send notification
            const groupSettings = await this.getGroupSettings(groupId);
            if (groupSettings.notifyChanges) {
                const message = `📄 *GROUP DESCRIPTION CHANGED* 📄

Changed by: @${author?.split('@')[0] || 'Unknown'}
Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

New description:
${newDescription || 'No description'}

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, groupId, message, author ? [author] : []);
            }
            
            console.log(chalk.blue(`📄 Group description changed: ${groupId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling description change:'), error);
        }
    }

    // Handle picture change
    async handlePictureChange(sock, groupId, author) {
        try {
            // Update group cache
            await this.updateGroupCache(sock, groupId);
            
            // Send notification
            const groupSettings = await this.getGroupSettings(groupId);
            if (groupSettings.notifyChanges) {
                const message = `🖼️ *GROUP PICTURE CHANGED* 🖼️

Changed by: @${author?.split('@')[0] || 'Unknown'}
Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, groupId, message, author ? [author] : []);
            }
            
            console.log(chalk.blue(`🖼️ Group picture changed: ${groupId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling picture change:'), error);
        }
    }

    // Handle announce setting change
    async handleAnnounceChange(sock, groupId, announceMode, author) {
        try {
            // Update group cache
            await this.updateGroupCache(sock, groupId);
            
            // Send notification
            const groupSettings = await this.getGroupSettings(groupId);
            if (groupSettings.notifyChanges) {
                const mode = announceMode ? 'Only Admins' : 'All Participants';
                const message = `📢 *GROUP ANNOUNCE SETTING CHANGED* 📢

Who can send messages: *${mode}*
Changed by: @${author?.split('@')[0] || 'Unknown'}
Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, groupId, message, author ? [author] : []);
            }
            
            console.log(chalk.blue(`📢 Group announce changed: ${groupId} -> ${announceMode}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling announce change:'), error);
        }
    }

    // Handle restrict setting change
    async handleRestrictChange(sock, groupId, restrictMode, author) {
        try {
            // Update group cache
            await this.updateGroupCache(sock, groupId);
            
            // Send notification
            const groupSettings = await this.getGroupSettings(groupId);
            if (groupSettings.notifyChanges) {
                const mode = restrictMode ? 'Only Admins' : 'All Participants';
                const message = `🔒 *GROUP EDIT SETTING CHANGED* 🔒

Who can edit group info: *${mode}*
Changed by: @${author?.split('@')[0] || 'Unknown'}
Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, groupId, message, author ? [author] : []);
            }
            
            console.log(chalk.blue(`🔒 Group restrict changed: ${groupId} -> ${restrictMode}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling restrict change:'), error);
        }
    }

    // Handle muted user
    async handleMutedUser(sock, message, chatId, senderId) {
        try {
            // Delete the message
            await messageUtils.deleteMessage(sock, message);
            
            // Get mute info
            const muteInfo = this.getMuteInfo(senderId, chatId);
            if (!muteInfo) return;
            
            // Check if mute has expired
            if (muteInfo.expiresAt && Date.now() > muteInfo.expiresAt) {
                await this.unmuteUser(senderId, chatId);
                return;
            }
            
            // Send mute reminder (only once per hour to avoid spam)
            const lastReminder = muteInfo.lastReminder || 0;
            if (Date.now() - lastReminder > 60 * 60 * 1000) { // 1 hour
                const timeLeft = muteInfo.expiresAt ? 
                    moment(muteInfo.expiresAt).fromNow() : 'indefinitely';
                
                const muteMessage = `🔇 @${senderId.split('@')[0]} you are muted ${timeLeft}.

Reason: ${muteInfo.reason || 'No reason provided'}
Muted by: ${muteInfo.mutedBy || 'Unknown'}

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, chatId, muteMessage, [senderId]);
                
                // Update last reminder time
                muteInfo.lastReminder = Date.now();
                this.mutedUsers.set(`${senderId}:${chatId}`, muteInfo);
                await this.saveMutedUsers();
            }
            
            console.log(chalk.yellow(`🔇 Blocked message from muted user: ${senderId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling muted user:'), error);
        }
    }

    // Handle member limit exceeded
    async handleMemberLimitExceeded(sock, groupId, userId) {
        try {
            // Remove the user
            await sock.groupParticipantsUpdate(groupId, [userId], 'remove');
            
            const message = `⚠️ *MEMBER LIMIT EXCEEDED* ⚠️

@${userId.split('@')[0]} was automatically removed.

The group has reached its maximum member limit.
Contact admins if you need to join.

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, groupId, message, [userId]);
            
            console.log(chalk.red(`⚠️ Removed user due to member limit: ${userId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling member limit:'), error);
        }
    }

    // Handle banned user join
    async handleBannedUserJoin(sock, groupId, userId) {
        try {
            // Remove the banned user
            await sock.groupParticipantsUpdate(groupId, [userId], 'remove');
            
            const message = `🚫 *BANNED USER DETECTED* 🚫

@${userId.split('@')[0]} is banned and was automatically removed.

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, groupId, message, [userId]);
            
            console.log(chalk.red(`🚫 Removed banned user: ${userId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling banned user:'), error);
        }
    }

    // Handle group features
    async handleGroupFeatures(sock, message, messageContent, chatId, senderId) {
        try {
            const groupSettings = await this.getGroupSettings(chatId);
            
            // Auto-delete feature
            if (groupSettings.autoDelete && groupSettings.deleteAfter > 0) {
                setTimeout(async () => {
                    try {
                        await messageUtils.deleteMessage(sock, message);
                    } catch (error) {
                        // Ignore deletion errors
                    }
                }, groupSettings.deleteAfter * 1000);
            }
            
            // Word filter
            if (groupSettings.wordFilter && groupSettings.bannedWords.length > 0) {
                const messageText = messageContent.text?.toLowerCase() || '';
                const hasBannedWord = groupSettings.bannedWords.some(word => 
                    messageText.includes(word.toLowerCase())
                );
                
                if (hasBannedWord) {
                    await this.handleBannedWord(sock, message, chatId, senderId, groupSettings);
                }
            }
            
            // Spam detection
            if (groupSettings.antiSpam) {
                const isSpam = await this.detectSpam(senderId, chatId, messageContent.text);
                if (isSpam) {
                    await this.handleSpam(sock, message, chatId, senderId, groupSettings);
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling group features:'), error);
        }
    }

    // Handle banned word
    async handleBannedWord(sock, message, chatId, senderId, groupSettings) {
        try {
            // Delete the message
            await messageUtils.deleteMessage(sock, message);
            
            const action = groupSettings.wordFilterAction || 'warn';
            
            switch (action) {
                case 'delete':
                    // Already deleted above
                    break;
                    
                case 'warn':
                    const warningMessage = `⚠️ *INAPPROPRIATE LANGUAGE* ⚠️

@${senderId.split('@')[0]} Please watch your language.
Your message has been deleted.

${config.BOT_FOOTER}`;

                    await messageUtils.sendMention(sock, chatId, warningMessage, [senderId]);
                    break;
                    
                case 'mute':
                    await this.muteUser(senderId, chatId, 'Inappropriate language', config.OWNER_NUMBER + '@s.whatsapp.net', 60 * 60 * 1000); // 1 hour
                    break;
                    
                case 'kick':
                    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                    break;
            }
            
            console.log(chalk.yellow(`🚫 Handled banned word from: ${senderId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling banned word:'), error);
        }
    }

    // Detect spam
    async detectSpam(userId, groupId, messageText) {
        try {
            const key = `${userId}:${groupId}`;
            const now = Date.now();
            const timeWindow = 60000; // 1 minute
            const messageLimit = 10; // Max messages per minute
            
            // Get user's recent messages
            if (!this.groupStats.has(key)) {
                this.groupStats.set(key, { messages: [], lastCheck: now });
            }
            
            const userStats = this.groupStats.get(key);
            
            // Remove old messages outside time window
            userStats.messages = userStats.messages.filter(msg => now - msg.timestamp < timeWindow);
            
            // Add current message
            userStats.messages.push({
                text: messageText,
                timestamp: now
            });
            
            // Check for spam patterns
            const messageCount = userStats.messages.length;
            
            // Too many messages in short time
            if (messageCount > messageLimit) {
                return true;
            }
            
            // Check for repeated messages
            if (messageText && messageText.length > 5) {
                const duplicates = userStats.messages.filter(msg => msg.text === messageText);
                if (duplicates.length >= 3) {
                    return true;
                }
            }
            
            // Check for excessive caps
            if (messageText && messageText.length > 10) {
                const capsRatio = (messageText.match(/[A-Z]/g) || []).length / messageText.length;
                if (capsRatio > 0.7) {
                    return true;
                }
            }
            
            // Check for excessive emojis
            if (messageText) {
                const emojiCount = (messageText.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
                if (emojiCount > 10) {
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            console.error(chalk.red('❌ Error detecting spam:'), error);
            return false;
        }
    }

    // Handle spam
    async handleSpam(sock, message, chatId, senderId, groupSettings) {
        try {
            // Delete the message
            await messageUtils.deleteMessage(sock, message);
            
            const action = groupSettings.antiSpamAction || 'warn';
            
            switch (action) {
                case 'delete':
                    // Already deleted above
                    break;
                    
                case 'warn':
                    const warningMessage = `⚠️ *SPAM DETECTED* ⚠️

@${senderId.split('@')[0]} Please avoid spamming.
Your message has been deleted.

${config.BOT_FOOTER}`;

                    await messageUtils.sendMention(sock, chatId, warningMessage, [senderId]);
                    break;
                    
                case 'mute':
                    await this.muteUser(senderId, chatId, 'Spamming', config.OWNER_NUMBER + '@s.whatsapp.net', 30 * 60 * 1000); // 30 minutes
                    break;
                    
                case 'kick':
                    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                    break;
            }
            
            console.log(chalk.yellow(`🚫 Handled spam from: ${senderId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling spam:'), error);
        }
    }

    // Mute user
    async muteUser(userId, groupId, reason, mutedBy, duration = null) {
        try {
            const key = `${userId}:${groupId}`;
            const muteInfo = {
                userId: userId,
                groupId: groupId,
                reason: reason,
                mutedBy: mutedBy,
                mutedAt: Date.now(),
                expiresAt: duration ? Date.now() + duration : null,
                lastReminder: 0
            };
            
            this.mutedUsers.set(key, muteInfo);
            await this.saveMutedUsers();
            
            // Send mute notification
            const durationText = duration ? moment.duration(duration).humanize() : 'indefinitely';
            const muteMessage = `🔇 *USER MUTED* 🔇

@${userId.split('@')[0]} has been muted for ${durationText}.

Reason: ${reason}
Muted by: @${mutedBy.split('@')[0]}
Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, groupId, muteMessage, [userId, mutedBy]);
            
            // Auto-unmute if duration is set
            if (duration) {
                setTimeout(async () => {
                    await this.unmuteUser(userId, groupId);
                }, duration);
            }
            
            console.log(chalk.yellow(`🔇 Muted user: ${userId} in ${groupId}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error muting user:'), error);
            return false;
        }
    }

    // Unmute user
    async unmuteUser(userId, groupId) {
        try {
            const key = `${userId}:${groupId}`;
            
            if (!this.mutedUsers.has(key)) {
                return false;
            }
            
            this.mutedUsers.delete(key);
            await this.saveMutedUsers();
            
            // Send unmute notification
            const unmuteMessage = `🔊 *USER UNMUTED* 🔊

@${userId.split('@')[0]} has been unmuted.
You can now send messages again.

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, groupId, unmuteMessage, [userId]);
            
            console.log(chalk.green(`🔊 Unmuted user: ${userId} in ${groupId}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error unmuting user:'), error);
            return false;
        }
    }

    // Check if user is muted
    isUserMuted(userId, groupId) {
        const key = `${userId}:${groupId}`;
        return this.mutedUsers.has(key);
    }

    // Get mute info
    getMuteInfo(userId, groupId) {
        const key = `${userId}:${groupId}`;
        return this.mutedUsers.get(key);
    }

    // Get group settings
    async getGroupSettings(groupId) {
        try {
            const settings = await storage.getGroup(groupId);
            
            const defaultSettings = {
                memberLimit: 0,
                notifyAdmins: false,
                notifyChanges: true,
                autoDelete: false,
                deleteAfter: 0,
                wordFilter: false,
                bannedWords: [],
                wordFilterAction: 'warn',
                antiSpam: false,
                antiSpamAction: 'warn',
                welcomeEnabled: true,
                goodbyeEnabled: true
            };
            
            return { ...defaultSettings, ...settings };
            
        } catch (error) {
            console.error(chalk.red('❌ Error getting group settings:'), error);
            return {};
        }
    }

    // Save group settings
    async saveGroupSettings(groupId, settings) {
        try {
            await storage.saveGroup(groupId, settings);
            
            // Update cache
            this.groupCache.set(groupId, { ...this.groupCache.get(groupId), ...settings });
            
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error saving group settings:'), error);
            return false;
        }
    }

    // Update group cache
    async updateGroupCache(sock, groupId) {
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            this.groupCache.set(groupId, {
                id: groupId,
                subject: groupMetadata.subject,
                description: groupMetadata.desc,
                participants: groupMetadata.participants,
                admins: groupMetadata.participants.filter(p => p.admin),
                owner: groupMetadata.owner,
                creation: groupMetadata.creation,
                lastUpdated: Date.now()
            });
            
        } catch (error) {
            console.error(chalk.red('❌ Error updating group cache:'), error);
        }
    }

    // Update admin cache
    async updateAdminCache(sock, groupId) {
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            const admins = groupMetadata.participants
                .filter(p => p.admin)
                .map(p => p.id);
            
            this.adminCache.set(groupId, admins);
            
        } catch (error) {
            console.error(chalk.red('❌ Error updating admin cache:'), error);
        }
    }

    // Get group admins
    async getGroupAdmins(sock, groupId) {
        try {
            // Check cache first
            if (this.adminCache.has(groupId)) {
                return this.adminCache.get(groupId);
            }
            
            // Update cache and return
            await this.updateAdminCache(sock, groupId);
            return this.adminCache.get(groupId) || [];
            
        } catch (error) {
            console.error(chalk.red('❌ Error getting group admins:'), error);
            return [];
        }
    }

    // Notify admins
    async notifyAdmins(sock, groupId, message) {
        try {
            const admins = await this.getGroupAdmins(sock, groupId);
            if (admins.length === 0) return;
            
            const adminMessage = `👑 *ADMIN NOTIFICATION* 👑

${message}

Group: ${this.groupCache.get(groupId)?.subject || 'Unknown'}
Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, groupId, adminMessage, admins);
            
        } catch (error) {
            console.error(chalk.red('❌ Error notifying admins:'), error);
        }
    }

    // Update group statistics
    async updateGroupStats(groupId, statType) {
        try {
            const key = `stats:${groupId}`;
            let stats = this.groupStats.get(key) || {
                messages: 0,
                joins: 0,
                leaves: 0,
                promotions: 0,
                demotions: 0,
                lastUpdated: Date.now()
            };
            
            stats[statType] = (stats[statType] || 0) + 1;
            stats.lastUpdated = Date.now();
            
            this.groupStats.set(key, stats);
            
            // Save to storage periodically
            if (stats.messages % 100 === 0) { // Every 100 messages
                await this.saveGroupStats();
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error updating group stats:'), error);
        }
    }

    // Log group activity
    async logGroupActivity(groupId, userId, action, data) {
        try {
            const activity = {
                groupId: groupId,
                userId: userId,
                action: action,
                data: data,
                timestamp: Date.now(),
                date: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            
            // Get existing activity log
            const activityLog = await storage.getSetting('groupActivityLog', []);
            activityLog.push(activity);
            
            // Keep only last 1000 activities
            if (activityLog.length > 1000) {
                activityLog.splice(0, activityLog.length - 1000);
            }
            
            await storage.saveSetting('groupActivityLog', activityLog);
            
        } catch (error) {
            console.error(chalk.red('❌ Error logging group activity:'), error);
        }
    }

    // Clean up user data
    cleanupUserData(userId, groupId) {
        // Remove from muted users
        const muteKey = `${userId}:${groupId}`;
        this.mutedUsers.delete(muteKey);
        
        // Remove from group stats
        const statsKey = `${userId}:${groupId}`;
        this.groupStats.delete(statsKey);
        
        console.log(chalk.yellow(`🧹 Cleaned up data for user: ${userId}`));
    }

    // Load group data
    async loadGroupData() {
        try {
            const allGroups = await storage.getAllGroups();
            
            for (const [groupId, groupData] of Object.entries(allGroups)) {
                this.groupCache.set(groupId, groupData);
            }
            
            console.log(chalk.blue(`📊 Loaded data for ${Object.keys(allGroups).length} groups`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error loading group data:'), error);
        }
    }

    // Load muted users
    async loadMutedUsers() {
        try {
            const mutedData = await storage.getSetting('mutedUsers', {});
            
            for (const [key, muteInfo] of Object.entries(mutedData)) {
                // Check if mute has expired
                if (muteInfo.expiresAt && Date.now() > muteInfo.expiresAt) {
                    continue; // Skip expired mutes
                }
                
                this.mutedUsers.set(key, muteInfo);
            }
            
            console.log(chalk.blue(`🔇 Loaded ${this.mutedUsers.size} muted users`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error loading muted users:'), error);
        }
    }

    // Save muted users
    async saveMutedUsers() {
        try {
            const mutedData = Object.fromEntries(this.mutedUsers);
            await storage.saveSetting('mutedUsers', mutedData);
            
        } catch (error) {
            console.error(chalk.red('❌ Error saving muted users:'), error);
        }
    }

    // Load group statistics
    async loadGroupStats() {
        try {
            const statsData = await storage.getSetting('groupStats', {});
            
            for (const [key, stats] of Object.entries(statsData)) {
                this.groupStats.set(key, stats);
            }
            
            console.log(chalk.blue(`📈 Loaded stats for ${Object.keys(statsData).length} entries`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error loading group stats:'), error);
        }
    }

    // Save group statistics
    async saveGroupStats() {
        try {
            const statsData = {};
            
            for (const [key, stats] of this.groupStats.entries()) {
                if (key.startsWith('stats:')) {
                    statsData[key] = stats;
                }
            }
            
            await storage.saveSetting('groupStats', statsData);
            
        } catch (error) {
            console.error(chalk.red('❌ Error saving group stats:'), error);
        }
    }

    // Get group statistics
    async getGroupStatistics(groupId) {
        try {
            const key = `stats:${groupId}`;
            const stats = this.groupStats.get(key) || {
                messages: 0,
                joins: 0,
                leaves: 0,
                promotions: 0,
                demotions: 0
            };
            
            const groupData = this.groupCache.get(groupId);
            
            return {
                ...stats,
                memberCount: groupData?.participants?.length || 0,
                adminCount: groupData?.admins?.length || 0,
                groupName: groupData?.subject || 'Unknown',
                created: groupData?.creation ? moment(groupData.creation * 1000).format('DD/MM/YYYY') : 'Unknown'
            };
            
        } catch (error) {
            console.error(chalk.red('❌ Error getting group statistics:'), error);
            return null;
        }
    }

    // Generate group report
    async generateGroupReport(groupId) {
        try {
            const stats = await this.getGroupStatistics(groupId);
            if (!stats) return null;
            
            const muteCount = Array.from(this.mutedUsers.keys())
                .filter(key => key.endsWith(`:${groupId}`)).length;
            
            const report = `📊 *GROUP REPORT* 📊

🏷️ *Group:* ${stats.groupName}
👥 *Members:* ${stats.memberCount}
👑 *Admins:* ${stats.adminCount}
📅 *Created:* ${stats.created}

📈 *Activity Statistics:*
• Messages: ${stats.messages}
• Joins: ${stats.joins}
• Leaves: ${stats.leaves}
• Promotions: ${stats.promotions}
• Demotions: ${stats.demotions}

🔇 *Moderation:*
• Muted Users: ${muteCount}

📅 *Generated:* ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            return report;
            
        } catch (error) {
            console.error(chalk.red('❌ Error generating group report:'), error);
            return null;
        }
    }

    // Clean expired mutes
    async cleanExpiredMutes() {
        try {
            const now = Date.now();
            let cleaned = 0;
            
            for (const [key, muteInfo] of this.mutedUsers.entries()) {
                if (muteInfo.expiresAt && now > muteInfo.expiresAt) {
                    this.mutedUsers.delete(key);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                await this.saveMutedUsers();
                console.log(chalk.yellow(`🧹 Cleaned ${cleaned} expired mutes`));
            }
            
            return cleaned;
            
        } catch (error) {
            console.error(chalk.red('❌ Error cleaning expired mutes:'), error);
            return 0;
        }
    }

    // Get all group info
    getGroupInfo(groupId) {
        return this.groupCache.get(groupId);
    }

    // Check if user is admin
    async isUserAdmin(sock, groupId, userId) {
        try {
            const admins = await this.getGroupAdmins(sock, groupId);
            return admins.includes(userId);
        } catch (error) {
            console.error(chalk.red('❌ Error checking admin status:'), error);
            return false;
        }
    }
}

// Initialize group handler
const groupHandler = new GroupHandler();

// Auto cleanup expired mutes every hour
setInterval(async () => {
    await groupHandler.cleanExpiredMutes();
}, 60 * 60 * 1000);

// Auto save group stats every 10 minutes
setInterval(async () => {
    await groupHandler.saveGroupStats();
}, 10 * 60 * 1000);

// Main export function
async function handleGroup(sock, message, messageContent, chatId, senderId) {
    return await groupHandler.handleGroupMessage(sock, message, messageContent, chatId, senderId);
}

// Group event handler
async function handleGroupEvent(sock, update) {
    return await groupHandler.handleGroupEvent(sock, update);
}

// Group utilities
const GroupUtils = {
    // Get group info
    getGroupInfo(groupId) {
        return groupHandler.getGroupInfo(groupId);
    },

    // Get group settings
    async getGroupSettings(groupId) {
        return await groupHandler.getGroupSettings(groupId);
    },

    // Update group settings
    async updateGroupSettings(groupId, settings) {
        return await groupHandler.saveGroupSettings(groupId, settings);
    },

    // Get group statistics
    async getGroupStats(groupId) {
        return await groupHandler.getGroupStatistics(groupId);
    },

    // Generate group report
    async generateReport(groupId) {
        return await groupHandler.generateGroupReport(groupId);
    },

    // Mute user
    async muteUser(userId, groupId, reason, mutedBy, duration = null) {
        return await groupHandler.muteUser(userId, groupId, reason, mutedBy, duration);
    },

    // Unmute user
    async unmuteUser(userId, groupId) {
        return await groupHandler.unmuteUser(userId, groupId);
    },

    // Check if user is muted
    isUserMuted(userId, groupId) {
        return groupHandler.isUserMuted(userId, groupId);
    },

    // Get mute info
    getMuteInfo(userId, groupId) {
        return groupHandler.getMuteInfo(userId, groupId);
    },

    // Check if user is admin
    async isUserAdmin(sock, groupId, userId) {
        return await groupHandler.isUserAdmin(sock, groupId, userId);
    },

    // Get group admins
    async getGroupAdmins(sock, groupId) {
        return await groupHandler.getGroupAdmins(sock, groupId);
    },

    // Update group cache
    async updateGroupCache(sock, groupId) {
        return await groupHandler.updateGroupCache(sock, groupId);
    },

    // Clean expired mutes
    async cleanExpiredMutes() {
        return await groupHandler.cleanExpiredMutes();
    },

    // Get all muted users
    getAllMutedUsers() {
        return Array.from(groupHandler.mutedUsers.entries()).map(([key, info]) => ({
            key: key,
            ...info
        }));
    },

    // Get group activity log
    async getActivityLog(groupId = null, limit = 50) {
        try {
            const activityLog = await storage.getSetting('groupActivityLog', []);
            
            let filteredLog = groupId ? 
                activityLog.filter(activity => activity.groupId === groupId) : 
                activityLog;
            
            return filteredLog.slice(-limit).reverse(); // Most recent first
            
        } catch (error) {
            console.error(chalk.red('❌ Error getting activity log:'), error);
            return [];
        }
    },

    // Clear group cache
    clearGroupCache(groupId = null) {
        if (groupId) {
            groupHandler.groupCache.delete(groupId);
            groupHandler.adminCache.delete(groupId);
        } else {
            groupHandler.groupCache.clear();
            groupHandler.adminCache.clear();
        }
        console.log(chalk.yellow(`🧹 Cleared group cache${groupId ? ` for ${groupId}` : ''}`));
    },

    // Get handler statistics
    getHandlerStats() {
        return {
            cachedGroups: groupHandler.groupCache.size,
            cachedAdmins: groupHandler.adminCache.size,
            mutedUsers: groupHandler.mutedUsers.size,
            groupStats: groupHandler.groupStats.size
        };
    }
};

// Export handler and utilities
module.exports = {
    handleGroup,
    handleGroupEvent,
    groupHandler,
    GroupUtils
};

// Log initialization
console.log(chalk.green('✅ Group handler initialized'));
console.log(chalk.blue(`👥 Cached groups: ${groupHandler.groupCache.size}`));
console.log(chalk.blue(`🔇 Muted users: ${groupHandler.mutedUsers.size}`));
