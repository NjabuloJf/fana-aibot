const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide an Instagram video URL!\n\nUsage: ${config.PREFIX}instagram <instagram_video_url>`);
        }
        
        const url = args[0];
        
        // Validate Instagram URL
        if (!url.includes('instagram.com')) {
            return await reply('❌ Please provide a valid Instagram video URL!');
        }
        
        await react('📸');
        
        const loadingMsg = await reply('📸 Downloading Instagram video...');
        
        try {
            // Using Instagram video downloader API
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
                downloadResponse = await axios.get(`https://api.popcat.xyz/instagram?url=${encodeURIComponent(url)}`);
            }
            
            let videoUrl, title, author, thumbnail;
            
            if (downloadResponse.data.status === 'success') {
                videoUrl = downloadResponse.data.url;
                title = downloadResponse.data.title || 'Instagram Video';
            } else if (downloadResponse.data.video_url) {
                videoUrl = downloadResponse.data.video_url;
                title = downloadResponse.data.title || downloadResponse.data.caption || 'Instagram Video';
                author = downloadResponse.data.author || downloadResponse.data.username;
                thumbnail = downloadResponse.data.thumbnail;
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
            
            const caption = `📸 *INSTAGRAM VIDEO* 📸

📺 *Caption:* ${title}
${author ? `👤 *Author:* @${author}` : ''}
📊 *Size:* ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB
🔗 *Source:* Instagram

✅ *Downloaded successfully!*

${config.BOT_FOOTER}`;

            // Send thumbnail first if available
            if (thumbnail) {
                try {
                    const thumbResponse = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                    const thumbBuffer = Buffer.from(thumbResponse.data);
                    
                    await sock.sendMessage(chatId, {
                        image: thumbBuffer,
                        caption: `📸 *Downloading Instagram Video* 📸\n\n${title}\n${author ? `by @${author}` : ''}\n\n⬇️ Please wait...`,
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
            console.error('Instagram download error:', downloadError);
            
            const errorMessage = `❌ *INSTAGRAM DOWNLOAD FAILED* ❌

🔗 *URL:* ${url}
❌ *Error:* ${downloadError.message.includes('too large') ? 'Video too large (max 50MB)' : 'Could not download video'}

💡 *Possible solutions:*
• Check if the video is public
• Try a different Instagram video
• Make sure the URL is correct
• Private account videos cannot be downloaded

${config.BOT_FOOTER}`;

            await reply(errorMessage);
        }
        
    } catch (error) {
        console.error('Instagram command error:', error);
        await reply('❌ Error processing Instagram video! Please try again.');
    }
};

module.exports = {
    nomCom: "instagram",
    aliases: ["ig", "igdl", "insta"],
    reaction: '📸',
    categorie: "download",
    execute: fana
};
