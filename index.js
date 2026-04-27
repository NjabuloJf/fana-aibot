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

// Display banner
console.log(chalk.cyan(figlet.textSync('FANA-AIBOT', { horizontalLayout: 'full' })));
console.log(chalk.green('🤖 Fana AI Bot Starting...'));
console.log(chalk.yellow(`📅 Date: ${moment().format('DD/MM/YYYY')}`));
console.log(chalk.yellow(`⏰ Time: ${moment().format('HH:mm:ss')}`));
console.log(chalk.blue(`🔧 Prefix: ${config.PREFIX}`));
console.log(chalk.magenta(`📱 Bot Name: ${config.BOT_NAME}`));

// Express routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/qr', (req, res) => {
    res.json({ qr: qrCode, connected: isConnected });
});

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
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: !phoneNumber,
            logger: P({ level: 'silent' }),
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLinkPreview: true,
        });

        // Handle pairing code
        if (phoneNumber && !sock.authState.creds.registered) {
            console.log(chalk.yellow(`📱 Generating pairing code for ${phoneNumber}...`));
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(chalk.green(`🔑 Pairing Code: ${code}`));
        }

        // Handle QR code
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrCode = qr;
                console.log(chalk.yellow('📱 QR Code generated'));
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(chalk.red('❌ Connection closed due to'), lastDisconnect?.error, chalk.yellow('Reconnecting...'), shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 3000);
                }
                isConnected = false;
            } else if (connection === 'open') {
                console.log(chalk.green('✅ Connected to WhatsApp!'));
                isConnected = true;
                qrCode = '';
                
                // Auto-join and send connection message
                await autoJoinChannelAndGroup();
                await sendConnectionMessage();
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
        setTimeout(() => startBot(), 5000);
    }
}

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
    if (sock) {
        await sock.logout();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down...'));
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
