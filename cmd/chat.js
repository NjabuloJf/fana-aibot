const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a message!\n\nUsage: ${config.PREFIX}chat <your message>`);
        }
        
        await react('💬');
        
        const userMessage = args.join(' ');
        
        try {
            // Using chatbot API
            const response = await axios.get(`https://api.simsimi.vn/v2/simtalk`, {
                params: {
                    text: userMessage,
                    lc: 'en'
                }
            });
            
            const chatResponse = response.data.message || response.data.response;
            
            const chatMessage = `💬 *CHAT RESPONSE* 💬

👤 *You:* ${userMessage}

🤖 *Bot:* ${chatResponse}

${config.BOT_FOOTER}`;

            await reply(chatMessage);
            
        } catch (apiError) {
            // Fallback responses
            const fallbackResponses = [
                "That's interesting! Tell me more.",
                "I understand what you're saying.",
                "Thanks for sharing that with me!",
                "That's a great point!",
                "I'm here to chat whenever you need!"
            ];
            
            const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            
            const fallbackMessage = `💬 *CHAT RESPONSE* 💬

👤 *You:* ${userMessage}

🤖 *Bot:* ${randomResponse}

${config.BOT_FOOTER}`;

            await reply(fallbackMessage);
        }
        
    } catch (error) {
        await reply('❌ Error in chat function!');
    }
};

module.exports = {
    nomCom: "chat",
    aliases: ["talk", "speak"],
    reaction: '💬',
    categorie: "ai",
    execute: fana
};
