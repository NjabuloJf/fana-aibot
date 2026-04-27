const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('./config');
const { makeid } = require('./id');

// Message utilities and helpers
class MessageUtils {
    constructor() {
        this.messageTypes = {
            text: 'conversation',
            image: 'imageMessage',
            video: 'videoMessage',
            audio: 'audioMessage',
            document: 'documentMessage',
            sticker: 'stickerMessage',
            location: 'locationMessage',
            contact: 'contactMessage',
            poll: 'pollCreationMessage'
        };
    }

    // Get message content
    getMessageContent(message) {
        try {
            const messageType = Object.keys(message.message || {})[0];
            if (!messageType) return null;

            const content = message.message[messageType];
            return {
                type: messageType,
                content: content,
                text: content?.text || content?.caption || '',
                quoted: message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null
            };
        } catch (error) {
            console.error(chalk.red('❌ Error getting message content:'), error);
            return null;
        }
    }

    // Extract command and arguments
    parseCommand(text, prefix = config.PREFIX) {
        try {
            if (!text || !text.startsWith(prefix)) return null;

            const args = text.slice(prefix.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            return {
                command,
                args,
                fullArgs: args.join(' '),
                prefix
            };
        } catch (error) {
            console.error(chalk.red('❌ Error parsing command:'), error);
            return null;
        }
    }

    // Check if user is admin
    async isAdmin(sock, groupId, userId) {
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            const participant = groupMetadata.participants.find(p => p.id === userId);
            return participant?.admin === 'admin' || participant?.admin === 'superadmin';
        } catch (error) {
            console.error(chalk.red('❌ Error checking admin status:'), error);
            return false;
        }
    }

    // Check if user is owner
    isOwner(userId) {
        const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
        const userNumber = userId.replace(/[^0-9]/g, '');
        return userNumber === ownerNumber;
    }

    // Get user info
    async getUserInfo(sock, userId) {
        try {
            const userInfo = await sock.onWhatsApp(userId);
            return userInfo[0] || null;
        } catch (error) {
            console.error(chalk.red('❌ Error getting user info:'), error);
            return null;
        }
    }

    // Format message for logging
    formatMessageLog(message, sender) {
        const timestamp = moment().format('HH:mm:ss');
        const content = this.getMessageContent(message);
        const messageText = content?.text || `[${content?.type || 'unknown'}]`;
        
        return `[${timestamp}] ${sender}: ${messageText}`;
    }

    // Send text message
    async sendText(sock, chatId, text, options = {}) {
        try {
            const messageOptions = {
                text: text,
                ...options
            };

            if (options.quoted) {
                messageOptions.quoted = options.quoted;
            }

            return await sock.sendMessage(chatId, messageOptions);
        } catch (error) {
            console.error(chalk.red('❌ Error sending text:'), error);
            throw error;
        }
    }

    // Send image
    async sendImage(sock, chatId, imageBuffer, caption = '', options = {}) {
        try {
            return await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: caption,
                ...options
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending image:'), error);
            throw error;
        }
    }

