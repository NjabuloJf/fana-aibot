const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const fana = async (context) => {
    const { sock, message, chatId, reply, react, senderId, args } = context;
    
    try {
        if (!args[0]) {
            return await reply(`❌ Please provide an app name!\n\nUsage: ${config.PREFIX}apk <app_name>`);
        }
        
        await react('📱');
        
        const appName = args.join(' ');
        const loadingMsg = await reply('📱 Searching for APK...');
        
        try {
            // Using APK search API
            let searchResponse;
            
            try {
                // Primary APK API
                searchResponse = await axios.get(`https://api.apkpure.com/v1/search?q=${encodeURIComponent(appName)}&limit=5`);
            } catch (primaryError) {
                // Fallback APK API
                searchResponse = await axios.get(`https://api.popcat.xyz/playstore?q=${encodeURIComponent(appName)}`);
            }
            
            let apps;
            
            if (searchResponse.data.results) {
                apps = searchResponse.data.results;
            } else if (searchResponse.data.apps) {
                apps = searchResponse.data.apps;
            } else {
                apps = searchResponse.data;
            }
            
            if (!apps || apps.length === 0) {
                return await reply('❌ No APK found for your search!');
            }
            
            const app = apps[0]; // Get first result
            
            let appInfo = {
                name: app.name || app.title || appName,
                package: app.package || app.packageName || 'Unknown',
                version: app.version || 'Latest',
                size: app.size || 'Unknown',
                developer: app.developer || app.author || 'Unknown',
                rating: app.rating || 'N/A',
                downloads: app.downloads || 'Unknown',
                description: app.description || app.summary || 'No description available',
                icon: app.icon || app.image,
                downloadUrl: app.downloadUrl || app.url
            };
            
            const apkMessage = `📱 *APK FOUND* 📱

📋 *App Info:*
• Name: ${appInfo.name}
• Package: ${appInfo.package}
• Version: ${appInfo.version}
• Size: ${appInfo.size}
• Developer: ${appInfo.developer}
• Rating: ${appInfo.rating}
• Downloads: ${appInfo.downloads}

📝 *Description:*
${appInfo.description.substring(0, 200)}${appInfo.description.length > 200 ? '...' : ''}

${appInfo.downloadUrl ? `🔗 *Download Link:*\n${appInfo.downloadUrl}` : '❌ Direct download not available'}

⚠️ *Warning:* Only download APKs from trusted sources!

${config.BOT_FOOTER}`;

            // Send app icon if available
            if (appInfo.icon) {
                try {
                    const iconResponse = await axios.get(appInfo.icon, { responseType: 'arraybuffer' });
                    const iconBuffer = Buffer.from(iconResponse.data);
                    
                    await sock.sendMessage(chatId, {
                        image: iconBuffer,
                        caption: apkMessage,
                        quoted: message
                    });
                } catch (iconError) {
                    await reply(apkMessage);
                }
            } else {
                await reply(apkMessage);
            }
            
            // If multiple results, show alternatives
            if (apps.length > 1) {
                let alternativesMsg = `📱 *OTHER RESULTS:*\n\n`;
                
                apps.slice(1, 4).forEach((altApp, index) => {
                    alternativesMsg += `${index + 2}. ${altApp.name || altApp.title}\n`;
                    alternativesMsg += `   Developer: ${altApp.developer || altApp.author || 'Unknown'}\n`;
                    alternativesMsg += `   Package: ${altApp.package || altApp.packageName || 'Unknown'}\n\n`;
                });
                
                alternativesMsg += `💡 Use ${config.PREFIX}apk <exact_app_name> for specific results`;
                
                setTimeout(async () => {
                    await reply(alternativesMsg);
                }, 2000);
            }
            
        } catch (apiError) {
            console.error('APK search error:', apiError);
            
            const fallbackMessage = `📱 *APK SEARCH* 📱

🔍 *Query:* ${appName}

❌ *APK search service temporarily unavailable.*

💡 *Alternative sources:*
• Google Play Store
• APKPure: https://apkpure.com/search?q=${encodeURIComponent(appName)}
• APKMirror: https://apkmirror.com

⚠️ *Always download from trusted sources!*

${config.BOT_FOOTER}`;

            await reply(fallbackMessage);
        }
        
    } catch (error) {
        console.error('APK command error:', error);
        await reply('❌ Error searching for APK! Please try again.');
    }
};

module.exports = {
    nomCom: "apk",
    aliases: ["app", "playstore", "android"],
    reaction: '📱',
    categorie: "search",
    execute: fana
};
