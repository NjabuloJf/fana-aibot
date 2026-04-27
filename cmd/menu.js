const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        await react('📋');
        
        const userName = message.pushName || 'User';
        
        // Check if user replied with a number
        if (args[0] && !isNaN(args[0])) {
            const choice = parseInt(args[0]);
            return await handleMenuChoice(context, choice);
        }
        
        // Main menu with image and audio
        const menuMessage = `🤖 *FANA AI BOT MENU* 🤖

👋 Hello @${senderId.split('@')[0]}!
📅 Date: ${moment().format('DD/MM/YYYY')}
⏰ Time: ${moment().format('HH:mm:ss')}
🔧 Prefix: ${config.PREFIX}
🌟 Version: ${config.BOT_VERSION}

📋 *COMMAND CATEGORIES:*

1️⃣ *General Commands* (${getCommandCount('general')})
2️⃣ *AI Commands* (${getCommandCount('ai')})
3️⃣ *Admin Commands* (${getCommandCount('admin')})
4️⃣ *Download Commands* (${getCommandCount('download')})
5️⃣ *Search Commands* (${getCommandCount('search')})
6️⃣ *Owner Commands* (${getCommandCount('owner')})

💡 *How to use:*
• Reply with number (1-6) to see category
• Example: Reply "1" for General Commands

🔗 *Quick Links:*
• Channel: ${config.CHANNEL_LINK}
• Owner: ${config.OWNER_NAME}

${config.BOT_FOOTER}`;

        // Send menu with image and audio
        try {
            // Send menu image
            const menuImagePath = path.join(__dirname, '../public/menu.jpg');
            if (fs.existsSync(menuImagePath)) {
                const imageBuffer = fs.readFileSync(menuImagePath);
                
                await sock.sendMessage(chatId, {
                    image: imageBuffer,
                    caption: menuMessage,
                    quoted: message
                });
            } else {
                // Send text only if image not found
                await reply(menuMessage);
            }
            
            // Send menu audio after 2 seconds
            setTimeout(async () => {
                try {
                    const menuAudioPath = path.join(__dirname, '../public/menu.mp3');
                    if (fs.existsSync(menuAudioPath)) {
                        const audioBuffer = fs.readFileSync(menuAudioPath);
                        
                        await sock.sendMessage(chatId, {
                            audio: audioBuffer,
                            mimetype: 'audio/mp4',
                            ptt: false,
                            quoted: message
                        });
                    }
                } catch (audioError) {
                    // Continue without audio if error
                }
            }, 2000);
            
        } catch (mediaError) {
            // Fallback to text only
            await reply(menuMessage);
        }
        
    } catch (error) {
        await reply('❌ Error showing menu!');
    }
};

