const fs = require('fs');
const axios = require('axios');
const config = require('../config');
const { messageUtils } = require('../msg');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId } = context;
    
    try {
        await react('🎵');
        
        // Check if message has audio
        const messageContent = messageUtils.getMessageContent(message);
        const quotedMessage = messageUtils.getQuotedMessage(message);
        
        let audioMessage = null;
        
        if (messageContent && messageContent.type === 'audioMessage') {
            audioMessage = message;
        } else if (quotedMessage && quotedMessage.message.audioMessage) {
            audioMessage = { message: quotedMessage.message, key: quotedMessage.key };
        }
        
        if (!audioMessage) {
            return await reply(`🎵 *SHAZAM - MUSIC RECOGNITION* 🎵

❌ Please send an audio file or reply to an audio message!

📋 *How to use:*
1. Send an audio file
2. Use ${config.PREFIX}shazam
OR
1. Reply to an audio message
2. Use ${config.PREFIX}shazam

🎶 I'll identify the song for you!

${config.BOT_FOOTER}`);
        }
        
        const loadingMsg = await reply('🎵 Identifying music... Please wait...');
        
        try {
            // Download the audio
            const audioBuffer = await messageUtils.downloadMedia(sock, audioMessage);
            
            if (!audioBuffer) {
                return await reply('❌ Could not download audio file!');
            }
            
            // Check file size (max 10MB for processing)
            if (audioBuffer.length > 10 * 1024 * 1024) {
                return await reply('❌ Audio file too large! Maximum size is 10MB.');
            }
            
            let musicInfo;
            
            try {
                // Using AudD API (Shazam alternative)
                const base64Audio = audioBuffer.toString('base64');
                
                const auddResponse = await axios.post('https://api.audd.io/', {
                    audio: base64Audio,
                    return: 'apple_music,spotify,deezer,napster',
                    api_token: config.API_KEYS.AUDD || 'test'
                }, {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (auddResponse.data.status === 'success' && auddResponse.data.result) {
                    const result = auddResponse.data.result;
                    musicInfo = {
                        title: result.title,
                        artist: result.artist,
                        album: result.album,
                        release_date: result.release_date,
                        label: result.label,
                        timecode: result.timecode,
                        song_link: result.song_link,
                        apple_music: result.apple_music?.url,
                        spotify: result.spotify?.external_urls?.spotify,
                        deezer: result.deezer?.link
                    };
                } else {
                    throw new Error('No match found');
                }
                
            } catch (auddError) {
                // Fallback to alternative music recognition
                try {
                    const fallbackResponse = await axios.post('https://api.popcat.xyz/shazam', {
                        audio: audioBuffer.toString('base64')
                    });
                    
                    if (fallbackResponse.data.title) {
                        musicInfo = {
                            title: fallbackResponse.data.title,
                            artist: fallbackResponse.data.artist,
                            album: fallbackResponse.data.album,
                            genre: fallbackResponse.data.genre,
                            release_date: fallbackResponse.data.releasedate
                        };
                    } else {
                        throw new Error('No match found in fallback');
                    }
                } catch (fallbackError) {
                    return await reply(`❌ *MUSIC NOT RECOGNIZED* ❌

🎵 Could not identify this song.

💡 *Possible reasons:*
• Audio quality too low
• Background noise
• Song not in database
• Audio too short (try 10+ seconds)

🎶 *Tips for better recognition:*
• Use clear audio without background noise
• Send at least 10-15 seconds of the song
• Make sure the music is audible

${config.BOT_FOOTER}`);
                }
            }
            
            // Create result message
            const resultMessage = `🎵 *SONG IDENTIFIED!* 🎵

🎶 *Title:* ${musicInfo.title}
👤 *Artist:* ${musicInfo.artist}
${musicInfo.album ? `💿 *Album:* ${musicInfo.album}` : ''}
${musicInfo.release_date ? `📅 *Release Date:* ${musicInfo.release_date}` : ''}
${musicInfo.label ? `🏷️ *Label:* ${musicInfo.label}` : ''}
${musicInfo.genre ? `🎭 *Genre:* ${musicInfo.genre}` : ''}
${musicInfo.timecode ? `⏱️ *Detected at:* ${musicInfo.timecode}s` : ''}

🔗 *Listen on:*
${musicInfo.spotify ? `• Spotify: ${musicInfo.spotify}` : ''}
${musicInfo.apple_music ? `• Apple Music: ${musicInfo.apple_music}` : ''}
${musicInfo.deezer ? `• Deezer: ${musicInfo.deezer}` : ''}
${musicInfo.song_link ? `• More info: ${musicInfo.song_link}` : ''}

✅ *Recognition successful!*

${config.BOT_FOOTER}`;

            await reply(resultMessage);
            
            // Try to get album artwork
            if (musicInfo.title && musicInfo.artist) {
                try {
                    const artworkResponse = await axios.get(`https://api.popcat.xyz/itunes?q=${encodeURIComponent(musicInfo.title + ' ' + musicInfo.artist)}`);
                    
                    if (artworkResponse.data.image) {
                        const imageResponse = await axios.get(artworkResponse.data.image, { responseType: 'arraybuffer' });
                        const imageBuffer = Buffer.from(imageResponse.data);
                        
                        await sock.sendMessage(chatId, {
                            image: imageBuffer,
                            caption: `🎨 *ALBUM ARTWORK* 🎨\n\n${musicInfo.title}\nby ${musicInfo.artist}`,
                            quoted: message
                        });
                    }
                } catch (artworkError) {
                    // Continue without artwork
                }
            }
            
        } catch (downloadError) {
            console.error('Audio download error:', downloadError);
            await reply('❌ Error processing audio file! Please try again with a different audio.');
        }
        
    } catch (error) {
        console.error('Shazam command error:', error);
        await reply('❌ Error in music recognition! Please try again.');
    }
};

module.exports = {
    nomCom: "shazam",
    aliases: ["identify", "song", "music", "recognize"],
    reaction: '🎵',
    categorie: "ai",
    execute: fana
};
