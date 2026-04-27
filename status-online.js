status-online.jsonconst chalk = require('chalk');
const moment = require('moment-timezone');
const os = require('os');
const config = require('./config');
const { storage } = require('./storage');

// Status Manager Class
class StatusManager {
    constructor() {
        this.startTime = Date.now();
        this.isOnline = false;
        this.lastSeen = Date.now();
        this.connectionStatus = 'disconnected';
        this.presenceStatus = 'unavailable';
        this.statusHistory = [];
        this.keepAliveInterval = null;
        this.statusUpdateInterval = null;
        this.sock = null;
        
        this.initializeStatusManager();
    }

    // Initialize status manager
    initializeStatusManager() {
        console.log(chalk.blue('🔄 Initializing Status Manager...'));
        
        // Start keep-alive system
        this.startKeepAlive();
        
        // Start status updates
        this.startStatusUpdates();
        
        console.log(chalk.green('✅ Status Manager initialized'));
    }

    // Set socket instance
    setSocket(socket) {
        this.sock = socket;
        console.log(chalk.blue('🔗 Socket connected to Status Manager'));
    }

    // Start keep-alive system
    startKeepAlive() {
        this.keepAliveInterval = setInterval(async () => {
            try {
                if (this.sock && this.isOnline) {
                    // Send presence update to stay online
                    await this.sock.sendPresenceUpdate('available');
                    
                    // Update last seen
                    this.lastSeen = Date.now();
                    
                    // Log keep-alive
                    console.log(chalk.green(`💚 Keep-alive sent - ${moment().format('HH:mm:ss')}`));
                    
                    // Save status to storage
                    await this.saveStatusToStorage();
                }
            } catch (error) {
                console.error(chalk.red('❌ Keep-alive error:'), error);
                this.connectionStatus = 'error';
            }
        }, 30000); // Every 30 seconds
    }

    // Start status updates
    startStatusUpdates() {
        this.statusUpdateInterval = setInterval(async () => {
            try {
                await this.updateSystemStatus();
                await this.logStatusHistory();
            } catch (error) {
                console.error(chalk.red('❌ Status update error:'), error);
            }
        }, 60000); // Every 1 minute
    }

