const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    jidNormalizedUser,
    getContentType,
    Browsers
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const chalk = require('chalk');
const figlet = require('figlet');
const moment = require('moment-timezone');
const config = require('./config');
const { makeid } = require('./id');
const express = require('express');
const path = require('path');
const P = require('pino');
const QRCode = require('qrcode');

// Import handlers
const messageHandler = require('./data/handler');
const welcomeHandler = require('./data/welcome-handler');
const antilinkHandler = require('./data/antilink-handler');
const groupHandler = require('./data/group-handler');

const app = express();
const PORT = config.PORT;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Global variables
let sock;
let qrCode = '';
let isConnected = false;
let connectionTime = '';
const pairingData = new Map();
const connectionRetries = new Map();
const maxRetries = 5;

// Display banner
console.log(chalk.cyan(figlet.textSync('FANA-AIBOT', { horizontalLayout: 'full' })));
console.log(chalk.green('🤖 Fana AI Bot Starting...'));
console.log(chalk.yellow(`📅 Date: ${moment().format('DD/MM/YYYY')}`));
console.log(chalk.yellow(`⏰ Time: ${moment().format('HH:mm:ss')}`));
console.log(chalk.blue(`🔧 Prefix: ${config.PREFIX}`));
console.log(chalk.magenta(`📱 Bot Name: ${config.BOT_NAME}`));

// Express routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/qr', (req, res) => {
    res.json({ qr: qrCode, connected: isConnected });
});

