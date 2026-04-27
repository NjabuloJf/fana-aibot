const fs = require('fs');
const moment = require('moment-timezone');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react } = context;
    
    try {
        const start = Date.now();
        
        await react('🏓');
        
        const ping = Date.now() - start;
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();
        
        const uptimeFormatted = moment.duration(uptime, 'seconds').humanize();
        const memoryUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        const pingMessage = `🏓 *PONG!* 🏓

⚡ *Speed:* ${ping}ms
📅 *Date:* ${moment().format('DD/MM/YYYY')}
⏰ *Time:* ${moment().format('HH:mm:ss')}
🤖 *Bot:* Online ✅
⏱️ *Uptime:* ${uptimeFormatted}
💾 *Memory:* ${memoryUsed}MB

${config.BOT_FOOTER}`;

        await reply(pingMessage);
        
    } catch (error) {
        await reply('❌ Error checking ping!');
    }
};

module.exports = {
    nomCom: "ping",
    reaction: '🏓',
    categorie: "general",
    execute: fana
};
