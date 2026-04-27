const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide a song name!\n\nUsage: ${config.PREFIX}play <song name>`);
        }
        
        await react('🎵');
        
        const query = args.join(' ');
        const loadingMsg = await reply('🔍 Searching for music...');
        
        // Search for the song
        let searchResults;
        
        try {
            // Using YouTube search API
            if (config.API_KEYS.YOUTUBE) {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query + ' audio')}&type=video&key=${config.API_KEYS.YOUTUBE}`;
                const response = await axios.get(searchUrl);
                searchResults = response.data.items;
            } else {
                // Fallback to alternative API
                const altResponse = await axios.get(`https://api.popcat.xyz/youtube?q=${encodeURIComponent(query)}`);
                searchResults = altResponse.data.slice(0, 1);
            }
        } catch (apiError) {
            return await reply('❌ Music search API error! Please try again later.');
        }
        
        if (!searchResults || searchResults.length === 0) {
            return await reply('❌ No music found for your search!');
        }
        
        const video = searchResults[0];
        let title, channel, url, thumbnail, duration;
        
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
            url = video.url;
            thumbnail = video.thumbnail;
        }
        
        try {
            // Download audio using ytdl or alternative
            const downloadMsg = await reply('⬇️ Downloading audio...');
            
            // Try to get audio download link
            let audioUrl;
            
            try {
                // Using a YouTube to MP3 API
                const audioResponse = await axios.get(`https://api.cobalt.tools/api/json`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    data: {
                        url: url,
                        vCodec: 'h264',
                        vQuality: '720',
                        aFormat: 'mp3',
                        isAudioOnly: true
                    }
                });
                
                if (audioResponse.data.status === 'success') {
                    audioUrl = audioResponse.data.url;
                }
            } catch (downloadError) {
                // Fallback: send video info with link
                const infoMessage = `🎵 *MUSIC FOUND* 🎵

🎧 *Title:* ${title}
👤 *Channel:* ${channel}
${duration ? `⏱️ *Duration:* ${duration}` : ''}
🔗 *Link:* ${url}

❌ *Note:* Direct download not available. Click the link to listen on YouTube.

💡 *Tip:* Use ${config.PREFIX}play <song name> to search for music!

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
            
            if (audioUrl) {
                // Download the audio file
                const audioResponse = await axios.get(audioUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 60000 // 1 minute timeout
                });
                
                const audioBuffer = Buffer.from(audioResponse.data);
                
                // Check file size (max 50MB for WhatsApp)
                if (audioBuffer.length > 50 * 1024 * 1024) {
                    return await reply('❌ Audio file too large! Please try a shorter song.');
                }
                
                const audioCaption = `🎵 *MUSIC DOWNLOAD* 🎵

🎧 *Title:* ${title}
👤 *Artist:* ${channel}
${duration ? `⏱️ *Duration:* ${duration}` : ''}
📊 *Size:* ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB

🎶 Enjoy your music!

${config.BOT_FOOTER}`;

                // Send thumbnail first if available
                if (thumbnail) {
                    try {
                        const imageResponse = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                        const imageBuffer = Buffer.from(imageResponse.data);
                        
                        await sock.sendMessage(chatId, {
                            image: imageBuffer,
                            caption: `🎵 *NOW PLAYING* 🎵\n\n${title}\nby ${channel}\n\n⬇️ Audio downloading...`,
                            quoted: message
                        });
                    } catch (imgError) {
                        // Continue without image
                    }
                }
                
                // Send audio file
                await sock.sendMessage(chatId, {
                    audio: audioBuffer,
                    mimetype: 'audio/mp4',
                    ptt: false,
                    quoted: message,
                    caption: audioCaption
                });
                
            } else {
                throw new Error('No audio URL received');
            }
            
        } catch (downloadError) {
            console.error('Audio download error:', downloadError);
            
            // Fallback: send video info with thumbnail
            const fallbackMessage = `🎵 *MUSIC FOUND* 🎵

🎧 *Title:* ${title}
👤 *Channel:* ${channel}
${duration ? `⏱️ *Duration:* ${duration}` : ''}
🔗 *YouTube Link:* ${url}

❌ *Download Error:* Could not download audio file.
💡 *Solution:* Click the link above to listen on YouTube.

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
        console.error('Play Error:', error);
        await reply('❌ Error playing music! Please try again.');
    }
};

module.exports = {
    nomCom: "play",
    aliases: ["song", "music", "audio"],
    reaction: '🎵',
    categorie: "download",
    execute: fana
};
