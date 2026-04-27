const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please ask Siri something!\n\nUsage: ${config.PREFIX}siri <your question>`);
        }
        
        await react('🍎');
        
        const question = args.join(' ');
        const loadingMsg = await reply('🍎 Hey Siri...');
        
        try {
            // Using Siri-like AI API
            const response = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(question)}&owner=Apple&botname=Siri`);
            
            const siriResponse = response.data.response;
            
            const siriMessage = `🍎 *SIRI RESPONSE* 🍎

👤 *You asked:* ${question}

🍎 *Siri says:* ${siriResponse}

💡 *Just like the real Siri, but in text!*

${config.BOT_FOOTER}`;

            await reply(siriMessage);
            
        } catch (apiError) {
            // Fallback Siri-like responses
            const siriResponses = [
                "I'm sorry, I didn't quite get that. Could you try asking again?",
                "That's an interesting question! Let me think about it.",
                "I'm here to help! What else would you like to know?",
                "I understand what you're asking. Here's what I think...",
                "That's a great question! I'm always learning new things.",
                "I'm not sure about that, but I'm happy to help with other questions!",
                "Hmm, let me process that for you...",
                "I'm designed to be helpful! Is there anything else I can assist with?"
            ];
            
            const randomSiriResponse = siriResponses[Math.floor(Math.random() * siriResponses.length)];
            
            const fallbackMessage = `🍎 *SIRI RESPONSE* 🍎

👤 *You asked:* ${question}

🍎 *Siri says:* ${randomSiriResponse}

💡 *Just like the real Siri, but in text!*

${config.BOT_FOOTER}`;

            await reply(fallbackMessage);
        }
        
    } catch (error) {
        await reply('❌ Error connecting to Siri! Please try again.');
    }
};

module.exports = {
    nomCom: "siri",
    aliases: ["apple", "heysiri"],
    reaction: '🍎',
    categorie: "ai",
    execute: fana
};
