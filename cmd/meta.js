const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a question!\n\nUsage: ${config.PREFIX}meta <your question>`);
        }
        
        await react('🔮');
        
        const question = args.join(' ');
        const loadingMsg = await reply('🔮 Meta AI is processing...');
        
        try {
            // Using Meta AI API or alternative
            const response = await axios.post('https://api.meta.ai/v1/chat', {
                message: question,
                conversation_id: `fana_${senderId}`,
                model: 'meta-llama'
            }, {
                headers: {
                    'Authorization': `Bearer ${config.API_KEYS.META || 'demo'}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const metaResponse = response.data.response || response.data.message;
            
            const metaMessage = `🔮 *META AI RESPONSE* 🔮

❓ *Question:* ${question}

🧠 *Meta AI:* ${metaResponse}

💡 *Powered by Meta's advanced AI technology*

${config.BOT_FOOTER}`;

            await reply(metaMessage);
            
        } catch (apiError) {
            // Fallback to alternative AI
            try {
                const fallbackResponse = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(question)}&owner=Meta&botname=MetaAI`);
                
                const fallbackMessage = `🔮 *META AI RESPONSE* 🔮

❓ *Question:* ${question}

🧠 *Meta AI:* ${fallbackResponse.data.response}

${config.BOT_FOOTER}`;

                await reply(fallbackMessage);
            } catch (fallbackError) {
                await reply('❌ Meta AI service temporarily unavailable. Please try again later.');
            }
        }
        
    } catch (error) {
        await reply('❌ Error processing Meta AI request!');
    }
};

module.exports = {
    nomCom: "meta",
    aliases: ["metaai", "llama"],
    reaction: '🔮',
    categorie: "ai",
    execute: fana
};