    // Set bot online
    async setBotOnline() {
        try {
            if (this.sock) {
                await this.sock.sendPresenceUpdate('available');
                this.isOnline = true;
                this.connectionStatus = 'connected';
                this.presenceStatus = 'available';
                this.lastSeen = Date.now();
                
                console.log(chalk.green('✅ Bot status: ONLINE'));
                
                // Log status change
                await this.logStatusChange('online', 'Bot came online');
                
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error setting bot online:'), error);
            return false;
        }
    }

    // Set bot offline
    async setBotOffline() {
        try {
            if (this.sock) {
                await this.sock.sendPresenceUpdate('unavailable');
                this.isOnline = false;
                this.connectionStatus = 'disconnected';
                this.presenceStatus = 'unavailable';
                
                console.log(chalk.red('❌ Bot status: OFFLINE'));
                
                // Log status change
                await this.logStatusChange('offline', 'Bot went offline');
                
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error setting bot offline:'), error);
            return false;
        }
    }

    // Set typing status
    async setTyping(chatId, duration = 3000) {
        try {
            if (this.sock && this.isOnline && config.AUTO_TYPING === 'true') {
                await this.sock.sendPresenceUpdate('composing', chatId);
                
                setTimeout(async () => {
                    try {
                        await this.sock.sendPresenceUpdate('paused', chatId);
                    } catch (error) {
                        console.error(chalk.red('❌ Error stopping typing:'), error);
                    }
                }, duration);
                
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error setting typing:'), error);
            return false;
        }
    }

    // Set recording status
    async setRecording(chatId, duration = 3000) {
        try {
            if (this.sock && this.isOnline && config.AUTO_RECORDING === 'true') {
                await this.sock.sendPresenceUpdate('recording', chatId);
                
                setTimeout(async () => {
                    try {
                        await this.sock.sendPresenceUpdate('paused', chatId);
                    } catch (error) {
                        console.error(chalk.red('❌ Error stopping recording:'), error);
                    }
                }, duration);
                
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error setting recording:'), error);
            return false;
        }
    }

    // Get bot status
    getBotStatus() {
        const uptime = this.getUptime();
        const systemInfo = this.getSystemInfo();
        
        return {
            isOnline: this.isOnline,
            connectionStatus: this.connectionStatus,
            presenceStatus: this.presenceStatus,
            uptime: uptime,
            lastSeen: this.lastSeen,
            startTime: this.startTime,
            system: systemInfo,
            timestamp: Date.now()
        };
    }

    // Get uptime
    getUptime() {
        const uptimeMs = Date.now() - this.startTime;
        const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
        const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((uptimeMs % (60 * 1000)) / 1000);
        
        return {
            ms: uptimeMs,
            formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
            days: days,
            hours: hours,
            minutes: minutes,
            seconds: seconds
        };
    }

    // Get system information
    getSystemInfo() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            memory: {
                used: Math.round(memUsage.heapUsed / 1024 / 1024),
                total: Math.round(memUsage.heapTotal / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024),
                rss: Math.round(memUsage.rss / 1024 / 1024)
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            loadAverage: os.loadavg(),
            freeMemory: Math.round(os.freemem() / 1024 / 1024),
            totalMemory: Math.round(os.totalmem() / 1024 / 1024),
            hostname: os.hostname()
        };
    }

    // Update system status
    async updateSystemStatus() {
        try {
            const status = this.getBotStatus();
            
            // Check memory usage
            if (status.system.memory.used > 500) { // 500MB
                console.log(chalk.yellow('⚠️ High memory usage detected'));
            }
            
            // Check if bot is still responsive
            const timeSinceLastSeen = Date.now() - this.lastSeen;
            if (timeSinceLastSeen > 120000) { // 2 minutes
                console.log(chalk.red('⚠️ Bot may be unresponsive - attempting reconnection'));
                this.connectionStatus = 'reconnecting';
                await this.attemptReconnection();
            }
            
            return status;
        } catch (error) {
            console.error(chalk.red('❌ Error updating system status:'), error);
            return null;
        }
    }

    // Attempt reconnection
    async attemptReconnection() {
        try {
            console.log(chalk.yellow('🔄 Attempting to reconnect...'));
            
            if (this.sock) {
                // Try to send presence update
                await this.sock.sendPresenceUpdate('available');
                this.lastSeen = Date.now();
                this.connectionStatus = 'connected';
                
                console.log(chalk.green('✅ Reconnection successful'));
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Reconnection failed:'), error);
            this.connectionStatus = 'failed';
            return false;
        }
    }

    // Log status change
    async logStatusChange(status, reason = '') {
        try {
            const statusLog = {
                timestamp: Date.now(),
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                status: status,
                reason: reason,
                uptime: this.getUptime().formatted,
                memory: this.getSystemInfo().memory.used
            };

            this.statusHistory.push(statusLog);
            
            // Keep only last 100 status changes
            if (this.statusHistory.length > 100) {
                this.statusHistory = this.statusHistory.slice(-100);
            }

            console.log(chalk.blue(`📊 Status change logged: ${status} - ${reason}`));
            
            // Save to storage
            await storage.saveSetting('statusHistory', this.statusHistory);
            
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error logging status change:'), error);
            return false;
        }
    }

    // Log status history
    async logStatusHistory() {
        try {
            const currentStatus = this.getBotStatus();
            
            const historyEntry = {
                timestamp: Date.now(),
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                isOnline: currentStatus.isOnline,
                connectionStatus: currentStatus.connectionStatus,
                uptime: currentStatus.uptime.ms,
                memory: currentStatus.system.memory.used,
                cpu: currentStatus.system.cpu
            };

            // Save to storage periodically
            await storage.saveSetting('lastStatusCheck', historyEntry);
            
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error logging status history:'), error);
            return false;
        }
    }

    // Save status to storage
    async saveStatusToStorage() {
        try {
            const status = this.getBotStatus();
            await storage.saveSetting('currentStatus', status);
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error saving status to storage:'), error);
            return false;
        }
    }

    // Get status history
    getStatusHistory() {
        return this.statusHistory;
    }

    // Get formatted status message
    getFormattedStatus() {
        const status = this.getBotStatus();
        const uptime = status.uptime;
        const memory = status.system.memory;
        
        return `🤖 *FANA AI BOT STATUS* 🤖

🟢 *Status:* ${status.isOnline ? 'ONLINE' : 'OFFLINE'}
🔗 *Connection:* ${status.connectionStatus.toUpperCase()}
⏰ *Uptime:* ${uptime.formatted}
💾 *Memory:* ${memory.used}MB / ${memory.total}MB
🖥️ *Platform:* ${status.system.platform}
📱 *Node.js:* ${status.system.nodeVersion}

📊 *System Info:*
• CPU Load: ${status.system.loadAverage[0].toFixed(2)}
• Free Memory: ${status.system.freeMemory}MB
• Total Memory: ${status.system.totalMemory}MB
• Hostname: ${status.system.hostname}

⏱️ *Last Seen:* ${moment(status.lastSeen).format('DD/MM/YYYY HH:mm:ss')}
📅 *Started:* ${moment(status.startTime).format('DD/MM/YYYY HH:mm:ss')}

${config.BOT_FOOTER}`;
    }

    // Get status for API
    getStatusForAPI() {
        const status = this.getBotStatus();
        
        return {
            online: status.isOnline,
            connection: status.connectionStatus,
            uptime: status.uptime.ms,
            uptimeFormatted: status.uptime.formatted,
            memory: {
                used: status.system.memory.used,
                total: status.system.memory.total,
                percentage: Math.round((status.system.memory.used / status.system.memory.total) * 100)
            },
            lastSeen: status.lastSeen,
            startTime: status.startTime,
            timestamp: Date.now()
        };
    }

    // Handle connection update
    async handleConnectionUpdate(update) {
        try {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                await this.setBotOnline();
                console.log(chalk.green('🟢 Connection established'));
            } else if (connection === 'close') {
                await this.setBotOffline();
                console.log(chalk.red('🔴 Connection closed'));
                
                // Log disconnect reason
                if (lastDisconnect?.error) {
                    await this.logStatusChange('disconnected', lastDisconnect.error.message);
                }
            } else if (connection === 'connecting') {
                this.connectionStatus = 'connecting';
                console.log(chalk.yellow('🟡 Connecting...'));
            }
            
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error handling connection update:'), error);
            return false;
        }
    }

    // Monitor performance
    async monitorPerformance() {
        try {
            const status = this.getBotStatus();
            const alerts = [];
            
            // Memory usage alert
            if (status.system.memory.used > 400) {
                alerts.push({
                    type: 'memory',
                    level: 'warning',
                    message: `High memory usage: ${status.system.memory.used}MB`
                });
            }
            
            // CPU load alert
            if (status.system.loadAverage[0] > 2.0) {
                alerts.push({
                    type: 'cpu',
                    level: 'warning',
                    message: `High CPU load: ${status.system.loadAverage[0].toFixed(2)}`
                });
            }
            
            // Uptime milestone
            const uptimeHours = Math.floor(status.uptime.ms / (60 * 60 * 1000));
            if (uptimeHours > 0 && uptimeHours % 24 === 0) {
                alerts.push({
                    type: 'milestone',
                    level: 'info',
                    message: `Bot has been running for ${uptimeHours} hours`
                });
            }
            
            // Process alerts
            for (const alert of alerts) {
                console.log(chalk.yellow(`⚠️ Performance Alert: ${alert.message}`));
                await this.logStatusChange('alert', alert.message);
            }
            
            return alerts;
        } catch (error) {
            console.error(chalk.red('❌ Error monitoring performance:'), error);
            return [];
        }
    }

    // Cleanup and shutdown
    async cleanup() {
        try {
            console.log(chalk.yellow('🧹 Cleaning up Status Manager...'));
            
            // Clear intervals
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
            }
            
            if (this.statusUpdateInterval) {
                clearInterval(this.statusUpdateInterval);
            }
            
            // Set bot offline
            await this.setBotOffline();
            
            // Log shutdown
            await this.logStatusChange('shutdown', 'Bot shutting down');
            
            // Save final status
            await this.saveStatusToStorage();
            
            console.log(chalk.green('✅ Status Manager cleanup complete'));
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error during cleanup:'), error);
            return false;
        }
    }

    // Get health check
    async getHealthCheck() {
        try {
            const status = this.getBotStatus();
            const health = {
                status: 'healthy',
                checks: {
                    connection: status.isOnline,
                    memory: status.system.memory.used < 500,
                    uptime: status.uptime.ms > 0,
                    lastSeen: (Date.now() - status.lastSeen) < 60000
                },
                timestamp: Date.now()
            };
            
               // Determine overall health status
            const allChecksPass = Object.values(health.checks).every(check => check === true);
            health.status = allChecksPass ? 'healthy' : 'unhealthy';
            
            // Add detailed info
            health.details = {
                uptime: status.uptime.formatted,
                memory: `${status.system.memory.used}MB`,
                connection: status.connectionStatus,
                lastSeen: moment(status.lastSeen).fromNow()
            };
            
            return health;
        } catch (error) {
            console.error(chalk.red('❌ Error getting health check:'), error);
            return {
                status: 'error',
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    // Send status report
    async sendStatusReport(chatId) {
        try {
            if (this.sock && chatId) {
                const statusMessage = this.getFormattedStatus();
                await this.sock.sendMessage(chatId, { text: statusMessage });
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error sending status report:'), error);
            return false;
        }
    }

    // Auto status announcements
    async autoStatusAnnouncement() {
        try {
            const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
            const uptime = this.getUptime();
            
            // Send daily status report
            if (uptime.hours === 0 && uptime.minutes === 0) {
                const message = `📊 *DAILY STATUS REPORT* 📊

🤖 *Bot:* ${config.BOT_NAME}
📅 *Date:* ${moment().format('DD/MM/YYYY')}
⏰ *Uptime:* ${uptime.formatted}
🟢 *Status:* ${this.isOnline ? 'ONLINE' : 'OFFLINE'}

💾 *Memory Usage:* ${this.getSystemInfo().memory.used}MB
📈 *Performance:* Good

${config.BOT_FOOTER}`;

                await this.sock.sendMessage(ownerJid, { text: message });
                console.log(chalk.blue('📊 Daily status report sent'));
            }
            
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error sending auto status:'), error);
            return false;
        }
    }
}

// Initialize status manager
const statusManager = new StatusManager();

// Status utilities
const StatusUtils = {
    // Quick status check
    isOnline() {
        return statusManager.isOnline;
    },

    // Get uptime
    getUptime() {
        return statusManager.getUptime();
    },

    // Get formatted uptime
    getFormattedUptime() {
        return statusManager.getUptime().formatted;
    },

    // Get memory usage
    getMemoryUsage() {
        const system = statusManager.getSystemInfo();
        return {
            used: system.memory.used,
            total: system.memory.total,
            percentage: Math.round((system.memory.used / system.memory.total) * 100)
        };
    },

    // Get system load
    getSystemLoad() {
        const system = statusManager.getSystemInfo();
        return system.loadAverage[0].toFixed(2);
    },

    // Format bytes
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// Performance monitor
const PerformanceMonitor = {
    // Start monitoring
    start() {
        setInterval(async () => {
            await statusManager.monitorPerformance();
        }, 5 * 60 * 1000); // Every 5 minutes
    },

    // Get performance metrics
    getMetrics() {
        const status = statusManager.getBotStatus();
        return {
            uptime: status.uptime.ms,
            memory: status.system.memory,
            cpu: status.system.cpu,
            load: status.system.loadAverage,
            timestamp: Date.now()
        };
    }
};

// Auto status announcements every 24 hours
setInterval(async () => {
    await statusManager.autoStatusAnnouncement();
}, 24 * 60 * 60 * 1000);

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🛑 Received SIGINT, shutting down gracefully...'));
    await statusManager.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down gracefully...'));
    await statusManager.cleanup();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
    await statusManager.logStatusChange('error', `Uncaught exception: ${error.message}`);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
    await statusManager.logStatusChange('error', `Unhandled rejection: ${reason}`);
});

// Export status manager and utilities
module.exports = {
    StatusManager,
    statusManager,
    StatusUtils,
    PerformanceMonitor
};