// Handle menu choice when user replies with number
async function handleMenuChoice(context, choice) {
    const { sock, message, chatId, reply, react, senderId } = context;
    
    try {
        await react('📖');
        
        let categoryMessage = '';
        let categoryCommands = [];
        
        switch (choice) {
            case 1:
                categoryCommands = getCommandsByCategory('general');
                categoryMessage = `🔧 *GENERAL COMMANDS* 🔧

📊 Total: ${categoryCommands.length} commands

${categoryCommands.map((cmd, index) => 
    `${index + 1}. ${config.PREFIX}${cmd.name} - ${cmd.description}`
).join('\n')}

💡 *Usage:* Type ${config.PREFIX}[command] to use

${config.BOT_FOOTER}`;
                break;
                
            case 2:
                categoryCommands = getCommandsByCategory('ai');
                categoryMessage = `🤖 *AI COMMANDS* 🤖

📊 Total: ${categoryCommands.length} commands

${categoryCommands.map((cmd, index) => 
    `${index + 1}. ${config.PREFIX}${cmd.name} - ${cmd.description}`
).join('\n')}

🧠 *Powered by advanced AI technology!*

${config.BOT_FOOTER}`;
                break;
                
            case 3:
                categoryCommands = getCommandsByCategory('admin');
                categoryMessage = `👑 *ADMIN COMMANDS* 👑

📊 Total: ${categoryCommands.length} commands

${categoryCommands.map((cmd, index) => 
    `${index + 1}. ${config.PREFIX}${cmd.name} - ${cmd.description}`
).join('\n')}

⚠️ *Note:* Admin permissions required!

${config.BOT_FOOTER}`;
                break;
                
            case 4:
                categoryCommands = getCommandsByCategory('download');
                categoryMessage = `📥 *DOWNLOAD COMMANDS* 📥

📊 Total: ${categoryCommands.length} commands

${categoryCommands.map((cmd, index) => 
    `${index + 1}. ${config.PREFIX}${cmd.name} - ${cmd.description}`
).join('\n')}

🎵 *Download music, videos, and more!*

${config.BOT_FOOTER}`;
                break;
                
            case 5:
                categoryCommands = getCommandsByCategory('search');
                categoryMessage = `🔍 *SEARCH COMMANDS* 🔍

📊 Total: ${categoryCommands.length} commands

${categoryCommands.map((cmd, index) => 
    `${index + 1}. ${config.PREFIX}${cmd.name} - ${cmd.description}`
).join('\n')}

🌐 *Search the web and more!*

${config.BOT_FOOTER}`;
                break;
                
            case 6:
                categoryCommands = getCommandsByCategory('owner');
                categoryMessage = `🛡️ *OWNER COMMANDS* 🛡️

📊 Total: ${categoryCommands.length} commands

${categoryCommands.map((cmd, index) => 
    `${index + 1}. ${config.PREFIX}${cmd.name} - ${cmd.description}`
).join('\n')}

👑 *Note:* Owner permissions required!

${config.BOT_FOOTER}`;
                break;
                
            default:
                return await reply(`❌ Invalid choice! Please reply with numbers 1-6.

📋 *Available categories:*
1️⃣ General Commands
2️⃣ AI Commands  
3️⃣ Admin Commands
4️⃣ Download Commands
5️⃣ Search Commands
6️⃣ Owner Commands`);
        }
        
        // Send category image if available
        const categoryImages = {
            1: 'general.jpg',
            2: 'ai.jpg', 
            3: 'admin.jpg',
            4: 'download.jpg',
            5: 'search.jpg',
            6: 'owner.jpg'
        };
        
        const categoryImagePath = path.join(__dirname, '../public', categoryImages[choice]);
        
        if (fs.existsSync(categoryImagePath)) {
            const imageBuffer = fs.readFileSync(categoryImagePath);
            
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: categoryMessage,
                quoted: message
            });
        } else {
            await reply(categoryMessage);
        }
        
    } catch (error) {
        await reply('❌ Error showing category commands!');
    }
}

// Get commands by category
function getCommandsByCategory(category) {
    const commands = [
        // General Commands
        { name: 'ping', description: 'Check bot speed and status', category: 'general' },
        { name: 'menu', description: 'Show this menu', category: 'general' },
        { name: 'alive', description: 'Check if bot is online', category: 'general' },
        { name: 'uptime', description: 'Show bot uptime', category: 'general' },
        { name: 'setting', description: 'Bot settings', category: 'general' },
        
        // AI Commands
        { name: 'ai', description: 'Ask AI anything', category: 'ai' },
        { name: 'chat', description: 'Chat with AI', category: 'ai' },
        { name: 'gpt', description: 'ChatGPT responses', category: 'ai' },
        { name: 'meta', description: 'Meta AI responses', category: 'ai' },
        { name: 'siri', description: 'Siri-like responses', category: 'ai' },
        { name: 'shazam', description: 'Identify music', category: 'ai' },
        
        // Admin Commands
        { name: 'promote', description: 'Promote user to admin', category: 'admin' },
        { name: 'demote', description: 'Demote user from admin', category: 'admin' },
        { name: 'remove', description: 'Remove user from group', category: 'admin' },
        { name: 'antilink', description: 'Toggle antilink protection', category: 'admin' },
        { name: 'welcome', description: 'Welcome message settings', category: 'admin' },
        { name: 'group-mute', description: 'Mute/unmute users', category: 'admin' },
        
        // Download Commands
        { name: 'play', description: 'Download music from YouTube', category: 'download' },
        { name: 'video', description: 'Download videos from YouTube', category: 'download' },
        { name: 'fb', description: 'Download Facebook videos', category: 'download' },
        { name: 'tiktok', description: 'Download TikTok videos', category: 'download' },
        { name: 'instagram', description: 'Download Instagram videos', category: 'download' },
        
        // Search Commands
        { name: 'yts', description: 'Search YouTube videos', category: 'search' },
        { name: 'img', description: 'Search and download images', category: 'search' },
        { name: 'google', description: 'Search Google', category: 'search' },
        { name: 'apk', description: 'Search Android apps', category: 'search' },
        
        // Owner Commands
        { name: 'update', description: 'Update bot code', category: 'owner' },
        { name: 'anticall', description: 'Toggle anti-call feature', category: 'owner' }
    ];
    
    return commands.filter(cmd => cmd.category === category);
}

// Get command count by category
function getCommandCount(category) {
    return getCommandsByCategory(category).length;
}

module.exports = {
    nomCom: "menu",
    aliases: ["help", "commands"],
    reaction: '📋',
    categorie: "general",
    execute: fana
};
