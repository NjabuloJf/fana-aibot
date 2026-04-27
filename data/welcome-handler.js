const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('../config');
const { messageUtils } = require('../msg');
const { storage } = require('../storage');

// Welcome Handler Class
class WelcomeHandler {
    constructor() {
        this.welcomeTemplates = new Map();
        this.goodbyeTemplates = new Map();
        this.groupSettings = new Map();
        this.userJoinHistory = new Map();
        
        this.initializeWelcomeHandler();
    }

    // Initialize welcome handler
    async initializeWelcomeHandler() {
        try {
            // Load default templates
            this.loadDefaultTemplates();
            
            // Load custom templates from storage
            await this.loadCustomTemplates();
            
            // Load group settings
            await this.loadGroupSettings();
            
            console.log(chalk.green('✅ Welcome handler initialized'));
        } catch (error) {
            console.error(chalk.red('❌ Error initializing welcome handler:'), error);
        }
    }

    // Load default templates
    loadDefaultTemplates() {
        // Default welcome templates
        this.welcomeTemplates.set('default', {
            text: `🎉 *Welcome @user!* 🎉

Hello! Welcome to *{groupName}*! 👋

📋 *Group Rules:*
• Be respectful to all members
• No spam or inappropriate content
• Use {prefix} as command prefix
• Have fun and enjoy! 🎊

Type {prefix}menu to see available commands!

{footer}`,
            media: null,
            buttons: null
        });

        this.welcomeTemplates.set('simple', {
            text: `👋 Welcome @user to *{groupName}*!

Type {prefix}menu for commands.`,
            media: null,
            buttons: null
        });

        this.welcomeTemplates.set('detailed', {
            text: `🌟 *WELCOME TO {groupName}* 🌟

Hello @user! 👋 We're excited to have you here!

📊 *Group Info:*
• Members: {memberCount}
• Created: {groupCreated}
• Description: {groupDesc}

📋 *Important Rules:*
• 🤝 Be respectful and kind
• 🚫 No spam, ads, or inappropriate content
• 🔗 No unauthorized links
• 💬 Stay on topic
• 🎯 Use {prefix} for bot commands

🤖 *Bot Commands:*
• {prefix}menu - Show all commands
• {prefix}help - Get help
• {prefix}rules - View group rules

🔗 *Useful Links:*
• Channel: {channelLink}
• Support: Contact admins

Welcome aboard! 🚀

{footer}`,
            media: null,
            buttons: [
                { id: 'welcome_menu', text: '📋 View Commands' },
                { id: 'welcome_rules', text: '📜 Group Rules' },
                { id: 'welcome_help', text: '❓ Get Help' }
            ]
        });

        // Default goodbye templates
        this.goodbyeTemplates.set('default', {
            text: `👋 *Goodbye @user!*

Thanks for being part of *{groupName}*!
We'll miss you! 😢

Come back anytime! 💙

{footer}`,
            media: null
        });

        this.goodbyeTemplates.set('simple', {
            text: `👋 @user left the group. Goodbye!`,
            media: null
        });

        this.goodbyeTemplates.set('friendly', {
            text: `🌅 *Farewell @user!* 🌅

Thank you for the memories in *{groupName}*! 
Your contributions were valued. 💫

🚪 The door is always open for your return!
🌟 Wishing you all the best!

Take care! 🤗

{footer}`,
            media: null
        });
    }

