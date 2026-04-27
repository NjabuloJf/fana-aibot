const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a search query!\n\nUsage: ${config.PREFIX}yts <search term>`);
        }
        
        await react('🔍');
        
        const query = args.join(' ');
        const loadingMsg = await reply('🔍 Searching YouTube...');
        
        // YouTube search API (using a free API or scraping method)
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${config.API_KEYS.YOUTUBE}`;
        
        let searchResults;
        
        try {
            if (config.API_KEYS.YOUTUBE) {
                const response = await axios.get(searchUrl);
                searchResults = response.data.items;
            } else {
                // Fallback to alternative method
                const altResponse = await axios.get(`https://api.popcat.xyz/youtube?q=${encodeURIComponent(query)}`);
                searchResults = altResponse.data.slice(0, 5);
            }
        } catch (apiError) {
            return await reply('❌ YouTube API error! Please try again later.');
        }
        
        if (!searchResults || searchResults.length === 0) {
            return await reply('❌ No results found for your search!');
        }
        
        let resultMessage = `🎥 *YOUTUBE SEARCH RESULTS* 🎥\n\n`;
        resultMessage += `🔍 *Query:* ${query}\n`;
        resultMessage += `📊 *Results:* ${searchResults.length}\n\n`;
        
        searchResults.forEach((video, index) => {
            let title, channel, duration, views, url, thumbnail;
            
            if (config.API_KEYS.YOUTUBE) {
                // Official YouTube API format
                title = video.snippet.title;
                channel = video.snippet.channelTitle;
                url = `https://youtube.com/watch?v=${video.id.videoId}`;
                thumbnail = video.snippet.thumbnails.medium.url;
            } else {
                // Alternative API format
                title = video.title;
                channel = video.channel;
                duration = video.duration;
                views = video.views;
                url = video.url;
                thumbnail = video.thumbnail;
            }
            
            resultMessage += `${index + 1}. *${title}*\n`;
            resultMessage += `📺 Channel: ${channel}\n`;
            if (duration) resultMessage += `⏱️ Duration: ${duration}\n`;
            if (views) resultMessage += `👀 Views: ${views}\n`;
            resultMessage += `🔗 ${url}\n\n`;
        });
        
        resultMessage += `💡 *Tip:* Click any link to watch the video!\n\n`;
        resultMessage += config.BOT_FOOTER;
        
        // Send the first video thumbnail if available
        const firstVideo = searchResults[0];
        let thumbnailUrl;
        
        if (config.API_KEYS.YOUTUBE) {
            thumbnailUrl = firstVideo.snippet.thumbnails.high?.url || firstVideo.snippet.thumbnails.medium?.url;
        } else {
            thumbnailUrl = firstVideo.thumbnail;
        }
        
        if (thumbnailUrl) {
            try {
                const imageResponse = await axios.get(thumbnailUrl, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(imageResponse.data);
                
                await sock.sendMessage(chatId, {
                    image: imageBuffer,
                    caption: resultMessage,
                    quoted: message
                });
                
            } catch (imageError) {
                // If image fails, send text only
                await reply(resultMessage);
            }
        } else {
            await reply(resultMessage);
        }
        
    } catch (error) {
        console.error('YTS Error:', error);
        await reply('❌ Error searching YouTube! Please try again.');
    }
};

module.exports = {
    nomCom: "yts",
    aliases: ["youtubesearch", "youtube"],
    reaction: '🔍',
    categorie: "search",
    execute: fana
};
