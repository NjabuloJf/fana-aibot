const fs = require('fs');
const moment = require('moment-timezone');
const config = require('../config');
const { statusManager } = require('../status-online');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId } = context;
    
    try {
        await react('⏱️');
        
        const uptime = process.uptime();
        const startTime = Date.now() - (uptime * 1000);
        const memUsage = process.memoryUsage();
        
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        const uptimeFormatted = moment.duration(uptime, 'seconds').humanize();
        const memoryUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
        const cpuUsage = process.cpuUsage();
        
        const uptimeMessage = `⏱️ *BOT UPTIME* ⏱️

🚀 *Started:* ${moment(startTime).format('DD/MM/YYYY HH:mm:ss')}
⏰ *Current:* ${moment().format('DD/MM/YYYY HH:mm:ss')}

📊 *Uptime Details:*
• Total: ${uptimeFormatted}
• Days: ${days}
• Hours: ${hours}
• Minutes: ${minutes}
• Seconds: ${seconds}

💾 *System Performance:*
• Memory Used: ${memoryUsed}MB
• Memory Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB
• External: ${Math.round(memUsage.external / 1024 / 1024)}MB
• RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB

⚡ *CPU Usage:*
• User: ${Math.round(cpuUsage.user / 1000)}ms
• System: ${Math.round(cpuUsage.system / 1000)}ms

🤖 *Bot Info:*
• Name: ${config.BOT_NAME}
• Version: ${config.BOT_VERSION}
• Platform: ${process.platform}
• Node.js: ${process.version}

✅ *Status:* Running smoothly!

${config.BOT_FOOTER}`;

        await reply(uptimeMessage);
        
    } catch (error) {
        await reply('❌ Error getting uptime information!');
    }
};

module.exports = {
    nomCom: "uptime",
    aliases: ["runtime", "up"],
    reaction: '⏱️',
    categorie: "general",
    execute: fana
};