// API endpoint for QR code generation
app.post('/api/generate-qr', async (req, res) => {
    try {
        console.log(chalk.blue('📱 QR code generation requested'));
        const sessionId = makeid(16);
        const result = await generateQRForPairing(sessionId);
        
        res.json({
            success: true,
            qr: result.qr,
            sessionId: result.sessionId,
            expires: Date.now() + (5 * 60 * 1000) // 5 minutes
        });
    } catch (error) {
        console.error(chalk.red('❌ QR generation error:'), error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint for pairing code generation
app.post('/api/generate-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.json({
                success: false,
                error: 'Phone number is required'
            });
        }

        console.log(chalk.blue('🔑 Pairing code generation requested for:'), phoneNumber);
        const sessionId = makeid(16);
        const result = await generatePairingCodeForPhone(phoneNumber, sessionId);
        
        res.json({
            success: true,
            code: result.code,
            formattedCode: result.formattedCode,
            sessionId: result.sessionId,
            expires: Date.now() + (5 * 60 * 1000) // 5 minutes
        });
    } catch (error) {
        console.error(chalk.red('❌ Pairing code generation error:'), error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint for connection status
app.get('/api/connection-status', async (req, res) => {
    try {
        res.json({
            connected: isConnected,
            uptime: process.uptime(),
            timestamp: Date.now()
        });
    } catch (error) {
        console.error(chalk.red('❌ Connection status error:'), error);
        res.json({
            connected: false,
            error: error.message
        });
    }
});

// API endpoint for general status
app.get('/api/status', async (req, res) => {
    try {
        res.json({
            connected: isConnected,
            uptime: process.uptime(),
            status: isConnected ? 'connected' : 'disconnected',
            timestamp: Date.now(),
            activePairings: pairingData.size
        });
    } catch (error) {
        console.error(chalk.red('❌ Status error:'), error);
        res.json({
            connected: false,
            status: 'error',
            error: error.message
        });
    }
});

// Generate QR code for pairing
async function generateQRForPairing(sessionId) {
    return new Promise(async (resolve, reject) => {
        try {
            const tempSessionPath = `./temp_session_${sessionId}`;
            const { state, saveCreds } = await useMultiFileAuthState(tempSessionPath);
            
            const tempSock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: P({ level: 'silent' }),
                browser: Browsers.macOS('Desktop'),
                generateHighQualityLinkPreview: true,
            });

            const timeout = setTimeout(() => {
                tempSock.end();
                fs.remove(tempSessionPath).catch(() => {});
                reject(new Error('QR generation timeout'));
            }, 5 * 60 * 1000); // 5 minutes

            tempSock.ev.on('connection.update', async (update) => {
                const { connection, qr } = update;
                
                if (qr) {
                    try {
                        clearTimeout(timeout);
                        
                        // Store pairing data
                        pairingData.set(sessionId, {
                            type: 'qr',
                            qr: qr,
                            timestamp: Date.now(),
                            tempSock: tempSock,
                            tempSessionPath: tempSessionPath
                        });
                        
                        console.log(chalk.green('✅ QR Code generated successfully'));
                        resolve({ 
                            qr: qr, 
                            sessionId: sessionId 
                        });
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(error);
                    }
                }
                
                if (connection === 'open') {
                    // Move temp session to main session
                    await fs.remove('./session').catch(() => {});
                    await fs.move(tempSessionPath, './session');
                    
                    // Clean up
                    pairingData.delete(sessionId);
                    tempSock.end();
                    
                    // Restart main bot
                    setTimeout(() => startBot(), 1000);
                }
            });

            tempSock.ev.on('creds.update', saveCreds);
        } catch (error) {
            reject(error);
        }
    });
}

// Generate pairing code for phone number
async function generatePairingCodeForPhone(phoneNumber, sessionId) {
    return new Promise(async (resolve, reject) => {
        try {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            const tempSessionPath = `./temp_session_${sessionId}`;
            const { state, saveCreds } = await useMultiFileAuthState(tempSessionPath);
            
            const tempSock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: P({ level: 'silent' }),
                browser: Browsers.macOS('Desktop'),
                generateHighQualityLinkPreview: true,
            });

                       const timeout = setTimeout(() => {
                tempSock.end();
                fs.remove(tempSessionPath).catch(() => {});
                reject(new Error('Pairing code generation timeout'));
            }, 5 * 60 * 1000); // 5 minutes

            try {
                if (!tempSock.authState.creds.registered) {
                    const code = await tempSock.requestPairingCode(cleanNumber);
                    const formattedCode = code.match(/.{1,4}/g).join('-');
                    
                    clearTimeout(timeout);
                    
                    // Store pairing data
                    pairingData.set(sessionId, {
                        type: 'code',
                        code: code,
                        formattedCode: formattedCode,
                        phoneNumber: cleanNumber,
                        timestamp: Date.now(),
                        tempSock: tempSock,
                        tempSessionPath: tempSessionPath
                    });
                    
                    console.log(chalk.green(`🔑 Pairing Code: ${formattedCode}`));
                    resolve({ 
                        code: code, 
                        formattedCode: formattedCode, 
                        sessionId: sessionId 
                    });
                } else {
                    clearTimeout(timeout);
                    reject(new Error('Device already registered'));
                }
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }

            tempSock.ev.on('connection.update', async (update) => {
                const { connection } = update;
                
                if (connection === 'open') {
                    // Move temp session to main session
                    await fs.remove('./session').catch(() => {});
                    await fs.move(tempSessionPath, './session');
                    
                    // Clean up
                    pairingData.delete(sessionId);
                    tempSock.end();
                    
                    // Restart main bot
                    setTimeout(() => startBot(), 1000);
                }
            });

            tempSock.ev.on('creds.update', saveCreds);
        } catch (error) {
            reject(error);
        }
    });
}

app.post('/pair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number required' });
        }
        
        // Start pairing process
        await startBot(phoneNumber);
        res.json({ success: true, message: 'Pairing initiated' });
    } catch (error) {
        console.error('Pairing error:', error);
        res.status(500).json({ error: 'Pairing failed' });
    }
});

// Auto-join function
async function autoJoinChannelAndGroup() {
    try {
        if (config.AUTO_JOIN_CHANNEL === 'true' && config.CHANNEL_LINK) {
            console.log(chalk.blue('🔗 Auto-joining channel...'));
            // Add channel join logic here
        }
        
        if (config.AUTO_JOIN_GROUP === 'true' && config.GROUP_INVITE_LINK) {
            console.log(chalk.blue('👥 Auto-joining group...'));
            // Add group join logic here
        }
    } catch (error) {
        console.error(chalk.red('❌ Auto-join error:'), error);
    }
}

