const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a Facebook video URL!\n\nUsage: ${config.PREFIX}fb <facebook_video_url>`);
        }
        
        const url = args[0];
        
        // Validate Facebook URL
        if (!url.includes('facebook.com') && !url.includes('fb.watch')) {
            return await reply('❌ Please provide a valid Facebook video URL!');
        }
        
        await react('📘');
        
        const loadingMsg = await reply('📘 Downloading Facebook video...');
        
        try {
            // Using Facebook video downloader API
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
                downloadResponse = await axios.get(`https://api.popcat.xyz/facebook?url=${encodeURIComponent(url)}`);
            }
            
            let videoUrl, title, thumbnail;
            
            if (downloadResponse.data.status === 'success') {
                videoUrl = downloadResponse.data.url;
                title = downloadResponse.data.title || 'Facebook Video';
            } else if (downloadResponse.data.video_url) {
                videoUrl = downloadResponse.data.video_url;
                title = downloadResponse.data.title || 'Facebook Video';
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
                maxContentLength: 50 * 1024 * 1024 // 50MB limit
            });
            
            const videoBuffer = Buffer.from(videoResponse.data);
            
            if (videoBuffer.length > 50 * 1024 * 1024) {
                return await reply('❌ Video file too large! Maximum size is 50MB.');
            }
            
            const caption = `📘 *FACEBOOK VIDEO* 📘

📺 *Title:* ${title}
📊 *Size:* ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB
🔗 *Source:* Facebook

✅ *Downloaded successfully!*

${config.BOT_FOOTER}`;

            // Send thumbnail first if available
            if (thumbnail) {
                try {
                    const thumbResponse = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                    const thumbBuffer = Buffer.from(thumbResponse.data);
                    
                    await sock.sendMessage(chatId, {
                        image: thumbBuffer,
                        caption: `📘 *Downloading Facebook Video* 📘\n\n${title}\n\n⬇️ Please wait...`,
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
            console.error('Facebook download error:', downloadError);
            
            const errorMessage = `❌ *FACEBOOK DOWNLOAD FAILED* ❌

🔗 *URL:* ${url}
❌ *Error:* ${downloadError.message.includes('too large') ? 'Video too large (max 50MB)' : 'Could not download video'}

💡 *Possible solutions:*
• Check if the video is public
• Try a different Facebook video
• Make sure the URL is correct

${config.BOT_FOOTER}`;

            await reply(errorMessage);
        }
        
    } catch (error) {
        console.error('FB command error:', error);
        await reply('❌ Error processing Facebook video! Please try again.');
    }
};

module.exports = {
    nomCom: "fb",
    aliases: ["facebook", "fbdl"],
    reaction: '📘',
    categorie: "download",
    execute: fana
};
