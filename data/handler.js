const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('../config');
const { messageUtils } = require('../msg');
const { storage } = require('../storage');
const { statusManager } = require('../status-online');

// Import other handlers
const antilinkHandler = require('./antilink-handler');
const welcomeHandler = require('./welcome-handler');
const groupHandler = require('./group-handler');

// Command loader
class CommandLoader {
    constructor() {
        this.commands = new Map();
        this.aliases = new Map();
        this.cooldowns = new Map();
        this.loadCommands();
    }

    // Load all commands from cmd directory
    async loadCommands() {
        try {
            const cmdDir = path.join(__dirname, '../cmd');
            const commandFiles = await fs.readdir(cmdDir);
            
            for (const file of commandFiles) {
                if (file.endsWith('.js')) {
                    try {
                        const commandPath = path.join(cmdDir, file);
                        delete require.cache[require.resolve(commandPath)];
                        const command = require(commandPath);
                        
                        if (command.nomCom) {
                            this.commands.set(command.nomCom.toLowerCase(), command);
                            
                            // Load aliases
                            if (command.aliases) {
                                command.aliases.forEach(alias => {
                                    this.aliases.set(alias.toLowerCase(), command.nomCom.toLowerCase());
                                });
                            }
                            
                            console.log(chalk.green(`✅ Loaded command: ${command.nomCom}`));
                        }
                    } catch (error) {
                        console.error(chalk.red(`❌ Error loading command ${file}:`), error);
                    }
                }
            }
            
            console.log(chalk.blue(`📋 Loaded ${this.commands.size} commands`));
        } catch (error) {
            console.error(chalk.red('❌ Error loading commands:'), error);
        }
    }

    // Get command
    getCommand(name) {
        const commandName = this.aliases.get(name.toLowerCase()) || name.toLowerCase();
        return this.commands.get(commandName);
    }

    // Get all commands
    getAllCommands() {
        return Array.from(this.commands.values());
    }

    // Reload commands
    async reloadCommands() {
        this.commands.clear();
        this.aliases.clear();
        await this.loadCommands();
    }
}

// Initialize command loader
const commandLoader = new CommandLoader();

