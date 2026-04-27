const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('../config');
const { messageUtils } = require('../msg');
const { storage } = require('../storage');

// Antilink Handler Class
class AntilinkHandler {
    constructor() {
        this.linkPatterns = [
            // WhatsApp links
            /(?:https?:\/\/)?(?:www\.)?(?:chat\.)?whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9_-]+)/gi,
            /(?:https?:\/\/)?wa\.me\/([0-9]+)/gi,
            
            // Telegram links
            /(?:https?:\/\/)?(?:www\.)?t\.me\/([a-zA-Z0-9_]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?telegram\.me\/([a-zA-Z0-9_]+)/gi,
            
            // Discord links
            /(?:https?:\/\/)?(?:www\.)?discord\.gg\/([a-zA-Z0-9]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?discord\.com\/invite\/([a-zA-Z0-9]+)/gi,
            
            // YouTube links
            /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/gi,
            
            // General URL pattern
            /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/gi,
            
            // Social media links
            /(?:https?:\/\/)?(?:www\.)?(?:facebook|fb)\.com\/([a-zA-Z0-9._-]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._-]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?twitter\.com\/([a-zA-Z0-9_]+)/gi,
            /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._-]+)/gi
        ];
        
        this.warningCounts = new Map();
        this.exemptUsers = new Set();
        this.exemptGroups = new Set();
        
        this.initializeAntilink();
    }

    // Initialize antilink system
    async initializeAntilink() {
        try {
            // Load exempt users and groups from storage
            const exemptData = await storage.getSetting('antilinkExemptions', { users: [], groups: [] });
            this.exemptUsers = new Set(exemptData.users);
            this.exemptGroups = new Set(exemptData.groups);
            
            console.log(chalk.green('✅ Antilink handler initialized'));
        } catch (error) {
            console.error(chalk.red('❌ Error initializing antilink:'), error);
        }
    }

    // Main antilink check function
    async checkMessage(sock, message, messageContent, chatId, senderId) {
        try {
            // Skip if antilink is disabled globally
            if (config.AUTO_ANTILINK !== 'true') return false;
            
            // Skip if user is exempt
            if (this.isUserExempt(senderId)) return false;
            
            // Skip if group is exempt
            if (this.isGroupExempt(chatId)) return false;
            
            // Get group antilink settings
            const groupSettings = await storage.getAntilinkSettings(chatId);
            if (!groupSettings.enabled) return false;
            
            // Check if user is admin or owner
            const isGroup = chatId.endsWith('@g.us');
            if (isGroup) {
                const isAdmin = await messageUtils.isAdmin(sock, chatId, senderId);
                const isOwner = messageUtils.isOwner(senderId);
                const isBotAdmin = await storage.isAdmin(senderId);
                
                // Skip check for admins unless strict mode is enabled
                if ((isAdmin || isOwner || isBotAdmin) && !groupSettings.strictMode) {
                    return false;
                }
            }
            
            // Extract text from message
            const messageText = messageContent.text || messageContent.caption || '';
            if (!messageText) return false;
            
            // Check for links
            const detectedLinks = this.detectLinks(messageText);
            if (detectedLinks.length === 0) return false;
            
            // Process detected links
            return await this.processDetectedLinks(sock, message, chatId, senderId, detectedLinks, groupSettings);
            
        } catch (error) {
            console.error(chalk.red('❌ Error in antilink check:'), error);
            return false;
        }
    }

    // Detect links in message
    detectLinks(text) {
        const detectedLinks = [];
        
        for (const pattern of this.linkPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                detectedLinks.push(...matches);
            }
        }
        
        // Remove duplicates
        return [...new Set(detectedLinks)];
    }

    // Process detected links
    async processDetectedLinks(sock, message, chatId, senderId, links, groupSettings) {
        try {
            const action = groupSettings.action || 'delete';
            const warningCount = this.getWarningCount(senderId, chatId);
            const maxWarnings = groupSettings.maxWarnings || 3;
            
            console.log(chalk.yellow(`🔗 Links detected from ${senderId}: ${links.join(', ')}`));
            
            // Log the violation
            await this.logViolation(senderId, chatId, links, action);
            
            // Execute action based on settings
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

    // Delete message action
    async deleteMessage(sock, message, chatId, senderId, links) {
        try {
            // Delete the message
            await messageUtils.deleteMessage(sock, message);
            
            // Send warning message
            const warningMessage = `⚠️ *LINK DETECTED* ⚠️

@${senderId.split('@')[0]} Your message containing links has been deleted.

🔗 *Detected Links:*
${links.map(link => `• ${link}`).join('\n')}

📋 *Reason:* Links are not allowed in this group.

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, chatId, warningMessage, [senderId]);
            
            // Auto-delete warning after 10 seconds
            setTimeout(async () => {
                try {
                    // This would delete the warning message if we stored its ID
                } catch (error) {
                    // Ignore deletion errors
                }
            }, 10000);
            
            console.log(chalk.green(`✅ Deleted message with links from ${senderId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error deleting message:'), error);
        }
    }

    // Warn user action
    async warnUser(sock, message, chatId, senderId, links, currentWarnings, maxWarnings) {
        try {
            const newWarningCount = currentWarnings + 1;
            this.setWarningCount(senderId, chatId, newWarningCount);
            
            // Delete the message first
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

    // Kick user action
    async kickUser(sock, chatId, senderId, reason) {
        try {
            // Delete the message first
            await messageUtils.deleteMessage(sock, message);
            
            // Remove user from group
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            
            const kickMessage = `🚫 *USER REMOVED* 🚫

@${senderId.split('@')[0]} has been removed from the group.

📋 *Reason:* ${reason}
⏰ *Time:* ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            await messageUtils.sendMention(sock, chatId, kickMessage, [senderId]);
            
            // Reset warning count
            this.resetWarningCount(senderId, chatId);
            
            console.log(chalk.red(`🚫 Kicked user ${senderId} for: ${reason}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error kicking user:'), error);
            
            // Fallback: send error message
            await messageUtils.sendText(sock, chatId,
                `❌ Failed to remove user. Make sure I have admin permissions.`);
        }
    }

    // Ban user action
    async banUser(sock, chatId, senderId, reason) {
        try {
            // Add to banned list
            await storage.banUser(senderId, reason);
            
            // Remove from group
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

    // Get warning count for user in specific group
    getWarningCount(userId, groupId) {
        const key = `${userId}:${groupId}`;
        return this.warningCounts.get(key) || 0;
    }

    // Set warning count for user in specific group
    setWarningCount(userId, groupId, count) {
        const key = `${userId}:${groupId}`;
        this.warningCounts.set(key, count);
        
        // Save to storage
        this.saveWarningCounts();
    }

    // Reset warning count for user in specific group
    resetWarningCount(userId, groupId) {
        const key = `${userId}:${groupId}`;
        this.warningCounts.delete(key);
        this.saveWarningCounts();
    }

    // Save warning counts to storage
    async saveWarningCounts() {
        try {
            const warningData = Object.fromEntries(this.warningCounts);
            await storage.saveSetting('antilinkWarnings', warningData);
        } catch (error) {
            console.error(chalk.red('❌ Error saving warning counts:'), error);
        }
    }

    // Load warning counts from storage
    async loadWarningCounts() {
        try {
            const warningData = await storage.getSetting('antilinkWarnings', {});
            this.warningCounts = new Map(Object.entries(warningData));
        } catch (error) {
            console.error(chalk.red('❌ Error loading warning counts:'), error);
        }
    }

    // Log violation
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
            
            // Get existing violations
            const violations = await storage.getSetting('antilinkViolations', []);
            violations.push(violation);
            
            // Keep only last 1000 violations
            if (violations.length > 1000) {
                violations.splice(0, violations.length - 1000);
            }
            
            await storage.saveSetting('antilinkViolations', violations);
            
            console.log(chalk.blue(`📝 Logged antilink violation: ${userId} in ${groupId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error logging violation:'), error);
        }
    }

    // Check if user is exempt
    isUserExempt(userId) {
        return this.exemptUsers.has(userId) || messageUtils.isOwner(userId);
    }

    // Check if group is exempt
    isGroupExempt(groupId) {
        return this.exemptGroups.has(groupId);
    }

    // Add user to exempt list
    async addUserExemption(userId) {
        this.exemptUsers.add(userId);
        await this.saveExemptions();
        console.log(chalk.green(`✅ Added user exemption: ${userId}`));
    }

    // Remove user from exempt list
    async removeUserExemption(userId) {
        this.exemptUsers.delete(userId);
        await this.saveExemptions();
        console.log(chalk.yellow(`➖ Removed user exemption: ${userId}`));
    }

    // Add group to exempt list
    async addGroupExemption(groupId) {
        this.exemptGroups.add(groupId);
        await this.saveExemptions();
        console.log(chalk.green(`✅ Added group exemption: ${groupId}`));
    }

    // Remove group from exempt list
    async removeGroupExemption(groupId) {
        this.exemptGroups.delete(groupId);
        await this.saveExemptions();
        console.log(chalk.yellow(`➖ Removed group exemption: ${groupId}`));
    }

    // Save exemptions to storage
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

    // Get antilink statistics
    async getStatistics() {
        try {
            const violations = await storage.getSetting('antilinkViolations', []);
            const warnings = await storage.getSetting('antilinkWarnings', {});
            
            const stats = {
                totalViolations: violations.length,
                totalWarnings: Object.keys(warnings).length,
                exemptUsers: this.exemptUsers.size,
                exemptGroups: this.exemptGroups.size,
                recentViolations: violations.slice(-10), // Last 10 violations
                topViolators: this.getTopViolators(violations),
                violationsByAction: this.getViolationsByAction(violations)
            };
            
            return stats;
        } catch (error) {
            console.error(chalk.red('❌ Error getting statistics:'), error);
            return null;
        }
    }

    // Get top violators
    getTopViolators(violations) {
        const violatorCounts = {};
        
        violations.forEach(violation => {
            violatorCounts[violation.userId] = (violatorCounts[violation.userId] || 0) + 1;
        });
        
        return Object.entries(violatorCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([userId, count]) => ({ userId, count }));
    }

    // Get violations by action
    getViolationsByAction(violations) {
        const actionCounts = {};
        
        violations.forEach(violation => {
            actionCounts[violation.action] = (actionCounts[violation.action] || 0) + 1;
        });
        
        return actionCounts;
    }

    // Clean old data
    async cleanOldData(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
        try {
            const now = Date.now();
            
            // Clean old violations
            const violations = await storage.getSetting('antilinkViolations', []);
            const recentViolations = violations.filter(v => now - v.timestamp < maxAge);
            
            if (recentViolations.length !== violations.length) {
                await storage.saveSetting('antilinkViolations', recentViolations);
                console.log(chalk.yellow(`🧹 Cleaned ${violations.length - recentViolations.length} old violations`));
            }
            
            // Clean old warning counts (reset warnings older than 7 days)
            const warningAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            const warnings = await storage.getSetting('antilinkWarnings', {});
            const activeWarnings = {};
            
            // Note: Since we don't store timestamps for warnings, we'll reset all warnings older than 7 days
            // In a real implementation, you'd want to store warning timestamps
            for (const [key, count] of Object.entries(warnings)) {
                // Keep warnings for now - in future versions, add timestamp tracking
                activeWarnings[key] = count;
            }
            
            return {
                violationsRemoved: violations.length - recentViolations.length,
                warningsReset: Object.keys(warnings).length - Object.keys(activeWarnings).length
            };
            
        } catch (error) {
            console.error(chalk.red('❌ Error cleaning old data:'), error);
            return { violationsRemoved: 0, warningsReset: 0 };
        }
    }

    // Generate antilink report
    async generateReport(groupId = null) {
        try {
            const stats = await this.getStatistics();
            if (!stats) return null;
            
            const violations = await storage.getSetting('antilinkViolations', []);
            const groupViolations = groupId ? violations.filter(v => v.groupId === groupId) : violations;
            
            const report = `📊 *ANTILINK REPORT* 📊

📈 *Overall Statistics:*
• Total Violations: ${stats.totalViolations}
• Active Warnings: ${stats.totalWarnings}
• Exempt Users: ${stats.exemptUsers}
• Exempt Groups: ${stats.exemptGroups}

${groupId ? `🏷️ *Group Specific (${groupId}):*
• Violations: ${groupViolations.length}
• Recent Activity: ${groupViolations.slice(-5).length} in last 5 violations

` : ''}📋 *Actions Taken:*
${Object.entries(stats.violationsByAction).map(([action, count]) => `• ${action}: ${count}`).join('\n')}

🔝 *Top Violators:*
${stats.topViolators.slice(0, 5).map((v, i) => `${i + 1}. ${v.userId.split('@')[0]}: ${v.count} violations`).join('\n')}

📅 *Generated:* ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            return report;
            
        } catch (error) {
            console.error(chalk.red('❌ Error generating report:'), error);
            return null;
        }
    }

    // Reset user warnings
    async resetUserWarnings(userId, groupId = null) {
        try {
            if (groupId) {
                this.resetWarningCount(userId, groupId);
                console.log(chalk.green(`✅ Reset warnings for ${userId} in ${groupId}`));
            } else {
                // Reset all warnings for user across all groups
                const warnings = await storage.getSetting('antilinkWarnings', {});
                const updatedWarnings = {};
                
                for (const [key, count] of Object.entries(warnings)) {
                    if (!key.startsWith(userId + ':')) {
                        updatedWarnings[key] = count;
                    }
                }
                
                await storage.saveSetting('antilinkWarnings', updatedWarnings);
                console.log(chalk.green(`✅ Reset all warnings for ${userId}`));
            }
            
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error resetting warnings:'), error);
            return false;
        }
    }

    // Test link detection
    testLinkDetection(text) {
        const detectedLinks = this.detectLinks(text);
        return {
            text: text,
            linksFound: detectedLinks.length > 0,
            links: detectedLinks,
            patterns: this.linkPatterns.map(pattern => ({
                pattern: pattern.toString(),
                matches: text.match(pattern) || []
            })).filter(p => p.matches.length > 0)
        };
    }

    // Update link patterns
    addLinkPattern(pattern) {
        try {
            const regex = new RegExp(pattern, 'gi');
            this.linkPatterns.push(regex);
            console.log(chalk.green(`✅ Added new link pattern: ${pattern}`));
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Invalid regex pattern:'), error);
            return false;
        }
    }

    // Remove link pattern
    removeLinkPattern(index) {
        try {
            if (index >= 0 && index < this.linkPatterns.length) {
                const removed = this.linkPatterns.splice(index, 1)[0];
                console.log(chalk.yellow(`➖ Removed link pattern: ${removed.toString()}`));
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error removing pattern:'), error);
            return false;
        }
    }

    // Get current patterns
    getLinkPatterns() {
        return this.linkPatterns.map((pattern, index) => ({
            index: index,
            pattern: pattern.toString(),
            source: pattern.source,
            flags: pattern.flags
        }));
    }
}

// Initialize antilink handler
const antilinkHandler = new AntilinkHandler();

// Auto cleanup old data every 24 hours
setInterval(async () => {
    await antilinkHandler.cleanOldData();
}, 24 * 60 * 60 * 1000);

// Load warning counts on startup
antilinkHandler.loadWarningCounts();

// Main export function
async function handleAntilink(sock, message, messageContent, chatId, senderId) {
    return await antilinkHandler.checkMessage(sock, message, messageContent, chatId, senderId);
}

// Antilink utilities
const AntilinkUtils = {
    // Enable antilink for group
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

    // Disable antilink for group
    async disableForGroup(groupId) {
        await storage.saveAntilinkSettings(groupId, { enabled: false });
        console.log(chalk.yellow(`➖ Antilink disabled for group: ${groupId}`));
        return true;
    },

    // Get group settings
    async getGroupSettings(groupId) {
        return await storage.getAntilinkSettings(groupId);
    },

    // Update group settings
    async updateGroupSettings(groupId, settings) {
        const currentSettings = await storage.getAntilinkSettings(groupId);
        const updatedSettings = { ...currentSettings, ...settings };
        await storage.saveAntilinkSettings(groupId, updatedSettings);
        return updatedSettings;
    },

    // Get statistics
    async getStats() {
        return await antilinkHandler.getStatistics();
    },

    // Generate report
    async generateReport(groupId = null) {
        return await antilinkHandler.generateReport(groupId);
    },

    // Test link detection
    testLinks(text) {
        return antilinkHandler.testLinkDetection(text);
    },

    // Reset warnings
    async resetWarnings(userId, groupId = null) {
        return await antilinkHandler.resetUserWarnings(userId, groupId);
    },

    // Add exemption
    async addExemption(type, id) {
        if (type === 'user') {
            await antilinkHandler.addUserExemption(id);
        } else if (type === 'group') {
            await antilinkHandler.addGroupExemption(id);
        }
        return true;
    },

    // Remove exemption
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