// Send connection message
async function sendConnectionMessage() {
    try {
        const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
        connectionTime = moment().format('DD/MM/YYYY HH:mm:ss');
        
        const message = `🤖 *FANA-AIBOT CONNECTED* 🤖

✅ *Status:* Online
📅 *Date:* ${moment().format('DD/MM/YYYY')}
⏰ *Time:* ${moment().format('HH:mm:ss')}
🔧 *Prefix:* ${config.PREFIX}
📱 *Bot Name:* ${config.BOT_NAME}
🌟 *Version:* ${config.BOT_VERSION}

💡 *Quick Commands:*
• ${config.PREFIX}ping - Check bot status
• ${config.PREFIX}menu - View all commands

${config.BOT_FOOTER}`;

        await sock.sendMessage(ownerJid, { text: message });
        console.log(chalk.green('✅ Connection message sent to owner'));
    } catch (error) {
        console.error(chalk.red('❌ Failed to send connection message:'), error);
    }
}

// Main bot function
async function startBot(phoneNumber = null) {
    try {
        console.log(chalk.blue('🚀 Starting bot connection...'));
        
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: !phoneNumber,
            logger: P({ level: 'silent' }),
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLinkPreview: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: true,
        });

        // Handle pairing code
        if (phoneNumber && !sock.authState.creds.registered) {
            console.log(chalk.yellow(`📱 Generating pairing code for ${phoneNumber}...`));
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                const formattedCode = code.match(/.{1,4}/g).join('-');
                console.log(chalk.green(`🔑 Pairing Code: ${formattedCode}`));
            } catch (error) {
                console.error(chalk.red('❌ Pairing code error:'), error);
            }
        }

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrCode = qr;
                console.log(chalk.yellow('📱 QR Code generated'));
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(chalk.red('❌ Connection closed:'), {
                    statusCode,
                    error: lastDisconnect?.error?.message,
                    shouldReconnect
                });
                
                if (shouldReconnect) {
                    const retryKey = 'main';
                    const retryCount = (connectionRetries.get(retryKey) || 0) + 1;
                    
                    if (retryCount <= maxRetries) {
                        connectionRetries.set(retryKey, retryCount);
                        const delay = Math.min(retryCount * 2000, 10000);
                        
                        console.log(chalk.yellow(`🔄 Reconnecting in ${delay/1000}s... (${retryCount}/${maxRetries})`));
                        setTimeout(() => startBot(phoneNumber), delay);
                    } else {
                        console.log(chalk.red('❌ Max reconnection attempts reached. Please restart manually.'));
                        connectionRetries.delete(retryKey);
                    }
                }
                isConnected = false;
            } else if (connection === 'open') {
                console.log(chalk.green('✅ Connected to WhatsApp!'));
                isConnected = true;
                qrCode = '';
                connectionRetries.clear();
                
                await autoJoinChannelAndGroup();
                await sendConnectionMessage();
            } else if (connection === 'connecting') {
                console.log(chalk.yellow('🔄 Connecting to WhatsApp...'));
            }
        });

        // Save credentials
        sock.ev.on('creds.update', saveCreds);

        // Handle messages
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message.message || message.key.fromMe) return;

                // Handle different message types
                await messageHandler(sock, message);
                
                // Auto-typing
                if (config.AUTO_TYPING === 'true') {
                    await sock.sendPresenceUpdate('composing', message.key.remoteJid);
                    setTimeout(async () => {
                        await sock.sendPresenceUpdate('paused', message.key.remoteJid);
                    }, 2000);
                }
            } catch (error) {
                console.error(chalk.red('❌ Message handling error:'), error);
            }
        });

        // Handle group updates
        sock.ev.on('group-participants.update', async (update) => {
            try {
                await groupHandler(sock, update);
                if (config.AUTO_WELCOME === 'true') {
                    await welcomeHandler(sock, update);
                }
            } catch (error) {
                console.error(chalk.red('❌ Group update error:'), error);
            }
        });

        // Handle status updates
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (message.key.remoteJid === 'status@broadcast' && config.AUTO_VIEW_STATUS === 'true') {
                    await sock.readMessages([message.key]);
                    
                    if (config.AUTO_LIKE_STATUS === 'true') {
                        const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                        await sock.sendMessage(message.key.remoteJid, {
                            react: {
                                text: randomEmoji,
                                key: message.key
                            }
                        });
                        console.log(chalk.blue(`👀 Auto-viewed and liked status with ${randomEmoji}`));
                    }
                }
            } catch (error) {
                console.error(chalk.red('❌ Status update error:'), error);
            }
        });

        // Handle calls (anti-call feature)
        sock.ev.on('call', async (callUpdate) => {
            try {
                for (const call of callUpdate) {
                    if (call.status === 'offer') {
                        console.log(chalk.yellow(`📞 Incoming call from ${call.from}`));
                        
                        // Reject call and send message
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, {
                            text: `🚫 *CALL REJECTED* 🚫

Sorry, this bot doesn't accept calls.
Please send a text message instead.

${config.BOT_FOOTER}`
                        });
                        
                        console.log(chalk.red('📞 Call rejected and message sent'));
                    }
                }
            } catch (error) {
                console.error(chalk.red('❌ Call handling error:'), error);
            }
        });

        // Keep bot online
        setInterval(async () => {
            try {
                if (isConnected) {
                    await sock.sendPresenceUpdate('available');
                    console.log(chalk.green('💚 Bot status: Online'));
                }
            } catch (error) {
                console.error(chalk.red('❌ Keep-alive error:'), error);
            }
        }, 30000); // Every 30 seconds

        return sock;
    } catch (error) {
        console.error(chalk.red('❌ Bot startup error:'), error);
        
        const retryKey = 'startup';
        const retryCount = (connectionRetries.get(retryKey) || 0) + 1;
        
        if (retryCount <= maxRetries) {
            connectionRetries.set(retryKey, retryCount);
            const delay = Math.min(retryCount * 3000, 15000);
            
            console.log(chalk.yellow(`🔄 Retrying startup in ${delay/1000}s... (${retryCount}/${maxRetries})`));
            setTimeout(() => startBot(phoneNumber), delay);
        } else {
            console.log(chalk.red('❌ Max startup attempts reached. Exiting.'));
            process.exit(1);
        }
    }
}

