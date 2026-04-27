const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a question!\n\nUsage: ${config.PREFIX}gpt <your question>`);
        }
        
        await react('🧠');
        
        const question = args.join(' ');
        const loadingMsg = await reply('🧠 ChatGPT is thinking...');
        
        try {
            // Using OpenAI GPT API
            if (config.API_KEYS.OPENAI) {
                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-4',
                    messages: [
                        { role: 'system', content: 'You are a helpful AI assistant created by Fana AI.' },
                        { role: 'user', content: question }
                    ],
                    max_tokens: 800,
                    temperature: 0.7
                }, {
                    headers: {
                        'Authorization': `Bearer ${config.API_KEYS.OPENAI}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const gptResponse = response.data.choices[0].message.content;
                
                const gptMessage = `🧠 *CHATGPT RESPONSE* 🧠

❓ *Question:* ${question}

💭 *ChatGPT:* ${gptResponse}

🤖 *Model:* GPT-4
⚡ *Powered by OpenAI*

${config.BOT_FOOTER}`;

                await reply(gptMessage);
            } else {
                // Fallback to free GPT API
                const response = await axios.get(`https://api.popcat.xyz/gpt?text=${encodeURIComponent(question)}`);
                
                const fallbackMessage = `🧠 *CHATGPT RESPONSE* 🧠

❓ *Question:* ${question}

💭 *ChatGPT:* ${response.data.response}

${config.BOT_FOOTER}`;

                await reply(fallbackMessage);
            }
            
        } catch (apiError) {
            await reply('❌ ChatGPT service temporarily unavailable. Please try again later.');
        }
        
    } catch (error) {
        await reply('❌ Error processing ChatGPT request!');
    }
};

module.exports = {
    nomCom: "gpt",
    aliases: ["chatgpt", "openai"],
    reaction: '🧠',
    categorie: "ai",
    execute: fana
};
