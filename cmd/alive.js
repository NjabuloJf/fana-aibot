const fs = require('fs');
const moment = require('moment-timezone');
const config = require('../config');
const { statusManager } = require('../status-online');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId } = context;
    
    try {
        await react('🤖');
        
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();
        const status = statusManager.getBotStatus();
        
        const uptimeFormatted = moment.duration(uptime, 'seconds').humanize();
        const memoryUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
        const memoryTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
        
        const aliveMessage = `🤖 *FANA AI BOT IS ALIVE!* 🤖

✅ *Status:* Online & Active
📅 *Date:* ${moment().format('DD/MM/YYYY')}
⏰ *Time:* ${moment().format('HH:mm:ss')}
⏱️ *Uptime:* ${uptimeFormatted}
💾 *Memory:* ${memoryUsed}MB / ${memoryTotal}MB
🔧 *Prefix:* ${config.PREFIX}
🌟 *Version:* ${config.BOT_VERSION}

📊 *System Info:*
• Platform: ${process.platform}
• Node.js: ${process.version}
• CPU: ${process.arch}
• PID: ${process.pid}

🚀 *Features:*
• Auto Welcome ✅
• Anti Link ✅
• Admin Tools ✅
• Status Auto View ✅
• 24/7 Online ✅

💡 *Quick Commands:*
• ${config.PREFIX}ping - Test speed
• ${config.PREFIX}menu - All commands
• ${config.PREFIX}help - Get help

🔗 *Links:*
• Channel: ${config.CHANNEL_LINK}
• Owner: ${config.OWNER_NAME}

${config.BOT_FOOTER}`;

        await reply(aliveMessage);
        
    } catch (error) {
        await reply('❌ Error checking alive status!');
    }
};

module.exports = {
    nomCom: "alive",
    aliases: ["status", "online"],
    reaction: '🤖',
    categorie: "general",
    execute: fana
};
