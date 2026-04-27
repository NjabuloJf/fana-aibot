const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a search query!\n\nUsage: ${config.PREFIX}img <search term>`);
        }
        
        await react('🖼️');
        
        const query = args.join(' ');
        const loadingMsg = await reply('🔍 Searching for images...');
        
        // Using Unsplash API or alternative image search
        let imageResults;
        
        try {
            // Try Unsplash API first
            const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&client_id=${config.API_KEYS.UNSPLASH || 'demo'}`;
            
            if (config.API_KEYS.UNSPLASH) {
                const response = await axios.get(unsplashUrl);
                imageResults = response.data.results;
            } else {
                // Fallback to alternative API
                const altResponse = await axios.get(`https://api.popcat.xyz/imagesearch?q=${encodeURIComponent(query)}`);
                imageResults = altResponse.data.slice(0, 5);
            }
        } catch (apiError) {
            // Fallback to another free API
            try {
                const fallbackResponse = await axios.get(`https://lexica.art/api/v1/search?q=${encodeURIComponent(query)}`);
                imageResults = fallbackResponse.data.images.slice(0, 5);
            } catch (fallbackError) {
                return await reply('❌ Image search API error! Please try again later.');
            }
        }
        
        if (!imageResults || imageResults.length === 0) {
            return await reply('❌ No images found for your search!');
        }
        
        // Get random image from results
        const randomImage = imageResults[Math.floor(Math.random() * imageResults.length)];
        
        let imageUrl, imageTitle, imageAuthor;
        
        if (config.API_KEYS.UNSPLASH && randomImage.urls) {
            // Unsplash format
            imageUrl = randomImage.urls.regular;
            imageTitle = randomImage.alt_description || query;
            imageAuthor = randomImage.user?.name || 'Unknown';
        } else if (randomImage.src) {
            // Lexica format
            imageUrl = randomImage.src;
            imageTitle = randomImage.prompt || query;
            imageAuthor = 'AI Generated';
        } else {
            // Alternative format
            imageUrl = randomImage.url || randomImage.image;
            imageTitle = randomImage.title || query;
            imageAuthor = randomImage.source || 'Unknown';
        }
        
        try {
            // Download the image
            const imageResponse = await axios.get(imageUrl, { 
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const imageBuffer = Buffer.from(imageResponse.data);
            
            // Check file size (max 50MB)
            if (imageBuffer.length > 50 * 1024 * 1024) {
                return await reply('❌ Image too large! Please try another search.');
            }
            
            const caption = `🖼️ *IMAGE SEARCH RESULT* 🖼️

🔍 *Query:* ${query}
📝 *Title:* ${imageTitle}
👤 *Source:* ${imageAuthor}
📊 *Size:* ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB

💡 *Tip:* Use ${config.PREFIX}img <term> for more images!

${config.BOT_FOOTER}`;

            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: caption,
                quoted: message
            });
            
            // Send additional images if requested
            if (imageResults.length > 1) {
                setTimeout(async () => {
                    try {
                        const secondImage = imageResults[1];
                        let secondUrl;
                        
                        if (config.API_KEYS.UNSPLASH && secondImage.urls) {
                            secondUrl = secondImage.urls.regular;
                        } else if (secondImage.src) {
                            secondUrl = secondImage.src;
                        } else {
                            secondUrl = secondImage.url || secondImage.image;
                        }
                        
                        const secondResponse = await axios.get(secondUrl, { 
                            responseType: 'arraybuffer',
                            timeout: 10000 
                        });
                        const secondBuffer = Buffer.from(secondResponse.data);
                        
                        if (secondBuffer.length <= 50 * 1024 * 1024) {
                            await sock.sendMessage(chatId, {
                                image: secondBuffer,
                                caption: `🖼️ *Alternative Result* 🖼️\n\n${config.BOT_FOOTER}`
                            });
                        }
                    } catch (error) {
                        // Ignore second image errors
                    }
                }, 2000);
            }
            
        } catch (downloadError) {
            console.error('Image download error:', downloadError);
            
            // Send image URL as fallback
            const fallbackMessage = `🖼️ *IMAGE SEARCH RESULT* 🖼️

🔍 *Query:* ${query}
📝 *Title:* ${imageTitle}
👤 *Source:* ${imageAuthor}

🔗 *Direct Link:* ${imageUrl}

❌ *Note:* Could not download image directly. Click the link above to view.

${config.BOT_FOOTER}`;

            await reply(fallbackMessage);
        }
        
    } catch (error) {
        console.error('IMG Error:', error);
        await reply('❌ Error searching for images! Please try again.');
    }
};

module.exports = {
    nomCom: "img",
    aliases: ["image", "pic", "photo"],
    reaction: '🖼️',
    categorie: "search",
    execute: fana
};
