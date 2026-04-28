const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('../config');
const { messageUtils } = require('../msg');
const { storage } = require('../storage');

// Antilink Handler Class
class AntilinkHandler {
    constructor() {
        this.linkPatterns = [
            /(?:https?:\/\/)?(?:www\.)?(?:chat\.)?whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9_-]+)/gi,
            /(?:https?:\/\/)?wa\.me\/([0-9]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?t\.me\/([a-zA-Z0-9_]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?telegram\.me\/([a-zA-Z0-9_]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?discord\.gg\/([a-zA-Z0-9]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?discord\.com\/invite\/([a-zA-Z0-9]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/gi
        ];
        
        this.warningCounts = new Map();
        this.exemptUsers = new Set();
        this.exemptGroups = new Set();
        
        this.initializeAntilink();
    }

    async initializeAntilink() {
        try {
            const exemptData = await storage.getSetting('antilinkExemptions', { users: [], groups: [] });
            this.exemptUsers = new Set(exemptData.users);
            this.exemptGroups = new Set(exemptData.groups);
            console.log(chalk.green('✅ Antilink handler initialized'));
        } catch (error) {
            console.error(chalk.red('❌ Error initializing antilink:'), error);
        }
    }

    async checkMessage(sock, message, messageContent, chatId, senderId) {
        try {
            if (config.AUTO_ANTILINK !== 'true') return false;
            if (this.isUserExempt(senderId)) return false;
            if (this.isGroupExempt(chatId)) return false;
            
            const groupSettings = await storage.getAntilinkSettings(chatId);
            if (!groupSettings.enabled) return false;
            
            const isGroup = chatId.endsWith('@g.us');
            if (isGroup) {
                const isAdmin = await messageUtils.isAdmin(sock, chatId, senderId);
                const isOwner = messageUtils.isOwner(senderId);
                const isBotAdmin = await storage.isAdmin(senderId);
                
                if ((isAdmin || isOwner || isBotAdmin) && !groupSettings.strictMode) {
                    return false;
                }
            }
            
            const messageText = messageContent.text || messageContent.caption || '';
            if (!messageText) return false;
            
            const detectedLinks = this.detectLinks(messageText);
            if (detectedLinks.length === 0) return false;
            
            return await this.processDetectedLinks(sock, message, chatId, senderId, detectedLinks, groupSettings);
            
        } catch (error) {
            console.error(chalk.red('❌ Error in antilink check:'), error);
            return false;
        }
    }

    detectLinks(text) {
        const detectedLinks = [];
        for (const pattern of this.linkPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                detectedLinks.push(...matches);
            }
        }
        return [...new Set(detectedLinks)];
    }

    async processDetectedLinks(sock, message, chatId, senderId, links, groupSettings) {
        try {
            const action = groupSettings.action || 'delete';
            const warningCount = this.getWarningCount(senderId, chatId);
            const maxWarnings = groupSettings.maxWarnings || 3;
            
            console.log(chalk.yellow(`🔗 Links detected from ${senderId}: ${links.join(', ')}`));
            
            await this.logViolation(senderId, chatId, links, action);
            
            switch (action) {
                case 'delete':
                    await this.deleteMessage(sock, message, chatId, senderId, links);
                    break;
                case 'warn':
                    const newWarningCount = await this.warnUser(sock, message, chatId, senderId, links, warningCount, maxWarnings);
                    if (newWarningCount >= maxWarnings) {
                        await this.kickUser(sock, chatId, senderId, 'Maximum warnings reached');
                    }
                    break;
                case 'kick':
                    await this.kickUser(sock, chatId, senderId, 'Link sharing not allowed');
                    break;
                case 'ban':
                    await this.banUser(sock, chatId, senderId, 'Link sharing not allowed');
                    break;
                default:
                    await this.deleteMessage(sock, message, chatId, senderId, links);
            }
            
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error processing detected links:'), error);
            return false;
        }
    }

    async deleteMessage(sock, message, chatId, senderId, links) {
        try {
            await messageUtils.deleteMessage(sock, message);
            
            const warningMessage = `⚠️ *LINK DETECTED* ⚠️

@${senderId.split('@')[0]} Your message containing links has been deleted.

🔗 *Detected Links:*
${links.map(link => `• ${link}`).join('\n')}

📋 *Reason:* Links are not allowed in this group.

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, chatId, warningMessage, [senderId]);
            console.log(chalk.green(`✅ Deleted message with links from ${senderId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error deleting message:'), error);
        }
    }

    async warnUser(sock, message, chatId, senderId, links, currentWarnings, maxWarnings) {
        try {
            const newWarningCount = currentWarnings + 1;
            this.setWarningCount(senderId, chatId, newWarningCount);
            
            await messageUtils.deleteMessage(sock, message);
            
            const warningMessage = `⚠️ *WARNING ${newWarningCount}/${maxWarnings}* ⚠️

@${senderId.split('@')[0]} You have been warned for sharing links.

🔗 *Detected Links:*
${links.map(link => `• ${link}`).join('\n')}

📋 *Warnings:* ${newWarningCount}/${maxWarnings}
${newWarningCount >= maxWarnings ? '🚫 *Next violation will result in removal!*' : '💡 *Please avoid sharing links in this group.*'}

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, chatId, warningMessage, [senderId]);
            console.log(chalk.yellow(`⚠️ Warned user ${senderId} (${newWarningCount}/${maxWarnings})`));
            
            return newWarningCount;
            
        } catch (error) {
            console.error(chalk.red('❌ Error warning user:'), error);
            return currentWarnings;
        }
    }

    async kickUser(sock, chatId, senderId, reason) {
        try {
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            
                        const kickMessage = `🚫 *USER REMOVED* 🚫

@${senderId.split('@')[0]} has been removed from the group.

📋 *Reason:* ${reason}
⏰ *Time:* ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, chatId, kickMessage, [senderId]);
            this.resetWarningCount(senderId, chatId);
            console.log(chalk.red(`🚫 Kicked user ${senderId} for: ${reason}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error kicking user:'), error);
            await messageUtils.sendText(sock, chatId, `❌ Failed to remove user. Make sure I have admin permissions.`);
        }
    }

    async banUser(sock, chatId, senderId, reason) {
        try {
            await storage.banUser(senderId, reason);
            await this.kickUser(sock, chatId, senderId, reason);
            
            const banMessage = `🚫 *USER BANNED* 🚫

@${senderId.split('@')[0]} has been banned from using the bot.

📋 *Reason:* ${reason}
⏰ *Time:* ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, chatId, banMessage, [senderId]);
            console.log(chalk.red(`🚫 Banned user ${senderId} for: ${reason}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error banning user:'), error);
        }
    }

    getWarningCount(userId, groupId) {
        const key = `${userId}:${groupId}`;
        return this.warningCounts.get(key) || 0;
    }

    setWarningCount(userId, groupId, count) {
        const key = `${userId}:${groupId}`;
        this.warningCounts.set(key, count);
        this.saveWarningCounts();
    }

    resetWarningCount(userId, groupId) {
        const key = `${userId}:${groupId}`;
        this.warningCounts.delete(key);
        this.saveWarningCounts();
    }

    async saveWarningCounts() {
        try {
            const warningData = Object.fromEntries(this.warningCounts);
            await storage.saveSetting('antilinkWarnings', warningData);
        } catch (error) {
            console.error(chalk.red('❌ Error saving warning counts:'), error);
        }
    }

    async loadWarningCounts() {
        try {
            const warningData = await storage.getSetting('antilinkWarnings', {});
            this.warningCounts = new Map(Object.entries(warningData));
        } catch (error) {
            console.error(chalk.red('❌ Error loading warning counts:'), error);
        }
    }

    async logViolation(userId, groupId, links, action) {
        try {
            const violation = {
                userId: userId,
                groupId: groupId,
                links: links,
                action: action,
                timestamp: Date.now(),
                date: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            
            const violations = await storage.getSetting('antilinkViolations', []);
            violations.push(violation);
            
            if (violations.length > 1000) {
                violations.splice(0, violations.length - 1000);
            }
            
            await storage.saveSetting('antilinkViolations', violations);
            console.log(chalk.blue(`📝 Logged antilink violation: ${userId} in ${groupId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error logging violation:'), error);
        }
    }

    isUserExempt(userId) {
        return this.exemptUsers.has(userId) || messageUtils.isOwner(userId);
    }

    isGroupExempt(groupId) {
        return this.exemptGroups.has(groupId);
    }

    async addUserExemption(userId) {
        this.exemptUsers.add(userId);
        await this.saveExemptions();
        console.log(chalk.green(`✅ Added user exemption: ${userId}`));
    }

    async removeUserExemption(userId) {
        this.exemptUsers.delete(userId);
        await this.saveExemptions();
        console.log(chalk.yellow(`➖ Removed user exemption: ${userId}`));
    }

    async addGroupExemption(groupId) {
        this.exemptGroups.add(groupId);
        await this.saveExemptions();
        console.log(chalk.green(`✅ Added group exemption: ${groupId}`));
    }

    async removeGroupExemption(groupId) {
        this.exemptGroups.delete(groupId);
        await this.saveExemptions();
        console.log(chalk.yellow(`➖ Removed group exemption: ${groupId}`));
    }

    async saveExemptions() {
        try {
            const exemptData = {
                users: Array.from(this.exemptUsers),
                groups: Array.from(this.exemptGroups)
            };
            await storage.saveSetting('antilinkExemptions', exemptData);
        } catch (error) {
            console.error(chalk.red('❌ Error saving exemptions:'), error);
        }
    }
}

// Initialize antilink handler
const antilinkHandler = new AntilinkHandler();

// Load warning counts on startup
antilinkHandler.loadWarningCounts();

// Main export function
async function handleAntilink(sock, message, messageContent, chatId, senderId) {
    return await antilinkHandler.checkMessage(sock, message, messageContent, chatId, senderId);
}

// Antilink utilities
const AntilinkUtils = {
    async enableForGroup(groupId, settings = {}) {
        const defaultSettings = {
            enabled: true,
            action: 'delete',
            maxWarnings: 3,
            strictMode: false
        };
        
        const groupSettings = { ...defaultSettings, ...settings };
        await storage.saveAntilinkSettings(groupId, groupSettings);
        console.log(chalk.green(`✅ Antilink enabled for group: ${groupId}`));
        return true;
    },

    async disableForGroup(groupId) {
        await storage.saveAntilinkSettings(groupId, { enabled: false });
        console.log(chalk.yellow(`➖ Antilink disabled for group: ${groupId}`));
        return true;
    },

    async getGroupSettings(groupId) {
        return await storage.getAntilinkSettings(groupId);
    },

    async updateGroupSettings(groupId, settings) {
        const currentSettings = await storage.getAntilinkSettings(groupId);
        const updatedSettings = { ...currentSettings, ...settings };
        await storage.saveAntilinkSettings(groupId, updatedSettings);
        return updatedSettings;
    },

    testLinks(text) {
        return antilinkHandler.detectLinks(text);
    },

    async resetWarnings(userId, groupId = null) {
        if (groupId) {
            antilinkHandler.resetWarningCount(userId, groupId);
        } else {
            const warnings = await storage.getSetting('antilinkWarnings', {});
            const updatedWarnings = {};
            
            for (const [key, count] of Object.entries(warnings)) {
                if (!key.startsWith(userId + ':')) {
                    updatedWarnings[key] = count;
                }
            }
            
            await storage.saveSetting('antilinkWarnings', updatedWarnings);
        }
        return true;
    },

    async addExemption(type, id) {
        if (type === 'user') {
            await antilinkHandler.addUserExemption(id);
        } else if (type === 'group') {
            await antilinkHandler.addGroupExemption(id);
        }
        return true;
    },

    async removeExemption(type, id) {
        if (type === 'user') {
            await antilinkHandler.removeUserExemption(id);
        } else if (type === 'group') {
            await antilinkHandler.removeGroupExemption(id);
        }
        return true;
    }
};

// Export handler and utilities
module.exports = {
    handleAntilink,
    antilinkHandler,
    AntilinkUtils
};

// Log initialization
console.log(chalk.green('✅ Antilink handler initialized'));
console.log(chalk.blue(`🔗 Link patterns loaded: ${antilinkHandler.linkPatterns.length}`));
