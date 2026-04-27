const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a video name!\n\nUsage: ${config.PREFIX}video <video name>`);
        }
        
        await react('🎬');
        
        const query = args.join(' ');
        const loadingMsg = await reply('🔍 Searching for video...');
        
        // Search for the video
        let searchResults;
        
        try {
            // Using YouTube search API
            if (config.API_KEYS.YOUTUBE) {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query)}&type=video&key=${config.API_KEYS.YOUTUBE}`;
                const response = await axios.get(searchUrl);
                searchResults = response.data.items;
            } else {
                // Fallback to alternative API
                const altResponse = await axios.get(`https://api.popcat.xyz/youtube?q=${encodeURIComponent(query)}`);
                searchResults = altResponse.data.slice(0, 1);
            }
        } catch (apiError) {
            return await reply('❌ Video search API error! Please try again later.');
        }
        
        if (!searchResults || searchResults.length === 0) {
            return await reply('❌ No videos found for your search!');
        }
        
        const video = searchResults[0];
        let title, channel, url, thumbnail, duration, views;
        
        if (config.API_KEYS.YOUTUBE) {
            // Official YouTube API format
            title = video.snippet.title;
            channel = video.snippet.channelTitle;
            url = `https://youtube.com/watch?v=${video.id.videoId}`;
            thumbnail = video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url;
        } else {
            // Alternative API format
            title = video.title;
            channel = video.channel;
            duration = video.duration;
            views = video.views;
            url = video.url;
            thumbnail = video.thumbnail;
        }
        
        try {
            // Download video using API
            const downloadMsg = await reply('⬇️ Downloading video...');
            
            // Try to get video download link
            let videoUrl;
            
            try {
                // Using a YouTube downloader API
                const videoResponse = await axios.post(`https://api.cobalt.tools/api/json`, {
                    url: url,
                    vCodec: 'h264',
                    vQuality: '720',
                    aFormat: 'mp3',
                    isAudioOnly: false
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                
                if (videoResponse.data.status === 'success') {
                    videoUrl = videoResponse.data.url;
                }
            } catch (downloadError) {
                // Fallback: send video info with link
                const infoMessage = `🎬 *VIDEO FOUND* 🎬

📺 *Title:* ${title}
👤 *Channel:* ${channel}
${duration ? `⏱️ *Duration:* ${duration}` : ''}
${views ? `👀 *Views:* ${views}` : ''}
🔗 *Link:* ${url}

❌ *Note:* Direct download not available. Click the link to watch on YouTube.

💡 *Tip:* Use ${config.PREFIX}video <video name> to search for videos!

${config.BOT_FOOTER}`;

                // Send with thumbnail if available
                if (thumbnail) {
                    try {
                        const imageResponse = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                        const imageBuffer = Buffer.from(imageResponse.data);
                        
                        await sock.sendMessage(chatId, {
                            image: imageBuffer,
                            caption: infoMessage,
                            quoted: message
                        });
                        
                        return;
                    } catch (imgError) {
                        // Send text only if image fails
                        return await reply(infoMessage);
                    }
                } else {
                    return await reply(infoMessage);
                }
            }
            
            if (videoUrl) {
                // Download the video file
                const videoFileResponse = await axios.get(videoUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 120000, // 2 minutes timeout
                    maxContentLength: 50 * 1024 * 1024 // 50MB limit
                });
                
                const videoBuffer = Buffer.from(videoFileResponse.data);
                
                // Check file size (max 50MB for WhatsApp)
                if (videoBuffer.length > 50 * 1024 * 1024) {
                    return await reply('❌ Video file too large! Please try a shorter video.');
                }
                
                const videoCaption = `🎬 *VIDEO DOWNLOAD* 🎬

📺 *Title:* ${title}
👤 *Channel:* ${channel}
${duration ? `⏱️ *Duration:* ${duration}` : ''}
${views ? `👀 *Views:* ${views}` : ''}
📊 *Size:* ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB

🎥 Enjoy your video!

${config.BOT_FOOTER}`;

                // Send thumbnail first if available
                if (thumbnail) {
                    try {
                        const imageResponse = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                        const imageBuffer = Buffer.from(imageResponse.data);
                        
                        await sock.sendMessage(chatId, {
                            image: imageBuffer,
                            caption: `🎬 *NOW DOWNLOADING* 🎬\n\n${title}\nby ${channel}\n\n⬇️ Video downloading...`,
                            quoted: message
                        });
                    } catch (imgError) {
                        // Continue without image
                    }
                }
                
                // Send video file
                await sock.sendMessage(chatId, {
                    video: videoBuffer,
                    caption: videoCaption,
                    quoted: message,
                    mimetype: 'video/mp4'
                });
                
            } else {
                throw new Error('No video URL received');
            }
            
        } catch (downloadError) {
            console.error('Video download error:', downloadError);
            
            // Fallback: send video info with thumbnail
            const fallbackMessage = `🎬 *VIDEO FOUND* 🎬

📺 *Title:* ${title}
👤 *Channel:* ${channel}
${duration ? `⏱️ *Duration:* ${duration}` : ''}
${views ? `👀 *Views:* ${views}` : ''}
🔗 *YouTube Link:* ${url}

❌ *Download Error:* ${downloadError.message.includes('too large') ? 'Video file too large (max 50MB)' : 'Could not download video file'}
💡 *Solution:* Click the link above to watch on YouTube.

${config.BOT_FOOTER}`;

            if (thumbnail) {
                try {
                    const imageResponse = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(imageResponse.data);
                    
                    await sock.sendMessage(chatId, {
                        image: imageBuffer,
                        caption: fallbackMessage,
                        quoted: message
                    });
                } catch (imgError) {
                    await reply(fallbackMessage);
                }
            } else {
                await reply(fallbackMessage);
            }
        }
        
    } catch (error) {
        console.error('Video Error:', error);
        await reply('❌ Error downloading video! Please try again.');
    }
};

module.exports = {
    nomCom: "video",
    aliases: ["vid", "ytv", "download"],
    reaction: '🎬',
    categorie: "download",
    execute: fana
};