// Main message handler
async function messageHandler(sock, message) {
    try {
        // Basic message validation
        if (!message || !message.key || message.key.fromMe) return;
        
        const messageContent = messageUtils.getMessageContent(message);
        if (!messageContent) return;

        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const messageText = messageContent.text || '';
        
        // Log message
        messageUtils.logMessage(message, senderId, isGroup ? 'group' : 'private');
        
        // Update statistics
        await storage.updateStats('totalMessages');
        
        // Save/update user data
        await saveUserData(senderId, message, isGroup);
        
        // Handle group-specific features
        if (isGroup) {
            await handleGroupMessage(sock, message, messageContent, chatId, senderId);
        }
        
        // Check if message is a command
        const commandData = messageUtils.parseCommand(messageText, config.PREFIX);
        if (commandData) {
            await handleCommand(sock, message, commandData, chatId, senderId, isGroup);
        } else {
            // Handle non-command messages
            await handleNonCommand(sock, message, messageContent, chatId, senderId, isGroup);
        }
        
        // Auto typing
        if (config.AUTO_TYPING === 'true') {
            await statusManager.setTyping(chatId);
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error in message handler:'), error);
        
        // Send error message to user
        try {
            await messageUtils.sendError(sock, message.key.remoteJid, error, 'handler');
        } catch (sendError) {
            console.error(chalk.red('❌ Error sending error message:'), sendError);
        }
    }
}

// Handle group messages
async function handleGroupMessage(sock, message, messageContent, chatId, senderId) {
    try {
        // Antilink check
        if (config.AUTO_ANTILINK === 'true') {
            await antilinkHandler(sock, message, messageContent, chatId, senderId);
        }
        
        // Group-specific handlers
        await groupHandler(sock, message, messageContent, chatId, senderId);
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling group message:'), error);
    }
}

// Handle commands
async function handleCommand(sock, message, commandData, chatId, senderId, isGroup) {
    try {
        const { command, args, fullArgs } = commandData;
        
        // Get command object
        const cmd = commandLoader.getCommand(command);
        if (!cmd) {
            await messageUtils.sendText(sock, chatId, config.COMMAND_NOT_FOUND.replace('{prefix}', config.PREFIX));
            return;
        }
        
        // Check permissions
        const permissionCheck = await checkPermissions(sock, cmd, senderId, chatId, isGroup);
        if (!permissionCheck.allowed) {
            await messageUtils.sendText(sock, chatId, permissionCheck.message);
            return;
        }
        
        // Check cooldown
        const cooldownCheck = checkCooldown(senderId, command);
        if (!cooldownCheck.allowed) {
            await messageUtils.sendText(sock, chatId, 
                `⏰ Command on cooldown. Wait ${cooldownCheck.timeLeft} seconds.`);
            return;
        }
        
        // Check if user is banned
        if (await storage.isBanned(senderId)) {
            await messageUtils.sendText(sock, chatId, '🚫 You are banned from using this bot.');
            return;
        }
        
        // Update command statistics
        await storage.updateStats('totalCommands');
        
        // React to command
        if (cmd.reaction) {
            await messageUtils.react(sock, message, cmd.reaction);
        }
        
        // Create command context
        const context = {
            sock: sock,
            message: message,
            args: args,
            fullArgs: fullArgs,
            chatId: chatId,
            senderId: senderId,
            isGroup: isGroup,
            command: command,
            prefix: config.PREFIX,
            quoted: messageUtils.getQuotedMessage(message),
            reply: async (text, options = {}) => {
                return await messageUtils.sendText(sock, chatId, text, { quoted: message, ...options });
            },
            send: async (text, options = {}) => {
                return await messageUtils.sendText(sock, chatId, text, options);
            },
            react: async (emoji) => {
                return await messageUtils.react(sock, message, emoji);
            }
        };
        
        // Execute command
        console.log(chalk.blue(`🔧 Executing command: ${command} by ${senderId}`));
        
        try {
            await cmd.execute(context);
            
            // Set cooldown
            setCooldown(senderId, command, cmd.cooldown || 3000);
            
            // Log successful command execution
            console.log(chalk.green(`✅ Command executed: ${command}`));
            
        } catch (cmdError) {
            console.error(chalk.red(`❌ Command execution error (${command}):`), cmdError);
            await messageUtils.sendError(sock, chatId, cmdError, command);
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling command:'), error);
        await messageUtils.sendError(sock, chatId, error, 'command handler');
    }
}

// Handle non-command messages
async function handleNonCommand(sock, message, messageContent, chatId, senderId, isGroup) {
    try {
        const messageText = messageContent.text.toLowerCase();
        
        // Auto-responses for common greetings
        const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
        if (greetings.some(greeting => messageText.includes(greeting))) {
            const responses = [
                `Hello! 👋 Type ${config.PREFIX}menu to see available commands.`,
                `Hi there! 😊 Use ${config.PREFIX}help to get started.`,
                `Hey! 🤖 I'm Fana AI Bot. Type ${config.PREFIX}ping to test me!`
            ];
            
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            await messageUtils.sendText(sock, chatId, randomResponse);
            return;
        }
        
        // Auto-responses for help requests
        const helpKeywords = ['help', 'how to use', 'commands', 'what can you do'];
        if (helpKeywords.some(keyword => messageText.includes(keyword))) {
            const helpMessage = `❓ *NEED HELP?* ❓

🤖 I'm Fana AI Bot! Here's how to use me:

📋 *Basic Commands:*
• ${config.PREFIX}menu - Show all commands
• ${config.PREFIX}ping - Test bot status
• ${config.PREFIX}help - Get detailed help

💡 *Tips:*
• All commands start with "${config.PREFIX}"
• Type ${config.PREFIX}menu to see everything I can do
• Use ${config.PREFIX}help [command] for specific help

${config.BOT_FOOTER}`;

            await messageUtils.sendText(sock, chatId, helpMessage);
            return;
        }
        
        // Handle mentions in groups
        if (isGroup && messageText.includes('@' + config.BOT_NAME.toLowerCase())) {
            await messageUtils.sendText(sock, chatId, 
                `🤖 You mentioned me! Type ${config.PREFIX}menu to see what I can do.`);
            return;
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling non-command:'), error);
    }
}

// Check permissions
async function checkPermissions(sock, cmd, senderId, chatId, isGroup) {
    try {
        // Owner check
        if (cmd.ownerOnly && !messageUtils.isOwner(senderId)) {
            return {
                allowed: false,
                message: config.OWNER_ONLY
            };
        }
        
        // Admin check
        if (cmd.adminOnly) {
            if (isGroup) {
                const isAdmin = await messageUtils.isAdmin(sock, chatId, senderId);
                const isOwner = messageUtils.isOwner(senderId);
                const isBotAdmin = await storage.isAdmin(senderId);
                
                if (!isAdmin && !isOwner && !isBotAdmin) {
                    return {
                        allowed: false,
                        message: config.ADMIN_ONLY
                    };
                }
            } else {
                return {
                    allowed: false,
                    message: config.GROUP_ONLY
                };
            }
        }
        
        // Group only check
        if (cmd.groupOnly && !isGroup) {
            return {
                allowed: false,
                message: config.GROUP_ONLY
            };
        }
        
        // Private only check
        if (cmd.privateOnly && isGroup) {
            return {
                allowed: false,
                message: 'This command can only be used in private chat.'
            };
        }
        
        return { allowed: true };
        
    } catch (error) {
        console.error(chalk.red('❌ Error checking permissions:'), error);
        return {
            allowed: false,
            message: 'Error checking permissions. Please try again.'
        };
    }
}

// Check cooldown
function checkCooldown(userId, command) {
    const key = `${userId}:${command}`;
    const now = Date.now();
    
    if (commandLoader.cooldowns.has(key)) {
        const cooldownData = commandLoader.cooldowns.get(key);
        const timeLeft = Math.ceil((cooldownData.expires - now) / 1000);
        
        if (now < cooldownData.expires) {
            return {
                allowed: false,
                timeLeft: timeLeft
            };
        }
    }
    
    return { allowed: true };
}

// Set cooldown
function setCooldown(userId, command, duration = 3000) {
    const key = `${userId}:${command}`;
    const expires = Date.now() + duration;
    
    commandLoader.cooldowns.set(key, { expires });
    
    // Auto cleanup expired cooldowns
    setTimeout(() => {
        commandLoader.cooldowns.delete(key);
    }, duration);
}

// Save user data
async function saveUserData(senderId, message, isGroup) {
    try {
        const userData = {
            id: senderId,
            name: message.pushName || 'Unknown',
            lastMessage: Date.now(),
            messageCount: 1,
            isGroup: isGroup
        };
        
        // Get existing user data
        const existingUser = await storage.getUser(senderId);
        if (existingUser) {
            userData.messageCount = (existingUser.messageCount || 0) + 1;
            userData.firstSeen = existingUser.firstSeen || Date.now();
        } else {
            userData.firstSeen = Date.now();
            await storage.updateStats('totalUsers');
        }
        
        await storage.saveUser(senderId, userData);
        
    } catch (error) {
        console.error(chalk.red('❌ Error saving user data:'), error);
    }
}

// Handle media messages
async function handleMediaMessage(sock, message, messageContent, chatId, senderId) {
    try {
        const mediaType = messageContent.type;
        
        // Download media if needed
        if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(mediaType)) {
            console.log(chalk.blue(`📎 Media received: ${mediaType} from ${senderId}`));
            
            // You can add media processing logic here
            // For example: virus scanning, file size checks, etc.
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling media:'), error);
    }
}

// Handle sticker messages
async function handleStickerMessage(sock, message, messageContent, chatId, senderId) {
    try {
        console.log(chalk.blue(`🎭 Sticker received from ${senderId}`));
        
        // Auto-react to stickers if enabled
        if (config.AUTO_LIKE_STATUS === 'true') {
            const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
            await messageUtils.react(sock, message, randomEmoji);
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling sticker:'), error);
    }
}

// Handle location messages
async function handleLocationMessage(sock, message, messageContent, chatId, senderId) {
    try {
        console.log(chalk.blue(`📍 Location received from ${senderId}`));
        
        const location = messageContent.content;
        if (location && location.degreesLatitude && location.degreesLongitude) {
            console.log(`📍 Coordinates: ${location.degreesLatitude}, ${location.degreesLongitude}`);
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling location:'), error);
    }
}

// Handle contact messages
async function handleContactMessage(sock, message, messageContent, chatId, senderId) {
    try {
        console.log(chalk.blue(`👤 Contact received from ${senderId}`));
        
        const contact = messageContent.content;
        if (contact && contact.displayName) {
            console.log(`👤 Contact: ${contact.displayName}`);
            
            // Auto-react to contacts
            await messageUtils.react(sock, message, '👤');
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling contact:'), error);
    }
}

// Handle poll messages
async function handlePollMessage(sock, message, messageContent, chatId, senderId) {
    try {
        console.log(chalk.blue(`📊 Poll received from ${senderId}`));
        
        const poll = messageContent.content;
        if (poll && poll.name) {
            console.log(`📊 Poll: ${poll.name}`);
            
            // Auto-react to polls
            await messageUtils.react(sock, message, '📊');
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling poll:'), error);
    }
}

// Handle button responses
async function handleButtonResponse(sock, message, chatId, senderId) {
    try {
        const buttonResponse = message.message?.buttonsResponseMessage;
        if (buttonResponse) {
            const selectedButton = buttonResponse.selectedButtonId;
            console.log(chalk.blue(`🔘 Button pressed: ${selectedButton} by ${senderId}`));
            
            // Handle button responses based on ID
            await processButtonResponse(sock, selectedButton, chatId, senderId, message);
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling button response:'), error);
    }
}

// Handle list responses
async function handleListResponse(sock, message, chatId, senderId) {
    try {
        const listResponse = message.message?.listResponseMessage;
        if (listResponse) {
            const selectedOption = listResponse.singleSelectReply?.selectedRowId;
            console.log(chalk.blue(`📋 List option selected: ${selectedOption} by ${senderId}`));
            
            // Handle list responses based on ID
            await processListResponse(sock, selectedOption, chatId, senderId, message);
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling list response:'), error);
    }
}

// Process button responses
async function processButtonResponse(sock, buttonId, chatId, senderId, message) {
    try {
        switch (buttonId) {
            case 'menu_general':
                // Show general commands
                const generalCommands = commandLoader.getAllCommands()
                    .filter(cmd => cmd.categorie === 'general')
                    .map(cmd => `• ${config.PREFIX}${cmd.nomCom} - ${cmd.description || 'No description'}`)
                    .join('\n');
                
                await messageUtils.sendText(sock, chatId, `🔧 *GENERAL COMMANDS*\n\n${generalCommands}`);
                break;
                
            case 'menu_admin':
                // Show admin commands
                const adminCommands = commandLoader.getAllCommands()
                    .filter(cmd => cmd.categorie === 'admin')
                    .map(cmd => `• ${config.PREFIX}${cmd.nomCom} - ${cmd.description || 'No description'}`)
                    .join('\n');
                
                await messageUtils.sendText(sock, chatId, `👑 *ADMIN COMMANDS*\n\n${adminCommands}`);
                break;
                
            case 'bot_status':
                // Show bot status
                const statusMessage = statusManager.getFormattedStatus();
                await messageUtils.sendText(sock, chatId, statusMessage);
                break;
                
            case 'help_support':
                // Show support info
                const supportMessage = `🆘 *SUPPORT & HELP*

📞 *Contact:*
• Owner: ${config.OWNER_NAME}
• Channel: ${config.CHANNEL_LINK}

💡 *Quick Help:*
• ${config.PREFIX}ping - Test bot
• ${config.PREFIX}menu - All commands
• ${config.PREFIX}help [command] - Command help

${config.BOT_FOOTER}`;
                
                await messageUtils.sendText(sock, chatId, supportMessage);
                break;
                
            default:
                console.log(chalk.yellow(`⚠️ Unknown button ID: ${buttonId}`));
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error processing button response:'), error);
    }
}

// Process list responses
async function processListResponse(sock, optionId, chatId, senderId, message) {
    try {
        switch (optionId) {
            case 'cmd_general':
                // Execute general command logic
                break;
                
            case 'cmd_admin':
                // Execute admin command logic
                break;
                
            case 'settings_antilink':
                // Toggle antilink settings
                const currentSettings = await storage.getAntilinkSettings(chatId);
                const newStatus = !currentSettings.enabled;
                
                await storage.saveAntilinkSettings(chatId, { enabled: newStatus });
                await messageUtils.sendText(sock, chatId, 
                    `🔗 Antilink ${newStatus ? 'enabled' : 'disabled'} for this group.`);
                break;
                
            default:
                console.log(chalk.yellow(`⚠️ Unknown list option: ${optionId}`));
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error processing list response:'), error);
    }
}

// Enhanced message type handler
async function handleMessageByType(sock, message, messageContent, chatId, senderId, isGroup) {
    try {
        const messageType = messageContent.type;
        
        switch (messageType) {
            case 'imageMessage':
                await handleMediaMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'videoMessage':
                await handleMediaMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'audioMessage':
                await handleMediaMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'documentMessage':
                await handleMediaMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'stickerMessage':
                await handleStickerMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'locationMessage':
                await handleLocationMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'contactMessage':
                await handleContactMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'pollCreationMessage':
                await handlePollMessage(sock, message, messageContent, chatId, senderId);
                break;
                
            case 'buttonsResponseMessage':
                await handleButtonResponse(sock, message, chatId, senderId);
                break;
                
            case 'listResponseMessage':
                await handleListResponse(sock, message, chatId, senderId);
                break;
                
            default:
                // Handle text messages and unknown types
                if (messageContent.text) {
                    console.log(chalk.blue(`💬 Text message from ${senderId}: ${messageContent.text.substring(0, 50)}...`));
                }
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error handling message by type:'), error);
    }
}

// Rate limiting
const rateLimiter = new Map();

function checkRateLimit(userId, limit = 10, window = 60000) {
    const now = Date.now();
    const userKey = userId;
    
    if (!rateLimiter.has(userKey)) {
        rateLimiter.set(userKey, { count: 1, resetTime: now + window });
        return true;
    }
    
    const userData = rateLimiter.get(userKey);
    
    if (now > userData.resetTime) {
        rateLimiter.set(userKey, { count: 1, resetTime: now + window });
        return true;
    }
    
    if (userData.count >= limit) {
        return false;
    }
    
    userData.count++;
    return true;
}

// Clean rate limiter periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimiter.entries()) {
        if (now > data.resetTime) {
            rateLimiter.delete(key);
        }
    }
}, 60000); // Clean every minute

// Message filter
function shouldProcessMessage(message, messageContent) {
    // Skip empty messages
    if (!messageContent || (!messageContent.text && !messageContent.content)) {
        return false;
    }
    
    // Skip old messages (older than 5 minutes)
    const messageTime = message.messageTimestamp * 1000;
    const now = Date.now();
    if (now - messageTime > 5 * 60 * 1000) {
        return false;
    }
    
    return true;
}

// Enhanced main handler with all features
async function enhancedMessageHandler(sock, message) {
    try {
        // Basic validation
        if (!message || !message.key || message.key.fromMe) return;
        
        const messageContent = messageUtils.getMessageContent(message);
        if (!shouldProcessMessage(message, messageContent)) return;

        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        
        // Rate limiting
        if (!checkRateLimit(senderId)) {
            console.log(chalk.yellow(`⚠️ Rate limit exceeded for ${senderId}`));
            return;
        }
        
        // Handle message by type first
        await handleMessageByType(sock, message, messageContent, chatId, senderId, isGroup);
        
        // Continue with main message processing
        await messageHandler(sock, message);
        
    } catch (error) {
        console.error(chalk.red('❌ Error in enhanced message handler:'), error);
    }
}

// Command statistics
const commandStats = {
    totalExecuted: 0,
    commandCounts: new Map(),
    errorCounts: new Map(),
    
    increment(command) {
        this.totalExecuted++;
        this.commandCounts.set(command, (this.commandCounts.get(command) || 0) + 1);
    },
    
    incrementError(command) {
        this.errorCounts.set(command, (this.errorCounts.get(command) || 0) + 1);
    },
    
    getStats() {
        return {
            total: this.totalExecuted,
            commands: Object.fromEntries(this.commandCounts),
            errors: Object.fromEntries(this.errorCounts)
        };
    }
};

// Auto-save command stats every 5 minutes
setInterval(async () => {
    try {
        await storage.saveSetting('commandStats', commandStats.getStats());
    } catch (error) {
        console.error(chalk.red('❌ Error saving command stats:'), error);
    }
}, 5 * 60 * 1000);

// Message queue for handling high volume
class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.maxQueueSize = 1000;
    }
    
    add(sock, message) {
        if (this.queue.length >= this.maxQueueSize) {
            console.log(chalk.yellow('⚠️ Message queue full, dropping oldest message'));
            this.queue.shift();
        }
        
        this.queue.push({ sock, message, timestamp: Date.now() });
        this.process();
    }
    
    async process() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const { sock, message } = this.queue.shift();
            
            try {
                await enhancedMessageHandler(sock, message);
            } catch (error) {
                console.error(chalk.red('❌ Error processing queued message:'), error);
            }
            
            // Small delay to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.processing = false;
    }
    
    getQueueSize() {
        return this.queue.length;
    }
}

// Initialize message queue
const messageQueue = new MessageQueue();

// Spam detection
const spamDetector = {
    userMessages: new Map(),
    
    isSpam(userId, messageText) {
        const now = Date.now();
        const userKey = userId;
        
        if (!this.userMessages.has(userKey)) {
            this.userMessages.set(userKey, []);
        }
        
        const userMsgs = this.userMessages.get(userKey);
        
        // Remove messages older than 1 minute
        const recentMsgs = userMsgs.filter(msg => now - msg.timestamp < 60000);
        
        // Check for spam patterns
        if (recentMsgs.length >= 5) {
            // Too many messages in short time
            return true;
        }
        
        // Check for repeated messages
        const duplicates = recentMsgs.filter(msg => msg.text === messageText);
        if (duplicates.length >= 3) {
            return true;
        }
        
        // Add current message
        recentMsgs.push({ text: messageText, timestamp: now });
        this.userMessages.set(userKey, recentMsgs);
        
        return false;
    },
    
    cleanup() {
        const now = Date.now();
        for (const [userId, messages] of this.userMessages.entries()) {
            const recentMsgs = messages.filter(msg => now - msg.timestamp < 60000);
            if (recentMsgs.length === 0) {
                this.userMessages.delete(userId);
            } else {
                this.userMessages.set(userId, recentMsgs);
            }
        }
    }
};

// Clean spam detector every 5 minutes
setInterval(() => {
    spamDetector.cleanup();
}, 5 * 60 * 1000);

// Final message handler with all features
async function finalMessageHandler(sock, message) {
    try {
        // Basic validation
        if (!message || !message.key || message.key.fromMe) return;
        
        const messageContent = messageUtils.getMessageContent(message);
        if (!messageContent) return;
        
        const senderId = message.key.participant || message.key.remoteJid;
        const messageText = messageContent.text || '';
        
        // Spam detection
        if (spamDetector.isSpam(senderId, messageText)) {
            console.log(chalk.yellow(`⚠️ Spam detected from ${senderId}`));
            return;
        }
        
        // Add to message queue for processing
        messageQueue.add(sock, message);
        
    } catch (error) {
        console.error(chalk.red('❌ Error in final message handler:'), error);
    }
}

// Handler utilities
const HandlerUtils = {
    // Get command list by category
    getCommandsByCategory(category) {
        return commandLoader.getAllCommands().filter(cmd => cmd.categorie === category);
    },
    
    // Get command info
    getCommandInfo(commandName) {
        return commandLoader.getCommand(commandName);
    },
    
    // Reload all commands
    async reloadCommands() {
        await commandLoader.reloadCommands();
        return commandLoader.commands.size;
    },
    
    // Get handler statistics
    getStats() {
        return {
            commands: commandLoader.commands.size,
            aliases: commandLoader.aliases.size,
            queueSize: messageQueue.getQueueSize(),
            commandStats: commandStats.getStats(),
            rateLimitEntries: rateLimiter.size
        };
    },
    
    // Clear all caches
    clearCaches() {
        commandLoader.cooldowns.clear();
        rateLimiter.clear();
        spamDetector.userMessages.clear();
        console.log(chalk.green('✅ Handler caches cleared'));
    }
};

// Export main handler and utilities
module.exports = {
    messageHandler: finalMessageHandler,
    enhancedMessageHandler,
    commandLoader,
    HandlerUtils,
    commandStats,
    messageQueue,
    spamDetector
};

// Log handler initialization
console.log(chalk.green('✅ Message handler initialized'));
console.log(chalk.blue(`📋 Commands loaded: ${commandLoader.commands.size}`));
console.log(chalk.blue(`🔄 Aliases loaded: ${commandLoader.aliases.size}`));