// Clean up expired pairing sessions
setInterval(() => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [sessionId, data] of pairingData.entries()) {
        if (now - data.timestamp > maxAge) {
            console.log(chalk.yellow(`🧹 Cleaning expired pairing session: ${sessionId}`));
            
            // Clean up temp socket and session
            if (data.tempSock) {
                data.tempSock.end();
            }
            if (data.tempSessionPath) {
                fs.remove(data.tempSessionPath).catch(() => {});
            }
            
            pairingData.delete(sessionId);
        }
    }
}, 60000); // Check every minute

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
    console.log(chalk.yellow('🔄 Restarting bot...'));
    setTimeout(() => startBot(), 3000);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red('❌ Unhandled Rejection:'), error);
    console.log(chalk.yellow('🔄 Restarting bot...'));
    setTimeout(() => startBot(), 3000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🛑 Shutting down bot gracefully...'));
    
    // Clean up all pairing sessions
    for (const [sessionId, data] of pairingData.entries()) {
        if (data.tempSock) {
            data.tempSock.end();
        }
        if (data.tempSessionPath) {
            await fs.remove(data.tempSessionPath).catch(() => {});
        }
    }
    
    if (sock) {
        await sock.logout();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down...'));
    
    // Clean up all pairing sessions
    for (const [sessionId, data] of pairingData.entries()) {
        if (data.tempSock) {
            data.tempSock.end();
        }
        if (data.tempSessionPath) {
            await fs.remove(data.tempSessionPath).catch(() => {});
        }
    }
    
    if (sock) {
        await sock.logout();
    }
    process.exit(0);
});

// Start Express server
app.listen(PORT, () => {
    console.log(chalk.green(`🌐 Web server running on port ${PORT}`));
    console.log(chalk.blue(`🔗 Access pairing page: http://localhost:${PORT}`));
});

// Start bot
startBot().catch(error => {
    console.error(chalk.red('❌ Failed to start bot:'), error);
    process.exit(1);
});

// Export for other modules
module.exports = { sock, isConnected };
