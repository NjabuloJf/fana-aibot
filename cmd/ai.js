const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a question!\n\nUsage: ${config.PREFIX}ai <your question>`);
        }
        
        await react('🤖');
        
        const question = args.join(' ');
        const loadingMsg = await reply('🤖 AI is thinking...');
        
        try {
            // Using OpenAI API or alternative
            let aiResponse;
            
            if (config.API_KEYS.OPENAI) {
                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: question }],
                    max_tokens: 500
                }, {
                    headers: {
                        'Authorization': `Bearer ${config.API_KEYS.OPENAI}`,
                        'Content-Type': 'application/json'
                    }
                });
                aiResponse = response.data.choices[0].message.content;
            } else {
                // Fallback to free AI API
                const response = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(question)}&owner=Fana&botname=FanaAI`);
                aiResponse = response.data.response;
            }
            
            const aiMessage = `🤖 *FANA AI RESPONSE* 🤖

❓ *Question:* ${question}

💭 *Answer:* ${aiResponse}

${config.BOT_FOOTER}`;

            await reply(aiMessage);
            
        } catch (apiError) {
            await reply('❌ AI service temporarily unavailable. Please try again later.');
        }
        
    } catch (error) {
        await reply('❌ Error processing AI request!');
    }
};

module.exports = {
    nomCom: "ai",
    aliases: ["ask", "bot"],
    reaction: '🤖',
    categorie: "ai",
    execute: fana
};