    // Send video
    async sendVideo(sock, chatId, videoBuffer, caption = '', options = {}) {
        try {
            return await sock.sendMessage(chatId, {
                video: videoBuffer,
                caption: caption,
                ...options
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending video:'), error);
            throw error;
        }
    }

    // Send audio
    async sendAudio(sock, chatId, audioBuffer, options = {}) {
        try {
            return await sock.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: 'audio/mp4',
                ...options
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending audio:'), error);
            throw error;
        }
    }

    // Send document
    async sendDocument(sock, chatId, documentBuffer, filename, mimetype, options = {}) {
        try {
            return await sock.sendMessage(chatId, {
                document: documentBuffer,
                fileName: filename,
                mimetype: mimetype,
                ...options
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending document:'), error);
            throw error;
        }
    }

    // Send sticker
    async sendSticker(sock, chatId, stickerBuffer, options = {}) {
        try {
            return await sock.sendMessage(chatId, {
                sticker: stickerBuffer,
                ...options
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending sticker:'), error);
            throw error;
        }
    }

    // Send location
    async sendLocation(sock, chatId, latitude, longitude, options = {}) {
        try {
            return await sock.sendMessage(chatId, {
                location: {
                    degreesLatitude: latitude,
                    degreesLongitude: longitude
                },
                ...options
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending location:'), error);
            throw error;
        }
    }

    // Send contact
    async sendContact(sock, chatId, contactData, options = {}) {
        try {
            return await sock.sendMessage(chatId, {
                contacts: {
                    displayName: contactData.name,
                    contacts: [{
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${contactData.name}\nTEL;type=CELL;type=VOICE;waid=${contactData.number}:${contactData.number}\nEND:VCARD`
                    }]
                },
                ...options
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending contact:'), error);
            throw error;
        }
    }

    // React to message
    async react(sock, message, emoji) {
        try {
            return await sock.sendMessage(message.key.remoteJid, {
                react: {
                    text: emoji,
                    key: message.key
                }
            });
        } catch (error) {
            console.error(chalk.red('❌ Error reacting to message:'), error);
            throw error;
        }
    }

    // Delete message
    async deleteMessage(sock, message) {
        try {
            return await sock.sendMessage(message.key.remoteJid, {
                delete: message.key
            });
        } catch (error) {
            console.error(chalk.red('❌ Error deleting message:'), error);
            throw error;
        }
    }


    // Edit message
    async editMessage(sock, message, newText) {
        try {
            return await sock.sendMessage(message.key.remoteJid, {
                text: newText,
                edit: message.key
            });
        } catch (error) {
            console.error(chalk.red('❌ Error editing message:'), error);
            throw error;
        }
    }

    // Send typing indicator
    async sendTyping(sock, chatId, duration = 2000) {
        try {
            await sock.sendPresenceUpdate('composing', chatId);
            setTimeout(async () => {
                await sock.sendPresenceUpdate('paused', chatId);
            }, duration);
        } catch (error) {
            console.error(chalk.red('❌ Error sending typing:'), error);
        }
    }

    // Send recording indicator
    async sendRecording(sock, chatId, duration = 3000) {
        try {
            await sock.sendPresenceUpdate('recording', chatId);
            setTimeout(async () => {
                await sock.sendPresenceUpdate('paused', chatId);
            }, duration);
        } catch (error) {
            console.error(chalk.red('❌ Error sending recording:'), error);
        }
    }

    // Download media from message
    async downloadMedia(sock, message) {
        try {
            const messageContent = this.getMessageContent(message);
            if (!messageContent || !['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(messageContent.type)) {
                throw new Error('No downloadable media found');
            }

            const buffer = await sock.downloadMediaMessage(message);
            return buffer;
        } catch (error) {
            console.error(chalk.red('❌ Error downloading media:'), error);
            throw error;
        }
    }

    // Get quoted message
    getQuotedMessage(message) {
        try {
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMessage) return null;

            return {
                key: message.message.extendedTextMessage.contextInfo.stanzaId,
                message: quotedMessage,
                sender: message.message.extendedTextMessage.contextInfo.participant
            };
        } catch (error) {
            console.error(chalk.red('❌ Error getting quoted message:'), error);
            return null;
        }
    }

    // Format time
    formatTime(timestamp) {
        return moment(timestamp * 1000).format('DD/MM/YYYY HH:mm:ss');
    }

    // Get chat type
    getChatType(chatId) {
        if (chatId.endsWith('@g.us')) return 'group';
        if (chatId.endsWith('@s.whatsapp.net')) return 'private';
        if (chatId.endsWith('@broadcast')) return 'broadcast';
        return 'unknown';
    }

    // Format number
    formatNumber(number) {
        return number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    }

    // Generate message ID
    generateMessageId() {
        return makeid(16);
    }

    // Log message
    logMessage(message, sender, chatType) {
        const logData = {
            timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
            sender: sender,
            chatType: chatType,
            messageId: message.key.id,
            content: this.getMessageContent(message)
        };

        console.log(chalk.blue('📨 Message:'), this.formatMessageLog(message, sender));
        
        // Save to log file (optional)
        this.saveMessageLog(logData);
    }

    // Save message log to file
    async saveMessageLog(logData) {
        try {
            const logDir = path.join(__dirname, 'logs');
            await fs.ensureDir(logDir);
            
            const logFile = path.join(logDir, `messages-${moment().format('YYYY-MM-DD')}.json`);
            let logs = [];
            
            if (await fs.pathExists(logFile)) {
                logs = await fs.readJson(logFile);
            }
            
            logs.push(logData);
            await fs.writeJson(logFile, logs, { spaces: 2 });
        } catch (error) {
            console.error(chalk.red('❌ Error saving message log:'), error);
        }
    }

    // Create button message
    async sendButtonMessage(sock, chatId, text, buttons, options = {}) {
        try {
            const buttonMessage = {
                text: text,
                footer: config.BOT_FOOTER,
                buttons: buttons.map((btn, index) => ({
                    buttonId: btn.id || `btn_${index}`,
                    buttonText: { displayText: btn.text },
                    type: 1
                })),
                headerType: 1,
                ...options
            };

            return await sock.sendMessage(chatId, buttonMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending button message:'), error);
            // Fallback to regular text
            const fallbackText = text + '\n\n' + buttons.map((btn, i) => `${i + 1}. ${btn.text}`).join('\n');
            return await this.sendText(sock, chatId, fallbackText);
        }
    }

    // Create list message
    async sendListMessage(sock, chatId, text, buttonText, sections, options = {}) {
        try {
            const listMessage = {
                text: text,
                footer: config.BOT_FOOTER,
                title: options.title || 'Select an option',
                buttonText: buttonText,
                sections: sections,
                ...options
            };

            return await sock.sendMessage(chatId, listMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending list message:'), error);
            // Fallback to regular text
            let fallbackText = text + '\n\n';
            sections.forEach((section, i) => {
                fallbackText += `*${section.title}*\n`;
                section.rows.forEach((row, j) => {
                    fallbackText += `${j + 1}. ${row.title}\n`;
                });
                fallbackText += '\n';
            });
            return await this.sendText(sock, chatId, fallbackText);
        }
    }

    // Send poll
    async sendPoll(sock, chatId, question, options, selectableCount = 1) {
        try {
            return await sock.sendMessage(chatId, {
                poll: {
                    name: question,
                    values: options,
                    selectableCount: selectableCount
                }
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending poll:'), error);
            throw error;
        }
    }

    // Mention users
    async sendMention(sock, chatId, text, mentions) {
        try {
            return await sock.sendMessage(chatId, {
                text: text,
                mentions: mentions
            });
        } catch (error) {
            console.error(chalk.red('❌ Error sending mention:'), error);
            throw error;
        }
    }

    // Send template message
    async sendTemplate(sock, chatId, templateData) {
        try {
            const template = `🤖 *${config.BOT_NAME}* 🤖

${templateData.title}

${templateData.body}

${templateData.footer || config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, template);
        } catch (error) {
            console.error(chalk.red('❌ Error sending template:'), error);
            throw error;
        }
    }

    // Error message
    async sendError(sock, chatId, error, command = '') {
        try {
            const errorMessage = `❌ *ERROR* ❌

Command: ${command}
Error: ${error.message || error}

Please try again or contact support.

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, errorMessage);
        } catch (err) {
            console.error(chalk.red('❌ Error sending error message:'), err);
        }
    }

    // Success message
    async sendSuccess(sock, chatId, message, data = '') {
        try {
            const successMessage = `✅ *SUCCESS* ✅

${message}

${data}

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, successMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending success message:'), error);
        }
    }


    // Warning message
    async sendWarning(sock, chatId, message) {
        try {
            const warningMessage = `⚠️ *WARNING* ⚠️

${message}

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, warningMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending warning message:'), error);
        }
    }

    // Info message
    async sendInfo(sock, chatId, title, info) {
        try {
            const infoMessage = `ℹ️ *${title}* ℹ️

${info}

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, infoMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending info message:'), error);
        }
    }

    // Loading message
    async sendLoading(sock, chatId, action = 'Processing') {
        try {
            const loadingMessage = `⏳ *${action}...* ⏳

Please wait while I process your request.

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, loadingMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending loading message:'), error);
        }
    }

    // Permission denied message
    async sendPermissionDenied(sock, chatId, requiredRole = 'admin') {
        try {
            const permissionMessage = `🚫 *ACCESS DENIED* 🚫

You need ${requiredRole} permissions to use this command.

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, permissionMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending permission denied:'), error);
        }
    }

    // Command not found
    async sendCommandNotFound(sock, chatId, command) {
        try {
            const notFoundMessage = `❓ *COMMAND NOT FOUND* ❓

Command "${command}" not recognized.
Type ${config.PREFIX}menu to see available commands.

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, notFoundMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending command not found:'), error);
        }
    }

    // Cooldown message
    async sendCooldown(sock, chatId, timeLeft) {
        try {
            const cooldownMessage = `⏰ *COOLDOWN ACTIVE* ⏰

Please wait ${timeLeft} seconds before using this command again.

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, cooldownMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending cooldown message:'), error);
        }
    }

    // Maintenance message
    async sendMaintenance(sock, chatId) {
        try {
            const maintenanceMessage = `🔧 *MAINTENANCE MODE* 🔧

This feature is currently under maintenance.
Please try again later.

${config.BOT_FOOTER}`;

            return await this.sendText(sock, chatId, maintenanceMessage);
        } catch (error) {
            console.error(chalk.red('❌ Error sending maintenance message:'), error);
        }
    }

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Validate URL
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    // Clean text (remove special characters)
    cleanText(text) {
        return text.replace(/[^\w\s]/gi, '').trim();
    }

    // Truncate text
    truncateText(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    // Get file extension
    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    // Check if file is image
    isImage(filename) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
        return imageExtensions.includes(this.getFileExtension(filename));
    }

    // Check if file is video
    isVideo(filename) {
        const videoExtensions = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'];
        return videoExtensions.includes(this.getFileExtension(filename));
    }

    // Check if file is audio
    isAudio(filename) {
        const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
        return audioExtensions.includes(this.getFileExtension(filename));
    }

    // Generate random string
    randomString(length = 10) {
        return makeid(length);
    }

    // Sleep function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Retry function
    async retry(fn, maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await this.sleep(delay * (i + 1));
            }
        }
    }

    // Rate limiter
    rateLimiter = new Map();

    checkRateLimit(userId, command, limit = 5, window = 60000) {
        const key = `${userId}:${command}`;
        const now = Date.now();
        
        if (!this.rateLimiter.has(key)) {
            this.rateLimiter.set(key, { count: 1, resetTime: now + window });
            return true;
        }

        const data = this.rateLimiter.get(key);
        
        if (now > data.resetTime) {
            this.rateLimiter.set(key, { count: 1, resetTime: now + window });
            return true;
        }

        if (data.count >= limit) {
            return false;
        }

        data.count++;
        return true;
    }

    // Clear rate limit data periodically
    clearRateLimitData() {
        const now = Date.now();
        for (const [key, data] of this.rateLimiter.entries()) {
            if (now > data.resetTime) {
                this.rateLimiter.delete(key);
            }
        }
    }
}

// Initialize message utils
const messageUtils = new MessageUtils();

// Clear rate limit data every 5 minutes
setInterval(() => {
    messageUtils.clearRateLimitData();
}, 5 * 60 * 1000);

// Export the class and instance
module.exports = {
    MessageUtils,
    messageUtils
};
