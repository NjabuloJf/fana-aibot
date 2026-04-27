const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a TikTok video URL!\n\nUsage: ${config.PREFIX}tiktok <tiktok_video_url>`);
        }
        
        const url = args[0];
        
        // Validate TikTok URL
        if (!url.includes('tiktok.com') && !url.includes('vm.tiktok.com')) {
            return await reply('❌ Please provide a valid TikTok video URL!');
        }
        
        await react('🎵');
        
        const loadingMsg = await reply('🎵 Downloading TikTok video...');
        
        try {
            // Using TikTok video downloader API
            let downloadResponse;
            
            try {
                // Primary API
                downloadResponse = await axios.post('https://api.cobalt.tools/api/json', {
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
            } catch (primaryError) {
                // Fallback API
                downloadResponse = await axios.get(`https://api.popcat.xyz/tiktok?url=${encodeURIComponent(url)}`);
            }
            
            let videoUrl, title, author, thumbnail, music;
            
            if (downloadResponse.data.status === 'success') {
                videoUrl = downloadResponse.data.url;
                title = downloadResponse.data.title || 'TikTok Video';
            } else if (downloadResponse.data.video_url) {
                videoUrl = downloadResponse.data.video_url;
                title = downloadResponse.data.title || downloadResponse.data.description || 'TikTok Video';
                author = downloadResponse.data.author || downloadResponse.data.username;
                thumbnail = downloadResponse.data.thumbnail;
                music = downloadResponse.data.music;
            } else {
                throw new Error('No download URL found');
            }
            
            if (!videoUrl) {
                return await reply('❌ Could not extract video URL. Please check the link and try again.');
            }
            
            // Download the video
            const videoResponse = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 120000, // 2 minutes
                maxContentLength: 50 * 1024 * 1024, // 50MB limit
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const videoBuffer = Buffer.from(videoResponse.data);
            
            if (videoBuffer.length > 50 * 1024 * 1024) {
                return await reply('❌ Video file too large! Maximum size is 50MB.');
            }
            
            const caption = `🎵 *TIKTOK VIDEO* 🎵

📺 *Title:* ${title}
${author ? `👤 *Author:* @${author}` : ''}
${music ? `🎵 *Music:* ${music}` : ''}
📊 *Size:* ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB
🔗 *Source:* TikTok

✅ *Downloaded successfully!*

${config.BOT_FOOTER}`;

            // Send thumbnail first if available
            if (thumbnail) {
                try {
                    const thumbResponse = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                    const thumbBuffer = Buffer.from(thumbResponse.data);
                    
                    await sock.sendMessage(chatId, {
                        image: thumbBuffer,
                        caption: `🎵 *Downloading TikTok Video* 🎵\n\n${title}\n${author ? `by @${author}` : ''}\n\n⬇️ Please wait...`,
                        quoted: message
                    });
                } catch (thumbError) {
                    // Continue without thumbnail
                }
            }
            
            // Send video
            await sock.sendMessage(chatId, {
                video: videoBuffer,
                caption: caption,
                quoted: message,
                mimetype: 'video/mp4'
            });
            
        } catch (downloadError) {
            console.error('TikTok download error:', downloadError);
            
            const errorMessage = `❌ *TIKTOK DOWNLOAD FAILED* ❌

🔗 *URL:* ${url}
❌ *Error:* ${downloadError.message.includes('too large') ? 'Video too large (max 50MB)' : 'Could not download video'}

💡 *Possible solutions:*
• Check if the video is public
• Try a different TikTok video
• Make sure the URL is correct
• Some private videos cannot be downloaded

${config.BOT_FOOTER}`;

            await reply(errorMessage);
        }
        
    } catch (error) {
        console.error('TikTok command error:', error);
        await reply('❌ Error processing TikTok video! Please try again.');
    }
};

module.exports = {
    nomCom: "tiktok",
    aliases: ["tt", "ttdl", "tiktokdl"],
    reaction: '🎵',
    categorie: "download",
    execute: fana
};
