const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a search query!\n\nUsage: ${config.PREFIX}google <search term>`);
        }
        
        await react('🔍');
        
        const query = args.join(' ');
        const loadingMsg = await reply('🔍 Searching Google...');
        
        try {
            // Using Google Search API or alternative
            let searchResults;
            
            if (config.API_KEYS.GOOGLE) {
                const response = await axios.get(`https://www.googleapis.com/customsearch/v1?key=${config.API_KEYS.GOOGLE}&cx=your_search_engine_id&q=${encodeURIComponent(query)}&num=5`);
                searchResults = response.data.items;
            } else {
                // Fallback to alternative search API
                const response = await axios.get(`https://api.popcat.xyz/google?q=${encodeURIComponent(query)}`);
                searchResults = response.data.results || response.data;
            }
            
            if (!searchResults || searchResults.length === 0) {
                return await reply('❌ No search results found!');
            }
            
            let googleMessage = `🔍 *GOOGLE SEARCH RESULTS* 🔍\n\n`;
            googleMessage += `🔎 *Query:* ${query}\n`;
            googleMessage += `📊 *Results:* ${searchResults.length}\n\n`;
            
            searchResults.slice(0, 5).forEach((result, index) => {
                const title = result.title || result.name || 'No title';
                const snippet = result.snippet || result.description || 'No description';
                const link = result.link || result.url || '#';
                
                googleMessage += `${index + 1}. *${title}*\n`;
                googleMessage += `📝 ${snippet.substring(0, 100)}${snippet.length > 100 ? '...' : ''}\n`;
                googleMessage += `🔗 ${link}\n\n`;
            });
            
            googleMessage += `💡 *Tip:* Click any link to visit the website!\n\n`;
            googleMessage += config.BOT_FOOTER;
            
            await reply(googleMessage);
            
        } catch (apiError) {
            console.error('Google search error:', apiError);
            
            // Fallback message
            const fallbackMessage = `🔍 *GOOGLE SEARCH* 🔍

🔎 *Query:* ${query}

❌ *Search service temporarily unavailable.*

💡 *Alternative:* Try searching directly on Google:
🔗 https://www.google.com/search?q=${encodeURIComponent(query)}

${config.BOT_FOOTER}`;

            await reply(fallbackMessage);
        }
        
    } catch (error) {
        await reply('❌ Error performing Google search!');
    }
};

module.exports = {
    nomCom: "google",
    aliases: ["search", "gsearch"],
    reaction: '🔍',
    categorie: "search",
    execute: fana
};