    // Handle group participant updates
    async handleParticipantUpdate(sock, update) {
        try {
            const { id: groupId, participants, action } = update;
            
            // Skip if welcome is disabled globally
            if (config.AUTO_WELCOME !== 'true') return;
            
            // Get group settings
            const groupSettings = await this.getGroupSettings(groupId);
            if (!groupSettings.enabled) return;
            
            // Handle different actions
            switch (action) {
                case 'add':
                    await this.handleUserJoin(sock, groupId, participants, groupSettings);
                    break;
                    
                case 'remove':
                    await this.handleUserLeave(sock, groupId, participants, groupSettings);
                    break;
                    
                case 'promote':
                    await this.handleUserPromote(sock, groupId, participants, groupSettings);
                    break;
                    
                case 'demote':
                    await this.handleUserDemote(sock, groupId, participants, groupSettings);
                    break;
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling participant update:'), error);
        }
    }

    // Handle user join
    async handleUserJoin(sock, groupId, participants, groupSettings) {
        try {
            for (const userId of participants) {
                // Skip if user joined recently (prevent spam)
                if (this.hasRecentlyJoined(userId, groupId)) continue;
                
                // Mark user as recently joined
                this.markRecentJoin(userId, groupId);
                
                // Get group metadata
                const groupMetadata = await sock.groupMetadata(groupId);
                
                // Prepare welcome message
                const welcomeData = await this.prepareWelcomeMessage(
                    userId, 
                    groupMetadata, 
                    groupSettings
                );
                
                // Send welcome message
                await this.sendWelcomeMessage(sock, groupId, welcomeData);
                
                // Log join
                console.log(chalk.green(`👋 User joined: ${userId} in ${groupMetadata.subject}`));
                
                // Update statistics
                await storage.updateStats('totalUsers');
                
                // Save user data
                await this.saveUserJoinData(userId, groupId, groupMetadata);
                
                // Delay between multiple welcomes
                if (participants.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling user join:'), error);
        }
    }

    // Handle user leave
    async handleUserLeave(sock, groupId, participants, groupSettings) {
        try {
            // Skip if goodbye is disabled
            if (!groupSettings.goodbyeEnabled) return;
            
            for (const userId of participants) {
                // Get group metadata
                const groupMetadata = await sock.groupMetadata(groupId);
                
                // Prepare goodbye message
                const goodbyeData = await this.prepareGoodbyeMessage(
                    userId, 
                    groupMetadata, 
                    groupSettings
                );
                
                // Send goodbye message
                await this.sendGoodbyeMessage(sock, groupId, goodbyeData);
                
                // Log leave
                console.log(chalk.yellow(`👋 User left: ${userId} from ${groupMetadata.subject}`));
                
                // Clean up user data
                this.cleanupUserData(userId, groupId);
                
                // Delay between multiple goodbyes
                if (participants.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling user leave:'), error);
        }
    }

    // Handle user promote
    async handleUserPromote(sock, groupId, participants, groupSettings) {
        try {
            // Skip if promotion messages are disabled
            if (!groupSettings.promoteEnabled) return;
            
            for (const userId of participants) {
                // Get group metadata
                const groupMetadata = await sock.groupMetadata(groupId);
                
                const promoteMessage = `🎉 *PROMOTION* 🎉

Congratulations @${userId.split('@')[0]}! 👑

You have been promoted to admin in *${groupMetadata.subject}*!

🔧 *Admin Responsibilities:*
• Help maintain group order
• Assist other members
• Enforce group rules
• Use admin commands wisely

💡 *Admin Commands:*
• ${config.PREFIX}kick - Remove members
• ${config.PREFIX}promote - Promote members
• ${config.PREFIX}demote - Demote members
• ${config.PREFIX}delete - Delete messages

Welcome to the admin team! 🚀

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, groupId, promoteMessage, [userId]);
                
                console.log(chalk.blue(`👑 User promoted: ${userId} in ${groupMetadata.subject}`));
                
                // Delay between multiple promotions
                if (participants.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling user promote:'), error);
        }
    }

    // Handle user demote
    async handleUserDemote(sock, groupId, participants, groupSettings) {
        try {
            // Skip if demotion messages are disabled
            if (!groupSettings.demoteEnabled) return;
            
            for (const userId of participants) {
                // Get group metadata
                const groupMetadata = await sock.groupMetadata(groupId);
                
                const demoteMessage = `⬇️ *DEMOTION* ⬇️

@${userId.split('@')[0]} has been demoted from admin in *${groupMetadata.subject}*.

👤 You are now a regular member.
📋 Please continue to follow group rules.

${config.BOT_FOOTER}`;

                await messageUtils.sendMention(sock, groupId, demoteMessage, [userId]);
                
                console.log(chalk.yellow(`⬇️ User demoted: ${userId} in ${groupMetadata.subject}`));
                
                // Delay between multiple demotions
                if (participants.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error handling user demote:'), error);
        }
    }

    // Prepare welcome message
    async prepareWelcomeMessage(userId, groupMetadata, groupSettings) {
        try {
            const templateName = groupSettings.welcomeTemplate || 'default';
            const template = this.welcomeTemplates.get(templateName) || this.welcomeTemplates.get('default');
            
            // Get user info
            const userName = userId.split('@')[0];
            
            // Replace placeholders
            let messageText = template.text
                .replace(/@user/g, `@${userName}`)
                .replace(/{groupName}/g, groupMetadata.subject || 'Unknown Group')
                .replace(/{memberCount}/g, groupMetadata.participants.length)
                .replace(/{groupDesc}/g, groupMetadata.desc || 'No description')
                .replace(/{groupCreated}/g, moment(groupMetadata.creation * 1000).format('DD/MM/YYYY'))
                .replace(/{prefix}/g, config.PREFIX)
                .replace(/{channelLink}/g, config.CHANNEL_LINK)
                .replace(/{footer}/g, config.BOT_FOOTER)
                .replace(/{date}/g, moment().format('DD/MM/YYYY'))
                .replace(/{time}/g, moment().format('HH:mm:ss'));
            
            return {
                text: messageText,
                mentions: [userId],
                media: template.media,
                buttons: template.buttons
            };
            
        } catch (error) {
            console.error(chalk.red('❌ Error preparing welcome message:'), error);
            return {
                text: `👋 Welcome @${userId.split('@')[0]}!`,
                mentions: [userId],
                media: null,
                buttons: null
            };
        }
    }

    // Prepare goodbye message
    async prepareGoodbyeMessage(userId, groupMetadata, groupSettings) {
        try {
            const templateName = groupSettings.goodbyeTemplate || 'default';
            const template = this.goodbyeTemplates.get(templateName) || this.goodbyeTemplates.get('default');
            
            // Get user info
            const userName = userId.split('@')[0];
            
            // Replace placeholders
            let messageText = template.text
                .replace(/@user/g, `@${userName}`)
                .replace(/{groupName}/g, groupMetadata.subject || 'Unknown Group')
                .replace(/{memberCount}/g, groupMetadata.participants.length)
                .replace(/{footer}/g, config.BOT_FOOTER)
                .replace(/{date}/g, moment().format('DD/MM/YYYY'))
                .replace(/{time}/g, moment().format('HH:mm:ss'));
            
            return {
                text: messageText,
                mentions: [userId],
                media: template.media
            };
            
        } catch (error) {
            console.error(chalk.red('❌ Error preparing goodbye message:'), error);
            return {
                text: `👋 Goodbye @${userId.split('@')[0]}!`,
                mentions: [userId],
                media: null
            };
        }
    }

    // Send welcome message
    async sendWelcomeMessage(sock, groupId, welcomeData) {
        try {
            if (welcomeData.buttons && welcomeData.buttons.length > 0) {
                // Send button message
                await messageUtils.sendButtonMessage(
                    sock, 
                    groupId, 
                    welcomeData.text, 
                    welcomeData.buttons,
                    { mentions: welcomeData.mentions }
                );
            } else if (welcomeData.media) {
                // Send media with caption
                if (welcomeData.media.type === 'image') {
                    await messageUtils.sendImage(
                        sock, 
                        groupId, 
                        welcomeData.media.buffer, 
                        welcomeData.text,
                        { mentions: welcomeData.mentions }
                    );
                } else if (welcomeData.media.type === 'video') {
                    await messageUtils.sendVideo(
                        sock, 
                        groupId, 
                        welcomeData.media.buffer, 
                        welcomeData.text,
                        { mentions: welcomeData.mentions }
                    );
                }
            } else {
                // Send text message
                await messageUtils.sendMention(sock, groupId, welcomeData.text, welcomeData.mentions);
            }
            
            // Auto-delete welcome message after specified time
            const groupSettings = await this.getGroupSettings(groupId);
            if (groupSettings.autoDeleteWelcome && groupSettings.deleteAfter > 0) {
                setTimeout(async () => {
                    // Note: Would need to store message ID to delete it
                    // This is a placeholder for future implementation
                }, groupSettings.deleteAfter * 1000);
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error sending welcome message:'), error);
        }
    }

    // Send goodbye message
    async sendGoodbyeMessage(sock, groupId, goodbyeData) {
        try {
            if (goodbyeData.media) {
                // Send media with caption
                if (goodbyeData.media.type === 'image') {
                    await messageUtils.sendImage(
                        sock, 
                        groupId, 
                        goodbyeData.media.buffer, 
                        goodbyeData.text,
                        { mentions: goodbyeData.mentions }
                    );
                } else if (goodbyeData.media.type === 'video') {
                    await messageUtils.sendVideo(
                        sock, 
                        groupId, 
                        goodbyeData.media.buffer, 
                        goodbyeData.text,
                        { mentions: goodbyeData.mentions }
                    );
                }
            } else {
                // Send text message
                await messageUtils.sendMention(sock, groupId, goodbyeData.text, goodbyeData.mentions);
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error sending goodbye message:'), error);
        }
    }

    // Check if user recently joined (prevent spam)
    hasRecentlyJoined(userId, groupId) {
        const key = `${userId}:${groupId}`;
        const joinTime = this.userJoinHistory.get(key);
        
        if (!joinTime) return false;
        
        // Consider "recent" as within last 30 seconds
        return (Date.now() - joinTime) < 30000;
    }

    // Mark user as recently joined
    markRecentJoin(userId, groupId) {
        const key = `${userId}:${groupId}`;
        this.userJoinHistory.set(key, Date.now());
        
        // Auto cleanup after 5 minutes
        setTimeout(() => {
            this.userJoinHistory.delete(key);
        }, 5 * 60 * 1000);
    }

    // Get group settings
    async getGroupSettings(groupId) {
        try {
            // Check cache first
            if (this.groupSettings.has(groupId)) {
                return this.groupSettings.get(groupId);
            }
            
            // Load from storage
            const settings = await storage.getWelcomeSettings(groupId);
            
            // Set defaults
            const defaultSettings = {
                enabled: true,
                welcomeTemplate: 'default',
                goodbyeEnabled: true,
                goodbyeTemplate: 'default',
                promoteEnabled: true,
                demoteEnabled: true,
                autoDeleteWelcome: false,
                deleteAfter: 0, // seconds
                welcomeDelay: 0, // seconds
                mentionEveryone: false,
                customWelcomeText: null,
                customGoodbyeText: null,
                welcomeMedia: null,
                goodbyeMedia: null
            };
            
            const groupSettings = { ...defaultSettings, ...settings };
            
            // Cache settings
            this.groupSettings.set(groupId, groupSettings);
            
            return groupSettings;
            
        } catch (error) {
            console.error(chalk.red('❌ Error getting group settings:'), error);
            return {
                enabled: true,
                welcomeTemplate: 'default',
                goodbyeEnabled: true,
                goodbyeTemplate: 'default'
            };
        }
    }

    // Save group settings
    async saveGroupSettings(groupId, settings) {
        try {
            await storage.saveWelcomeSettings(groupId, settings);
            
            // Update cache
            this.groupSettings.set(groupId, settings);
            
            console.log(chalk.green(`✅ Saved welcome settings for group: ${groupId}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error saving group settings:'), error);
            return false;
        }
    }

    // Save user join data
    async saveUserJoinData(userId, groupId, groupMetadata) {
        try {
            const userData = {
                userId: userId,
                groupId: groupId,
                groupName: groupMetadata.subject,
                joinTime: Date.now(),
                joinDate: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            
            // Get existing join history
            const joinHistory = await storage.getSetting('userJoinHistory', []);
            joinHistory.push(userData);
            
            // Keep only last 1000 joins
            if (joinHistory.length > 1000) {
                joinHistory.splice(0, joinHistory.length - 1000);
            }
            
            await storage.saveSetting('userJoinHistory', joinHistory);
            
        } catch (error) {
            console.error(chalk.red('❌ Error saving user join data:'), error);
        }
    }

    // Cleanup user data
    cleanupUserData(userId, groupId) {
        const key = `${userId}:${groupId}`;
        this.userJoinHistory.delete(key);
    }

    // Load custom templates from storage
    async loadCustomTemplates() {
        try {
            const customWelcome = await storage.getSetting('customWelcomeTemplates', {});
            const customGoodbye = await storage.getSetting('customGoodbyeTemplates', {});
            
            // Load custom welcome templates
            for (const [name, template] of Object.entries(customWelcome)) {
                this.welcomeTemplates.set(name, template);
            }
            
            // Load custom goodbye templates
            for (const [name, template] of Object.entries(customGoodbye)) {
                this.goodbyeTemplates.set(name, template);
            }
            
            console.log(chalk.blue(`📝 Loaded ${Object.keys(customWelcome).length} custom welcome templates`));
            console.log(chalk.blue(`📝 Loaded ${Object.keys(customGoodbye).length} custom goodbye templates`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error loading custom templates:'), error);
        }
    }

    // Load group settings from storage
    async loadGroupSettings() {
        try {
            const allGroupSettings = await storage.getSetting('allWelcomeSettings', {});
            
            for (const [groupId, settings] of Object.entries(allGroupSettings)) {
                this.groupSettings.set(groupId, settings);
            }
            
            console.log(chalk.blue(`⚙️ Loaded settings for ${Object.keys(allGroupSettings).length} groups`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error loading group settings:'), error);
        }
    }

    // Add custom welcome template
    async addWelcomeTemplate(name, template) {
        try {
            this.welcomeTemplates.set(name, template);
            
            // Save to storage
            const customTemplates = await storage.getSetting('customWelcomeTemplates', {});
            customTemplates[name] = template;
            await storage.saveSetting('customWelcomeTemplates', customTemplates);
            
            console.log(chalk.green(`✅ Added welcome template: ${name}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error adding welcome template:'), error);
            return false;
        }
    }

    // Add custom goodbye template
    async addGoodbyeTemplate(name, template) {
        try {
            this.goodbyeTemplates.set(name, template);
            
            // Save to storage
            const customTemplates = await storage.getSetting('customGoodbyeTemplates', {});
            customTemplates[name] = template;
            await storage.saveSetting('customGoodbyeTemplates', customTemplates);
            
            console.log(chalk.green(`✅ Added goodbye template: ${name}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error adding goodbye template:'), error);
            return false;
        }
    }

    // Remove template
    async removeTemplate(type, name) {
        try {
            if (type === 'welcome') {
                this.welcomeTemplates.delete(name);
                const customTemplates = await storage.getSetting('customWelcomeTemplates', {});
                delete customTemplates[name];
                await storage.saveSetting('customWelcomeTemplates', customTemplates);
            } else if (type === 'goodbye') {
                this.goodbyeTemplates.delete(name);
                const customTemplates = await storage.getSetting('customGoodbyeTemplates', {});
                delete customTemplates[name];
                await storage.saveSetting('customGoodbyeTemplates', customTemplates);
            }
            
            console.log(chalk.yellow(`➖ Removed ${type} template: ${name}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error removing template:'), error);
            return false;
        }
    }

    // Get available templates
    getAvailableTemplates(type) {
        if (type === 'welcome') {
            return Array.from(this.welcomeTemplates.keys());
        } else if (type === 'goodbye') {
            return Array.from(this.goodbyeTemplates.keys());
        }
        return [];
    }

    // Preview template
    previewTemplate(type, name, sampleData = {}) {
        try {
            let template;
            
            if (type === 'welcome') {
                template = this.welcomeTemplates.get(name);
            } else if (type === 'goodbye') {
                template = this.goodbyeTemplates.get(name);
            }
            
            if (!template) return null;
            
            // Sample data for preview
            const defaultSampleData = {
                user: 'SampleUser',
                groupName: 'Sample Group',
                memberCount: '100',
                groupDesc: 'This is a sample group description',
                groupCreated: '01/01/2024',
                prefix: config.PREFIX,
                channelLink: config.CHANNEL_LINK,
                footer: config.BOT_FOOTER,
                date: moment().format('DD/MM/YYYY'),
                time: moment().format('HH:mm:ss')
            };
            
            const data = { ...defaultSampleData, ...sampleData };
            
            // Replace placeholders
            let previewText = template.text
                .replace(/@user/g, `@${data.user}`)
                .replace(/{groupName}/g, data.groupName)
                .replace(/{memberCount}/g, data.memberCount)
                .replace(/{groupDesc}/g, data.groupDesc)
                .replace(/{groupCreated}/g, data.groupCreated)
                .replace(/{prefix}/g, data.prefix)
                .replace(/{channelLink}/g, data.channelLink)
                .replace(/{footer}/g, data.footer)
                .replace(/{date}/g, data.date)
                .replace(/{time}/g, data.time);
            
            return {
                text: previewText,
                media: template.media,
                buttons: template.buttons
            };
            
        } catch (error) {
            console.error(chalk.red('❌ Error previewing template:'), error);
            return null;
        }
    }

    // Get welcome statistics
    async getStatistics() {
        try {
            const joinHistory = await storage.getSetting('userJoinHistory', []);
            const allSettings = await storage.getSetting('allWelcomeSettings', {});
            
            const stats = {
                totalJoins: joinHistory.length,
                groupsWithWelcome: Object.keys(allSettings).length,
                recentJoins: joinHistory.slice(-10),
                joinsByGroup: this.getJoinsByGroup(joinHistory),
                joinsByDate: this.getJoinsByDate(joinHistory),
                templateUsage: this.getTemplateUsage(allSettings)
            };
            
            return stats;
            
        } catch (error) {
            console.error(chalk.red('❌ Error getting statistics:'), error);
            return null;
        }
    }

    // Get joins by group
    getJoinsByGroup(joinHistory) {
        const groupCounts = {};
        
        joinHistory.forEach(join => {
            groupCounts[join.groupId] = (groupCounts[join.groupId] || 0) + 1;
        });
        
        return Object.entries(groupCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([groupId, count]) => ({ groupId, count }));
    }

    // Get joins by date
    getJoinsByDate(joinHistory) {
        const dateCounts = {};
        
        joinHistory.forEach(join => {
            const date = moment(join.joinTime).format('YYYY-MM-DD');
            dateCounts[date] = (dateCounts[date] || 0) + 1;
        });
        
        return dateCounts;
    }

    // Get template usage statistics
    getTemplateUsage(allSettings) {
        const templateCounts = {};
        
        Object.values(allSettings).forEach(settings => {
            const welcomeTemplate = settings.welcomeTemplate || 'default';
            const goodbyeTemplate = settings.goodbyeTemplate || 'default';
            
            templateCounts[`welcome_${welcomeTemplate}`] = (templateCounts[`welcome_${welcomeTemplate}`] || 0) + 1;
            templateCounts[`goodbye_${goodbyeTemplate}`] = (templateCounts[`goodbye_${goodbyeTemplate}`] || 0) + 1;
        });
        
        return templateCounts;
    }

    // Generate welcome report
    async generateReport(groupId = null) {
        try {
            const stats = await this.getStatistics();
            if (!stats) return null;
            
            const joinHistory = await storage.getSetting('userJoinHistory', []);
            const groupJoins = groupId ? joinHistory.filter(j => j.groupId === groupId) : joinHistory;
            
            const report = `📊 *WELCOME SYSTEM REPORT* 📊

📈 *Overall Statistics:*
• Total Joins Tracked: ${stats.totalJoins}
• Groups with Welcome: ${stats.groupsWithWelcome}
• Available Templates: ${this.welcomeTemplates.size} welcome, ${this.goodbyeTemplates.size} goodbye

${groupId ? `🏷️ *Group Specific (${groupId}):*
• Total Joins: ${groupJoins.length}
• Recent Activity: ${groupJoins.slice(-5).length} recent joins

` : ''}📋 *Template Usage:*
${Object.entries(stats.templateUsage).map(([template, count]) => `• ${template}: ${count} groups`).join('\n')}

🔝 *Most Active Groups:*
${stats.joinsByGroup.slice(0, 5).map((g, i) => `${i + 1}. ${g.groupId.substring(0, 20)}...: ${g.count} joins`).join('\n')}

📅 *Recent Activity:*
${stats.recentJoins.slice(-5).map(join => `• ${moment(join.joinTime).format('DD/MM HH:mm')} - ${join.groupName}`).join('\n')}

📅 *Generated:* ${moment().format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;

            return report;
            
        } catch (error) {
            console.error(chalk.red('❌ Error generating report:'), error);
            return null;
        }
    }

    // Test welcome message
    async testWelcome(sock, groupId, templateName = 'default') {
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            const groupSettings = await this.getGroupSettings(groupId);
            
            // Override template for testing
            groupSettings.welcomeTemplate = templateName;
            
            // Use bot owner as test user
            const testUserId = config.OWNER_NUMBER + '@s.whatsapp.net';
            
            const welcomeData = await this.prepareWelcomeMessage(testUserId, groupMetadata, groupSettings);
            
            // Add test prefix to message
            welcomeData.text = `🧪 *TEST WELCOME MESSAGE* 🧪\n\n${welcomeData.text}`;
            
            await this.sendWelcomeMessage(sock, groupId, welcomeData);
            
            console.log(chalk.blue(`🧪 Test welcome sent for template: ${templateName}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red('❌ Error testing welcome:'), error);
            return false;
        }
    }

    // Clean old join history
    async cleanOldJoinHistory(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
        try {
            const joinHistory = await storage.getSetting('userJoinHistory', []);
            const now = Date.now();
            
            const recentJoins = joinHistory.filter(join => now - join.joinTime < maxAge);
            
            if (recentJoins.length !== joinHistory.length) {
                await storage.saveSetting('userJoinHistory', recentJoins);
                console.log(chalk.yellow(`🧹 Cleaned ${joinHistory.length - recentJoins.length} old join records`));
                return joinHistory.length - recentJoins.length;
            }
            
            return 0;
            
        } catch (error) {
            console.error(chalk.red('❌ Error cleaning join history:'), error);
            return 0;
        }
    }

    // Bulk update group settings
    async bulkUpdateSettings(settings) {
        try {
            let updated = 0;
            
            for (const [groupId, groupSettings] of Object.entries(settings)) {
                if (await this.saveGroupSettings(groupId, groupSettings)) {
                    updated++;
                }
            }
            
            console.log(chalk.green(`✅ Bulk updated settings for ${updated} groups`));
            return updated;
            
        } catch (error) {
            console.error(chalk.red('❌ Error bulk updating settings:'), error);
            return 0;
        }
    }
}

// Initialize welcome handler
const welcomeHandler = new WelcomeHandler();

// Auto cleanup old join history every 24 hours
setInterval(async () => {
    await welcomeHandler.cleanOldJoinHistory();
}, 24 * 60 * 60 * 1000);

// Main export function
async function handleWelcome(sock, update) {
    return await welcomeHandler.handleParticipantUpdate(sock, update);
}

// Welcome utilities
const WelcomeUtils = {
    // Enable welcome for group
    async enableForGroup(groupId, settings = {}) {
        const defaultSettings = {
            enabled: true,
            welcomeTemplate: 'default',
            goodbyeEnabled: true,
            goodbyeTemplate: 'default'
        };
        
        const groupSettings = { ...defaultSettings, ...settings };
        await welcomeHandler.saveGroupSettings(groupId, groupSettings);
        
        console.log(chalk.green(`✅ Welcome enabled for group: ${groupId}`));
        return true;
    },

    // Disable welcome for group
    async disableForGroup(groupId) {
        const currentSettings = await welcomeHandler.getGroupSettings(groupId);
        currentSettings.enabled = false;
        await welcomeHandler.saveGroupSettings(groupId, currentSettings);
        
        console.log(chalk.yellow(`➖ Welcome disabled for group: ${groupId}`));
        return true;
    },

    // Get group settings
    async getGroupSettings(groupId) {
        return await welcomeHandler.getGroupSettings(groupId);
    },

    // Update group settings
    async updateGroupSettings(groupId, settings) {
        const currentSettings = await welcomeHandler.getGroupSettings(groupId);
        const updatedSettings = { ...currentSettings, ...settings };
        return await welcomeHandler.saveGroupSettings(groupId, updatedSettings);
    },

    // Add custom template
    async addTemplate(type, name, template) {
        if (type === 'welcome') {
            return await welcomeHandler.addWelcomeTemplate(name, template);
        } else if (type === 'goodbye') {
            return await welcomeHandler.addGoodbyeTemplate(name, template);
        }
        return false;
    },

    // Remove template
    async removeTemplate(type, name) {
        return await welcomeHandler.removeTemplate(type, name);
    },

    // Get available templates
    getTemplates(type) {
        return welcomeHandler.getAvailableTemplates(type);
    },

    // Preview template
    previewTemplate(type, name, sampleData = {}) {
        return welcomeHandler.previewTemplate(type, name, sampleData);
    },

    // Get statistics
    async getStats() {
        return await welcomeHandler.getStatistics();
    },

    // Generate report
    async generateReport(groupId = null) {
        return await welcomeHandler.generateReport(groupId);
    },

    // Test welcome
    async testWelcome(sock, groupId, templateName = 'default') {
        return await welcomeHandler.testWelcome(sock, groupId, templateName);
    }
};

// Export handler and utilities
module.exports = {
    handleWelcome,
    welcomeHandler,
    WelcomeUtils
};

// Log initialization
console.log(chalk.green('✅ Welcome handler initialized'));
console.log(chalk.blue(`👋 Welcome templates: ${welcomeHandler.welcomeTemplates.size}`));
console.log(chalk.blue(`👋 Goodbye templates: ${welcomeHandler.goodbyeTemplates.size}`));
