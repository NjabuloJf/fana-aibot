const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const QRCode = require('qrcode');
const moment = require('moment-timezone');
const config = require('./config');
const { makeid, generatePairingCode, generateSessionId, idStorage } = require('./id');
const P = require('pino');

class PairingManager {
    constructor() {
        this.activePairings = new Map();
        this.qrCodes = new Map();
        this.pairingCodes = new Map();
        this.sessionDir = path.join(__dirname, 'session');
        this.tempSessionDir = path.join(__dirname, 'temp_sessions');
        this.maxPairingAttempts = 3;
        this.pairingTimeout = 5 * 60 * 1000; // 5 minutes
        
        this.initializeDirs();
    }

    async initializeDirs() {
        try {
            await fs.ensureDir(this.sessionDir);
            await fs.ensureDir(this.tempSessionDir);
            console.log(chalk.green('✅ Pairing directories initialized'));
        } catch (error) {
            console.error(chalk.red('❌ Error initializing directories:'), error);
        }
    }

    // Generate QR code for pairing
    async generateQRCode(sessionId) {
        try {
            console.log(chalk.yellow('📱 Generating QR code for pairing...'));
            
            const tempSessionPath = path.join(this.tempSessionDir, sessionId);
            await fs.ensureDir(tempSessionPath);
            
            const { state, saveCreds } = await useMultiFileAuthState(tempSessionPath);
            
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: P({ level: 'silent' }),
                browser: Browsers.macOS('Desktop'),
                generateHighQualityLinkPreview: true,
            });

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    sock.end();
                    this.cleanupTempSession(sessionId);
                    reject(new Error('QR code generation timeout'));
                }, this.pairingTimeout);

                sock.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    
                    if (qr) {
                        try {
                            const qrString = await QRCode.toString(qr, { type: 'terminal', small: true });
                            const qrDataURL = await QRCode.toDataURL(qr);
                            
                            this.qrCodes.set(sessionId, {
                                qr: qr,
                                qrString: qrString,
                                qrDataURL: qrDataURL,
                                timestamp: Date.now()
                            });

                            console.log(chalk.green('✅ QR Code generated successfully'));
                            console.log(qrString);
                            
                            clearTimeout(timeout);
                            resolve({
                                sessionId: sessionId,
                                qr: qr,
                                qrDataURL: qrDataURL,
                                expires: Date.now() + this.pairingTimeout
                            });
                        } catch (error) {
                            console.error(chalk.red('❌ Error processing QR code:'), error);
                            clearTimeout(timeout);
                            reject(error);
                        }
                    }
                    
                    if (connection === 'open') {
                        console.log(chalk.green('✅ QR Code pairing successful!'));
                        await this.completePairing(sessionId, tempSessionPath, sock);
                        clearTimeout(timeout);
                    }
                    
                    if (connection === 'close') {
                        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                        if (!shouldReconnect) {
                            console.log(chalk.red('❌ QR pairing failed or cancelled'));
                            this.cleanupTempSession(sessionId);
                            clearTimeout(timeout);
                            reject(new Error('Pairing failed or cancelled'));
                        }
                    }
                });

                sock.ev.on('creds.update', saveCreds);
            });
        } catch (error) {
            console.error(chalk.red('❌ Error generating QR code:'), error);
            throw error;
        }
    }

    // Generate pairing code for phone number
    async generatePairingCodeForPhone(phoneNumber, sessionId) {
        try {
            console.log(chalk.yellow(`📱 Generating pairing code for ${phoneNumber}...`));
            
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            if (cleanNumber.length < 10) {
                throw new Error('Invalid phone number format');
            }

            const tempSessionPath = path.join(this.tempSessionDir, sessionId);
            await fs.ensureDir(tempSessionPath);
            
            const { state, saveCreds } = await useMultiFileAuthState(tempSessionPath);
            
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: P({ level: 'silent' }),
                browser: Browsers.macOS('Desktop'),
                generateHighQualityLinkPreview: true,
            });

            return new Promise(async (resolve, reject) => {
                const timeout = setTimeout(() => {
                    sock.end();
                    this.cleanupTempSession(sessionId);
                    reject(new Error('Pairing code generation timeout'));
                }, this.pairingTimeout);

                try {
                    if (!sock.authState.creds.registered) {
                        const code = await sock.requestPairingCode(cleanNumber);
                        const formattedCode = code.match(/.{1,4}/g).join('-');
                        
                        this.pairingCodes.set(sessionId, {
                            code: code,
                            formattedCode: formattedCode,
                            phoneNumber: cleanNumber,
                            timestamp: Date.now()
                        });

                        console.log(chalk.green(`🔑 Pairing Code: ${formattedCode}`));
                        
                        clearTimeout(timeout);
                        resolve({
                            sessionId: sessionId,
                            code: code,
                            formattedCode: formattedCode,
                            phoneNumber: cleanNumber,
                            expires: Date.now() + this.pairingTimeout
                        });
                    } else {
                        clearTimeout(timeout);
                        reject(new Error('Device already registered'));
                    }
                } catch (error) {
                    console.error(chalk.red('❌ Error requesting pairing code:'), error);
                    clearTimeout(timeout);
                    reject(error);
                }

                sock.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect } = update;
                    
                    if (connection === 'open') {
                        console.log(chalk.green('✅ Pairing code connection successful!'));
                        await this.completePairing(sessionId, tempSessionPath, sock);
                        clearTimeout(timeout);
                    }
                    
                    if (connection === 'close') {
                        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                        if (!shouldReconnect) {
                            console.log(chalk.red('❌ Pairing code failed or cancelled'));
                            this.cleanupTempSession(sessionId);
                            clearTimeout(timeout);
                            reject(new Error('Pairing failed or cancelled'));
                        }
                    }
                });

                sock.ev.on('creds.update', saveCreds);
            });
        } catch (error) {
            console.error(chalk.red('❌ Error generating pairing code:'), error);
            throw error;
        }
    }

    // Complete pairing process
    async completePairing(sessionId, tempSessionPath, sock) {
        try {
            console.log(chalk.blue('🔄 Completing pairing process...'));
            
            // Move temp session to main session directory
            await fs.remove(this.sessionDir);
            await fs.move(tempSessionPath, this.sessionDir);
            
            // Store pairing info
            const pairingInfo = {
                sessionId: sessionId,
                timestamp: Date.now(),
                phoneNumber: sock.user?.id?.split(':')[0] || 'unknown',
                deviceId: sock.user?.id || 'unknown',
                platform: 'fana-aibot'
            };
            
            await this.savePairingInfo(pairingInfo);
            
            // Send success message to owner
            await this.sendPairingSuccessMessage(sock, pairingInfo);
            
            // Clean up temporary data
            this.qrCodes.delete(sessionId);
            this.pairingCodes.delete(sessionId);
            this.activePairings.delete(sessionId);
            
            console.log(chalk.green('✅ Pairing completed successfully!'));
            
            return pairingInfo;
        } catch (error) {
            console.error(chalk.red('❌ Error completing pairing:'), error);
            throw error;
        }
    }

    // Send pairing success message
    async sendPairingSuccessMessage(sock, pairingInfo) {
        try {
            const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
            const message = `🎉 *FANA-AIBOT PAIRED SUCCESSFULLY* 🎉

✅ *Status:* Connected
📱 *Phone:* ${pairingInfo.phoneNumber}
🆔 *Device ID:* ${pairingInfo.deviceId}
📅 *Date:* ${moment().format('DD/MM/YYYY')}
⏰ *Time:* ${moment().format('HH:mm:ss')}
🔧 *Prefix:* ${config.PREFIX}
🤖 *Bot Name:* ${config.BOT_NAME}
🌟 *Version:* ${config.BOT_VERSION}

💡 *Quick Start:*
• ${config.PREFIX}ping - Test bot
• ${config.PREFIX}menu - View commands
• ${config.PREFIX}help - Get help

🔗 *Channel:* ${config.CHANNEL_LINK}

${config.BOT_FOOTER}`;

            await sock.sendMessage(ownerJid, { text: message });
            console.log(chalk.green('✅ Pairing success message sent'));
        } catch (error) {
            console.error(chalk.red('❌ Error sending pairing success message:'), error);
        }
    }

    // Save pairing information
    async savePairingInfo(pairingInfo) {
        try {
            const pairingFile = path.join(__dirname, 'data', 'pairing.json');
            await fs.ensureDir(path.dirname(pairingFile));
            
            let pairings = [];
            if (await fs.pathExists(pairingFile)) {
                pairings = await fs.readJson(pairingFile);
            }
            
            pairings.push(pairingInfo);
            await fs.writeJson(pairingFile, pairings, { spaces: 2 });
            
            console.log(chalk.green('✅ Pairing info saved'));
        } catch (error) {
            console.error(chalk.red('❌ Error saving pairing info:'), error);
        }
    }

    // Clean up temporary session
    async cleanupTempSession(sessionId) {
        try {
            const tempSessionPath = path.join(this.tempSessionDir, sessionId);
            if (await fs.pathExists(tempSessionPath)) {
                await fs.remove(tempSessionPath);
                console.log(chalk.yellow(`🧹 Cleaned up temp session: ${sessionId}`));
            }
        } catch (error) {
            console.error(chalk.red('❌ Error cleaning temp session:'), error);
        }
    }

    // Get QR code data
    getQRCode(sessionId) {
        return this.qrCodes.get(sessionId);
    }

    // Get pairing code data
    getPairingCode(sessionId) {
        return this.pairingCodes.get(sessionId);
    }

    // Check if session exists
    async sessionExists() {
        try {
            const credsPath = path.join(this.sessionDir, 'creds.json');
            return await fs.pathExists(credsPath);
        } catch (error) {
            return false;
        }
    }

    // Delete existing session
    async deleteSession() {
        try {
            if (await fs.pathExists(this.sessionDir)) {
                await fs.remove(this.sessionDir);
                console.log(chalk.yellow('🗑️ Existing session deleted'));
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error deleting session:'), error);
            return false;
        }
    }

    // Start pairing process
    async startPairing(method = 'qr', phoneNumber = null) {
        try {
            const sessionId = generateSessionId();
            
            console.log(chalk.blue(`🚀 Starting ${method.toUpperCase()} pairing...`));
            console.log(chalk.blue(`📋 Session ID: ${sessionId}`));
            
            this.activePairings.set(sessionId, {
                method: method,
                phoneNumber: phoneNumber,
                startTime: Date.now(),
                status: 'pending'
            });

            if (method === 'qr') {
                return await this.generateQRCode(sessionId);
            } else if (method === 'code' && phoneNumber) {
                return await this.generatePairingCodeForPhone(phoneNumber, sessionId);
            } else {
                throw new Error('Invalid pairing method or missing phone number');
            }
        } catch (error) {
            console.error(chalk.red('❌ Error starting pairing:'), error);
            throw error;
        }
    }

    // Cancel pairing process
    async cancelPairing(sessionId) {
        try {
            if (this.activePairings.has(sessionId)) {
                this.activePairings.delete(sessionId);
                this.qrCodes.delete(sessionId);
                this.pairingCodes.delete(sessionId);
                await this.cleanupTempSession(sessionId);
                
                console.log(chalk.yellow(`❌ Pairing cancelled: ${sessionId}`));
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error cancelling pairing:'), error);
            return false;
        }
    }

    // Get pairing status
    getPairingStatus(sessionId) {
        const pairing = this.activePairings.get(sessionId);
        if (!pairing) {
            return { status: 'not_found' };
        }

        const elapsed = Date.now() - pairing.startTime;
        const remaining = Math.max(0, this.pairingTimeout - elapsed);

        return {
            ...pairing,
            elapsed: elapsed,
            remaining: remaining,
            expired: remaining === 0
        };
    }

    // Get all active pairings
    getActivePairings() {
        const pairings = [];
        for (const [sessionId, data] of this.activePairings.entries()) {
            pairings.push({
                sessionId: sessionId,
                ...this.getPairingStatus(sessionId)
            });
        }
        return pairings;
    }

    // Clean expired pairings
    cleanExpiredPairings() {
        const now = Date.now();
        let cleaned = 0;

        for (const [sessionId, data] of this.activePairings.entries()) {
            if (now - data.startTime > this.pairingTimeout) {
                this.cancelPairing(sessionId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(chalk.yellow(`🧹 Cleaned ${cleaned} expired pairings`));
        }

        return cleaned;
    }

    // Validate phone number
    validatePhoneNumber(phoneNumber) {
        const cleaned = phoneNumber.replace(/[^0-9]/g, '');
        
        if (cleaned.length < 10 || cleaned.length > 15) {
            return { valid: false, error: 'Phone number must be 10-15 digits' };
        }

        // Check for common invalid patterns
        if (/^0+$/.test(cleaned) || /^1+$/.test(cleaned)) {
            return { valid: false, error: 'Invalid phone number pattern' };
        }

        return { valid: true, cleaned: cleaned };
    }

    // Get pairing history
    async getPairingHistory() {
        try {
            const pairingFile = path.join(__dirname, 'data', 'pairing.json');
            if (await fs.pathExists(pairingFile)) {
                return await fs.readJson(pairingFile);
            }
            return [];
        } catch (error) {
            console.error(chalk.red('❌ Error getting pairing history:'), error);
            return [];
        }
    }

    // Reset pairing system
    async resetPairing() {
        try {
            console.log(chalk.yellow('🔄 Resetting pairing system...'));
            
            // Cancel all active pairings
            for (const sessionId of this.activePairings.keys()) {
                await this.cancelPairing(sessionId);
            }

            // Delete existing session
            await this.deleteSession();

            // Clear temp sessions
            if (await fs.pathExists(this.tempSessionDir)) {
                await fs.remove(this.tempSessionDir);
                await fs.ensureDir(this.tempSessionDir);
            }

            console.log(chalk.green('✅ Pairing system reset complete'));
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error resetting pairing:'), error);
            return false;
        }
    }

    // Get pairing statistics
    async getPairingStats() {
        try {
            const history = await this.getPairingHistory();
            const active = this.getActivePairings();

            return {
                totalPairings: history.length,
                activePairings: active.length,
                lastPairing: history.length > 0 ? history[history.length - 1] : null,
                sessionExists: await this.sessionExists(),
                methods: {
                    qr: history.filter(p => p.method === 'qr').length,
                    code: history.filter(p => p.method === 'code').length
                }
            };
        } catch (error) {
            console.error(chalk.red('❌ Error getting pairing stats:'), error);
            return null;
        }
    }
}

// Initialize pairing manager
const pairingManager = new PairingManager();

// Clean expired pairings every minute
setInterval(() => {
    pairingManager.cleanExpiredPairings();
}, 60 * 1000);

// Pairing utilities
const PairingUtils = {
    // Quick QR pairing
    async quickQRPairing() {
        try {
            console.log(chalk.blue('🚀 Starting Quick QR Pairing...'));
            return await pairingManager.startPairing('qr');
        } catch (error) {
            console.error(chalk.red('❌ Quick QR pairing failed:'), error);
            throw error;
        }
    },

    // Quick code pairing
    async quickCodePairing(phoneNumber) {
        try {
            const validation = pairingManager.validatePhoneNumber(phoneNumber);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            console.log(chalk.blue(`🚀 Starting Quick Code Pairing for ${validation.cleaned}...`));
            return await pairingManager.startPairing('code', validation.cleaned);
        } catch (error) {
            console.error(chalk.red('❌ Quick code pairing failed:'), error);
            throw error;
        }
    },

    // Check if bot is paired
    async isPaired() {
        return await pairingManager.sessionExists();
    },

    // Get current session info
    async getSessionInfo() {
        try {
            if (await this.isPaired()) {
                const credsPath = path.join(pairingManager.sessionDir, 'creds.json');
                const creds = await fs.readJson(credsPath);
                return {
                    paired: true,
                    phoneNumber: creds.me?.id?.split(':')[0] || 'unknown',
                    deviceId: creds.me?.id || 'unknown',
                    platform: creds.platform || 'unknown'
                };
            }
            return { paired: false };
        } catch (error) {
            console.error(chalk.red('❌ Error getting session info:'), error);
            return { paired: false, error: error.message };
        }
    }
};

// Export pairing manager and utilities
module.exports = {
    PairingManager,
    pairingManager,
    PairingUtils
};
