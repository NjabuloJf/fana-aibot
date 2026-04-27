const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('./config');
const { makeid } = require('./id');

// Storage Manager Class
class StorageManager {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.backupDir = path.join(__dirname, 'backups');
        this.tempDir = path.join(__dirname, 'temp');
        this.mediaDir = path.join(__dirname, 'media');
        
        this.initializeDirectories();
        this.initializeFiles();
    }

    // Initialize required directories
    async initializeDirectories() {
        try {
            const dirs = [
                this.dataDir,
                this.backupDir,
                this.tempDir,
                this.mediaDir,
                path.join(this.mediaDir, 'images'),
                path.join(this.mediaDir, 'videos'),
                path.join(this.mediaDir, 'audio'),
                path.join(this.mediaDir, 'documents'),
                path.join(this.mediaDir, 'stickers'),
                path.join(__dirname, 'logs'),
                path.join(__dirname, 'session')
            ];

            for (const dir of dirs) {
                await fs.ensureDir(dir);
            }

            console.log(chalk.green('✅ Storage directories initialized'));
        } catch (error) {
            console.error(chalk.red('❌ Error initializing directories:'), error);
        }
    }

    // Initialize required files
    async initializeFiles() {
        try {
            const files = [
                { path: path.join(this.dataDir, 'users.json'), data: {} },
                { path: path.join(this.dataDir, 'groups.json'), data: {} },
                { path: path.join(this.dataDir, 'admins.json'), data: [] },
                { path: path.join(this.dataDir, 'banned.json'), data: [] },
                { path: path.join(this.dataDir, 'settings.json'), data: {} },
                { path: path.join(this.dataDir, 'commands.json'), data: {} },
                { path: path.join(this.dataDir, 'stats.json'), data: { 
                    totalMessages: 0, 
                    totalCommands: 0, 
                    totalUsers: 0, 
                    totalGroups: 0,
                    startTime: Date.now()
                }},
                { path: path.join(this.dataDir, 'antilink.json'), data: {} },
                { path: path.join(this.dataDir, 'welcome.json'), data: {} }
            ];

            for (const file of files) {
                if (!await fs.pathExists(file.path)) {
                    await fs.writeJson(file.path, file.data, { spaces: 2 });
                }
            }

            console.log(chalk.green('✅ Storage files initialized'));
        } catch (error) {
            console.error(chalk.red('❌ Error initializing files:'), error);
        }
    }

    // ========== USER DATA MANAGEMENT ==========
    
    // Get user data
    async getUser(userId) {
        try {
            const usersFile = path.join(this.dataDir, 'users.json');
            const users = await fs.readJson(usersFile);
            return users[userId] || null;
        } catch (error) {
            console.error(chalk.red('❌ Error getting user:'), error);
            return null;
        }
    }

    // Save user data
    async saveUser(userId, userData) {
        try {
            const usersFile = path.join(this.dataDir, 'users.json');
            let users = {};
            
            if (await fs.pathExists(usersFile)) {
                users = await fs.readJson(usersFile);
            }

            users[userId] = {
                ...users[userId],
                ...userData,
                lastSeen: Date.now(),
                updatedAt: Date.now()
            };

            await fs.writeJson(usersFile, users, { spaces: 2 });
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error saving user:'), error);
            return false;
        }
    }

    // Get all users
    async getAllUsers() {
        try {
            const usersFile = path.join(this.dataDir, 'users.json');
            if (await fs.pathExists(usersFile)) {
                return await fs.readJson(usersFile);
            }
            return {};
        } catch (error) {
            console.error(chalk.red('❌ Error getting all users:'), error);
            return {};
        }
    }

    // ========== GROUP DATA MANAGEMENT ==========
    
    // Get group data
    async getGroup(groupId) {
        try {
            const groupsFile = path.join(this.dataDir, 'groups.json');
            const groups = await fs.readJson(groupsFile);
            return groups[groupId] || null;
        } catch (error) {
            console.error(chalk.red('❌ Error getting group:'), error);
            return null;
        }
    }

    // Save group data
    async saveGroup(groupId, groupData) {
        try {
            const groupsFile = path.join(this.dataDir, 'groups.json');
            let groups = {};
            
            if (await fs.pathExists(groupsFile)) {
                groups = await fs.readJson(groupsFile);
            }

            groups[groupId] = {
                ...groups[groupId],
                ...groupData,
                updatedAt: Date.now()
            };

            await fs.writeJson(groupsFile, groups, { spaces: 2 });
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error saving group:'), error);
            return false;
        }
    }

    // Get all groups
    async getAllGroups() {
        try {
            const groupsFile = path.join(this.dataDir, 'groups.json');
            if (await fs.pathExists(groupsFile)) {
                return await fs.readJson(groupsFile);
            }
            return {};
        } catch (error) {
            console.error(chalk.red('❌ Error getting all groups:'), error);
            return {};
        }
    }

    // ========== ADMIN MANAGEMENT ==========
    
    // Get admins list
    async getAdmins() {
        try {
            const adminsFile = path.join(this.dataDir, 'admins.json');
            if (await fs.pathExists(adminsFile)) {
                return await fs.readJson(adminsFile);
            }
            return [];
        } catch (error) {
            console.error(chalk.red('❌ Error getting admins:'), error);
            return [];
        }
    }

    // Add admin
    async addAdmin(userId) {
        try {
            const admins = await this.getAdmins();
            if (!admins.includes(userId)) {
                admins.push(userId);
                const adminsFile = path.join(this.dataDir, 'admins.json');
                await fs.writeJson(adminsFile, admins, { spaces: 2 });
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error adding admin:'), error);
            return false;
        }
    }

    // Remove admin
    async removeAdmin(userId) {
        try {
            const admins = await this.getAdmins();
            const index = admins.indexOf(userId);
            if (index > -1) {
                admins.splice(index, 1);
                const adminsFile = path.join(this.dataDir, 'admins.json');
                await fs.writeJson(adminsFile, admins, { spaces: 2 });
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error removing admin:'), error);
            return false;
        }
    }

    // Check if user is admin
    async isAdmin(userId) {
        try {
            const admins = await this.getAdmins();
            return admins.includes(userId);
        } catch (error) {
            console.error(chalk.red('❌ Error checking admin:'), error);
            return false;
        }
    }

    // ========== BANNED USERS MANAGEMENT ==========
    
    // Get banned users
    async getBannedUsers() {
        try {
            const bannedFile = path.join(this.dataDir, 'banned.json');
            if (await fs.pathExists(bannedFile)) {
                return await fs.readJson(bannedFile);
            }
            return [];
        } catch (error) {
            console.error(chalk.red('❌ Error getting banned users:'), error);
            return [];
        }
    }

    // Ban user
    async banUser(userId, reason = 'No reason provided') {
        try {
            const banned = await this.getBannedUsers();
            const existingBan = banned.find(b => b.userId === userId);
            
            if (!existingBan) {
                banned.push({
                    userId: userId,
                    reason: reason,
                    bannedAt: Date.now(),
                    bannedBy: 'system'
                });
                
                const bannedFile = path.join(this.dataDir, 'banned.json');
                await fs.writeJson(bannedFile, banned, { spaces: 2 });
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error banning user:'), error);
            return false;
        }
    }

    // Unban user
    async unbanUser(userId) {
        try {
            const banned = await this.getBannedUsers();
            const filteredBanned = banned.filter(b => b.userId !== userId);
            
            if (banned.length !== filteredBanned.length) {
                const bannedFile = path.join(this.dataDir, 'banned.json');
                await fs.writeJson(bannedFile, filteredBanned, { spaces: 2 });
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error unbanning user:'), error);
            return false;
        }
    }

    // Check if user is banned
    async isBanned(userId) {
        try {
            const banned = await this.getBannedUsers();
            return banned.some(b => b.userId === userId);
        } catch (error) {
            console.error(chalk.red('❌ Error checking banned user:'), error);
            return false;
        }
    }

    // ========== SETTINGS MANAGEMENT ==========
    
    // Get setting
    async getSetting(key, defaultValue = null) {
        try {
            const settingsFile = path.join(this.dataDir, 'settings.json');
            if (await fs.pathExists(settingsFile)) {
                const settings = await fs.readJson(settingsFile);
                return settings[key] !== undefined ? settings[key] : defaultValue;
            }
            return defaultValue;
        } catch (error) {
            console.error(chalk.red('❌ Error getting setting:'), error);
            return defaultValue;
        }
    }

    // Save setting
    async saveSetting(key, value) {
        try {
            const settingsFile = path.join(this.dataDir, 'settings.json');
            let settings = {};
            
            if (await fs.pathExists(settingsFile)) {
                settings = await fs.readJson(settingsFile);
            }

            settings[key] = value;
            settings.updatedAt = Date.now();

            await fs.writeJson(settingsFile, settings, { spaces: 2 });
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error saving setting:'), error);
            return false;
        }
    }

    // Get all settings
    async getAllSettings() {
        try {
            const settingsFile = path.join(this.dataDir, 'settings.json');
            if (await fs.pathExists(settingsFile)) {
                return await fs.readJson(settingsFile);
            }
            return {};
        } catch (error) {
            console.error(chalk.red('❌ Error getting all settings:'), error);
            return {};
        }
    }

    // ========== STATISTICS MANAGEMENT ==========
    
    // Get stats
    async getStats() {
        try {
            const statsFile = path.join(this.dataDir, 'stats.json');
            if (await fs.pathExists(statsFile)) {
                return await fs.readJson(statsFile);
            }
            return {
                totalMessages: 0,
                totalCommands: 0,
                totalUsers: 0,
                totalGroups: 0,
                startTime: Date.now()
            };
        } catch (error) {
            console.error(chalk.red('❌ Error getting stats:'), error);
            return {};
        }
    }

    // Update stats
    async updateStats(statKey, increment = 1) {
        try {
            const stats = await this.getStats();
            stats[statKey] = (stats[statKey] || 0) + increment;
            stats.lastUpdated = Date.now();

            const statsFile = path.join(this.dataDir, 'stats.json');
            await fs.writeJson(statsFile, stats, { spaces: 2 });
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error updating stats:'), error);
            return false;
        }
    }

    // Reset stats
    async resetStats() {
        try {
            const stats = {
                totalMessages: 0,
                totalCommands: 0,
                totalUsers: 0,
                totalGroups: 0,
                startTime: Date.now(),
                resetAt: Date.now()
            };

            const statsFile = path.join(this.dataDir, 'stats.json');
            await fs.writeJson(statsFile, stats, { spaces: 2 });
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error resetting stats:'), error);
            return false;
        }
    }

    // ========== ANTILINK MANAGEMENT ==========
    
    // Get antilink settings for group
    async getAntilinkSettings(groupId) {
        try {
            const antilinkFile = path.join(this.dataDir, 'antilink.json');
            if (await fs.pathExists(antilinkFile)) {
                const antilink = await fs.readJson(antilinkFile);
                return antilink[groupId] || { enabled: false, action: 'delete', warnings: {} };
            }
            return { enabled: false, action: 'delete', warnings: {} };
        } catch (error) {
            console.error(chalk.red('❌ Error getting antilink settings:'), error);
            return { enabled: false, action: 'delete', warnings: {} };
        }
    }

    // Save antilink settings
    async saveAntilinkSettings(groupId, settings) {
        try {
            const antilinkFile = path.join(this.dataDir, 'antilink.json');
            let antilink = {};
            
            if (await fs.pathExists(antilinkFile)) {
                antilink = await fs.readJson(antilinkFile);
            }

            antilink[groupId] = {
                ...antilink[groupId],
                ...settings,
                updatedAt: Date.now()
            };

            await fs.writeJson(antilinkFile, antilink, { spaces: 2 });
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error saving antilink settings:'), error);
            return false;
        }
    }

    // ========== WELCOME MANAGEMENT ==========
    
    // Get welcome settings for group
    async getWelcomeSettings(groupId) {
        try {
            const welcomeFile = path.join(this.dataDir, 'welcome.json');
            if (await fs.pathExists(welcomeFile)) {
                const welcome = await fs.readJson(welcomeFile);
                return welcome[groupId] || { enabled: true, message: config.WELCOME_MESSAGE };
            }
            return { enabled: true, message: config.WELCOME_MESSAGE };
        } catch (error) {
            console.error(chalk.red('❌ Error getting welcome settings:'), error);
            return { enabled: true, message: config.WELCOME_MESSAGE };
        }
    }

    // Save welcome settings
    async saveWelcomeSettings(groupId, settings) {
        try {
            const welcomeFile = path.join(this.dataDir, 'welcome.json');
            let welcome = {};
            
            if (await fs.pathExists(welcomeFile)) {
                welcome = await fs.readJson(welcomeFile);
            }

            welcome[groupId] = {
                ...welcome[groupId],
                ...settings,
                updatedAt: Date.now()
            };

            await fs.writeJson(welcomeFile, welcome, { spaces: 2 });
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error saving welcome settings:'), error);
            return false;
        }
    }

    // ========== BACKUP MANAGEMENT ==========
    
    // Create backup
    async createBackup() {
        try {
            const backupId = `backup_${moment().format('YYYYMMDD_HHmmss')}_${makeid(6)}`;
            const backupPath = path.join(this.backupDir, `${backupId}.json`);
            
            const backupData = {
                id: backupId,
                timestamp: Date.now(),
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                version: config.BOT_VERSION,
                data: {
                    users: await this.getAllUsers(),
                    groups: await this.getAllGroups(),
                    admins: await this.getAdmins(),
                    banned: await this.getBannedUsers(),
                    settings: await this.getAllSettings(),
                    stats: await this.getStats()
                }
            };

            await fs.writeJson(backupPath, backupData, { spaces: 2 });
            console.log(chalk.green(`✅ Backup created: ${backupId}`));
            return backupId;
        } catch (error) {
            console.error(chalk.red('❌ Error creating backup:'), error);
            return null;
        }
    }

    // Restore backup
    async restoreBackup(backupId) {
        try {
            const backupPath = path.join(this.backupDir, `${backupId}.json`);
            
            if (!await fs.pathExists(backupPath)) {
                throw new Error('Backup file not found');
            }

            const backupData = await fs.readJson(backupPath);
            
            // Restore data files
            const files = [
                { file: 'users.json', data: backupData.data.users },
                { file: 'groups.json', data: backupData.data.groups },
                { file: 'admins.json', data: backupData.data.admins },
                { file: 'banned.json', data: backupData.data.banned },
                { file: 'settings.json', data: backupData.data.settings },
                { file: 'stats.json', data: backupData.data.stats }
            ];

            for (const fileData of files) {
                const filePath = path.join(this.dataDir, fileData.file);
                await fs.writeJson(filePath, fileData.data, { spaces: 2 });
            }

            console.log(chalk.green(`✅ Backup restored: ${backupId}`));
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error restoring backup:'), error);
            return false;
        }
    }

    // Get backup list
    async getBackupList() {
        try {
            const backupFiles = await fs.readdir(this.backupDir);
            const backups = [];

            for (const file of backupFiles) {
                if (file.endsWith('.json')) {
                    const backupPath = path.join(this.backupDir, file);
                    const backupData = await fs.readJson(backupPath);
                    backups.push({
                        id: backupData.id,
                        date: backupData.date,
                        timestamp: backupData.timestamp,
                        version: backupData.version,
                        size: (await fs.stat(backupPath)).size
                    });
                }
            }

            return backups.sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error(chalk.red('❌ Error getting backup list:'), error);
            return [];
        }
    }

    // Delete backup
    async deleteBackup(backupId) {
        try {
            const backupPath = path.join(this.backupDir, `${backupId}.json`);
            
            if (await fs.pathExists(backupPath)) {
                await fs.remove(backupPath);
                console.log(chalk.yellow(`🗑️ Backup deleted: ${backupId}`));
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error deleting backup:'), error);
            return false;
        }
    }

    // ========== CLEANUP FUNCTIONS ==========
    
    // Clean old backups
    async cleanOldBackups(maxBackups = 10) {
        try {
            const backups = await this.getBackupList();
            
            if (backups.length > maxBackups) {
                const toDelete = backups.slice(maxBackups);
                let deleted = 0;
                
                for (const backup of toDelete) {
                    if (await this.deleteBackup(backup.id)) {
                        deleted++;
                    }
                }
                
                console.log(chalk.yellow(`🧹 Cleaned ${deleted} old backups`));
                return deleted;
            }
            return 0;
        } catch (error) {
            console.error(chalk.red('❌ Error cleaning old backups:'), error);
            return 0;
        }
    }

    // Clean temp files
    async cleanTempFiles() {
        try {
            const tempFiles = await fs.readdir(this.tempDir);
            let cleaned = 0;
            
            for (const file of tempFiles) {
                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);
                
                // Delete files older than 1 hour
                if (Date.now() - stats.mtime.getTime() > 60 * 60 * 1000) {
                    await fs.remove(filePath);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                console.log(chalk.yellow(`🧹 Cleaned ${cleaned} temp files`));
            }
            return cleaned;
        } catch (error) {
            console.error(chalk.red('❌ Error cleaning temp files:'), error);
            return 0;
        }
    }

    // Clean old logs
    async cleanOldLogs(maxDays = 7) {
        try {
            const logsDir = path.join(__dirname, 'logs');
            if (!await fs.pathExists(logsDir)) return 0;
            
            const logFiles = await fs.readdir(logsDir);
            let cleaned = 0;
            const maxAge = maxDays * 24 * 60 * 60 * 1000;
            
            for (const file of logFiles) {
                const filePath = path.join(logsDir, file);
                const stats = await fs.stat(filePath);
                
                if (Date.now() - stats.mtime.getTime() > maxAge) {
                    await fs.remove(filePath);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                console.log(chalk.yellow(`🧹 Cleaned ${cleaned} old log files`));
            }
            return cleaned;
        } catch (error) {
            console.error(chalk.red('❌ Error cleaning old logs:'), error);
            return 0;
        }
    }

    // ========== MEDIA MANAGEMENT ==========
    
    // Save media file
    async saveMedia(buffer, filename, type = 'images') {
        try {
            const mediaPath = path.join(this.mediaDir, type);
            await fs.ensureDir(mediaPath);
            
            const filePath = path.join(mediaPath, filename);
            await fs.writeFile(filePath, buffer);
            
            return filePath;
        } catch (error) {
            console.error(chalk.red('❌ Error saving media:'), error);
            return null;
        }
    }

    // Get media file
    async getMedia(filename, type = 'images') {
        try {
            const filePath = path.join(this.mediaDir, type, filename);
            
            if (await fs.pathExists(filePath)) {
                return await fs.readFile(filePath);
            }
            return null;
        } catch (error) {
            console.error(chalk.red('❌ Error getting media:'), error);
            return null;
        }
    }

    // Delete media file
    async deleteMedia(filename, type = 'images') {
        try {
            const filePath = path.join(this.mediaDir, type, filename);
            
            if (await fs.pathExists(filePath)) {
                await fs.remove(filePath);
                return true;
            }
            return false;
        } catch (error) {
            console.error(chalk.red('❌ Error deleting media:'), error);
            return false;
        }
    }

    // ========== UTILITY FUNCTIONS ==========
    
    // Get storage info
    async getStorageInfo() {
        try {
            const info = {
                directories: {},
                files: {},
                totalSize: 0
            };

            const dirs = [
                { name: 'data', path: this.dataDir },
                { name: 'backups', path: this.backupDir },
                { name: 'temp', path: this.tempDir },
                { name: 'media', path: this.mediaDir },
                { name: 'logs', path: path.join(__dirname, 'logs') }
            ];

            for (const dir of dirs) {
                if (await fs.pathExists(dir.path)) {
                    const files = await this.getDirectorySize(dir.path);
                    info.directories[dir.name] = files;
                    info.totalSize += files.size;
                }
            }

            // Get individual file info
            const dataFiles = [
                'users.json', 'groups.json', 'admins.json', 
                'banned.json', 'settings.json', 'stats.json'
            ];

            for (const file of dataFiles) {
                const filePath = path.join(this.dataDir, file);
                if (await fs.pathExists(filePath)) {
                    const stats = await fs.stat(filePath);
                    info.files[file] = {
                        size: stats.size,
                        modified: stats.mtime
                    };
                }
            }

            return info;
        } catch (error) {
            console.error(chalk.red('❌ Error getting storage info:'), error);
            return null;
        }
    }

    // Get directory size
    async getDirectorySize(dirPath) {
        try {
            let totalSize = 0;
            let fileCount = 0;

            const files = await fs.readdir(dirPath);
            
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.stat(filePath);
                
                if (stats.isDirectory()) {
                    const subDir = await this.getDirectorySize(filePath);
                    totalSize += subDir.size;
                    fileCount += subDir.files;
                } else {
                    totalSize += stats.size;
                    fileCount++;
                }
            }

            return { size: totalSize, files: fileCount };
        } catch (error) {
            console.error(chalk.red('❌ Error getting directory size:'), error);
            return { size: 0, files: 0 };
        }
    }

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Export data
    async exportData() {
        try {
            const exportData = {
                timestamp: Date.now(),
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                version: config.BOT_VERSION,
                users: await this.getAllUsers(),
                groups: await this.getAllGroups(),
                admins: await this.getAdmins(),
                banned: await this.getBannedUsers(),
                settings: await this.getAllSettings(),
                stats: await this.getStats()
            };

            const exportPath = path.join(this.tempDir, `export_${Date.now()}.json`);
            await fs.writeJson(exportPath, exportData, { spaces: 2 });
            
            return exportPath;
        } catch (error) {
            console.error(chalk.red('❌ Error exporting data:'), error);
            return null;
        }
    }

    // Import data
    async importData(filePath) {
        try {
            if (!await fs.pathExists(filePath)) {
                throw new Error('Import file not found');
            }

            const importData = await fs.readJson(filePath);
            
            // Validate import data
            if (!importData.users || !importData.groups) {
                throw new Error('Invalid import data format');
            }

            // Import data
            await fs.writeJson(path.join(this.dataDir, 'users.json'), importData.users, { spaces: 2 });
            await fs.writeJson(path.join(this.dataDir, 'groups.json'), importData.groups, { spaces: 2 });
            
            if (importData.admins) {
                await fs.writeJson(path.join(this.dataDir, 'admins.json'), importData.admins, { spaces: 2 });
            }
            
            if (importData.banned) {
                await fs.writeJson(path.join(this.dataDir, 'banned.json'), importData.banned, { spaces: 2 });
            }
            
            if (importData.settings) {
                await fs.writeJson(path.join(this.dataDir, 'settings.json'), importData.settings, { spaces: 2 });
            }

            console.log(chalk.green('✅ Data imported successfully'));
            return true;
        } catch (error) {
            console.error(chalk.red('❌ Error importing data:'), error);
            return false;
        }
    }
}

// Initialize storage manager
const storage = new StorageManager();

// Auto cleanup every hour
setInterval(async () => {
    await storage.cleanTempFiles();
    await storage.cleanOldLogs();
    await storage.cleanOldBackups();
}, 60 * 60 * 1000);

// Auto backup every 24 hours
setInterval(async () => {
    await storage.createBackup();
}, 24 * 60 * 60 * 1000);

// Export storage manager
module.exports = {
    StorageManager,
    storage
};
