const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// Generate random ID function
function makeid(num = 4) {
    let result = "";
    let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var characters9 = characters.length;
    for (var i = 0; i < num; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters9));
    }
    return result;
}

// Generate secure random ID
function makeSecureId(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomArray = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
        result += chars[randomArray[i] % chars.length];
    }
    return result;
}

// Generate numeric ID
function makeNumericId(length = 8) {
    let result = "";
    let numbers = "0123456789";
    for (let i = 0; i < length; i++) {
        result += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    return result;
}

// Generate hex ID
function makeHexId(length = 16) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

// Generate UUID v4
function generateUUID() {
    return crypto.randomUUID();
}

// Generate session ID
function generateSessionId() {
    const timestamp = Date.now().toString(36);
    const randomPart = makeid(8);
    return `session_${timestamp}_${randomPart}`;
}

// Generate message ID
function generateMessageId() {
    const timestamp = Date.now();
    const random = makeid(6);
    return `msg_${timestamp}_${random}`;
}

// Generate user ID
function generateUserId(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const hash = crypto.createHash('md5').update(cleanNumber).digest('hex').substring(0, 8);
    return `user_${hash}_${makeid(4)}`;
}

// Generate group ID
function generateGroupId(groupName) {
    const cleanName = groupName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const timestamp = Date.now().toString(36);
    const random = makeid(6);
    return `group_${cleanName}_${timestamp}_${random}`;
}

// Generate command ID
function generateCommandId(commandName) {
    const timestamp = Date.now().toString(36);
    const random = makeid(4);
    return `cmd_${commandName}_${timestamp}_${random}`;
}

// Generate file ID
function generateFileId(filename) {
    const extension = path.extname(filename);
    const basename = path.basename(filename, extension);
    const hash = crypto.createHash('md5').update(basename).digest('hex').substring(0, 8);
    const random = makeid(6);
    return `file_${hash}_${random}${extension}`;
}

// Generate API key
function generateApiKey(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Generate token
function generateToken(payload = {}) {
    const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64');
    const data = Buffer.from(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
        jti: generateUUID()
    })).toString('base64');
    
    const signature = crypto.createHmac('sha256', 'fana-aibot-secret')
        .update(`${header}.${data}`)
        .digest('base64');
    
    return `${header}.${data}.${signature}`;
}

// Generate pairing code
function generatePairingCode() {
    const code = makeNumericId(8);
    return code.match(/.{1,4}/g).join('-'); // Format: XXXX-XXXX
}

// Generate QR code data
function generateQRData(sessionId) {
    const timestamp = Date.now();
    const random = makeSecureId(16);
    return `fana-aibot:${sessionId}:${timestamp}:${random}`;
}

// Generate device ID
function generateDeviceId() {
    const platform = 'android';
    const version = '2.23.24.21';
    const random = makeHexId(16);
    return `${platform}_${version}_${random}`;
}

// Generate client ID
function generateClientId() {
    const timestamp = Date.now().toString(36);
    const random = makeSecureId(12);
    return `client_${timestamp}_${random}`;
}

// Generate webhook ID
function generateWebhookId(url) {
    const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
    const random = makeid(8);
    return `webhook_${hash}_${random}`;
}

// Generate backup ID
function generateBackupId() {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
    const random = makeid(6);
    return `backup_${date}_${time}_${random}`;
}

// Generate log ID
function generateLogId(level = 'info') {
    const timestamp = Date.now();
    const random = makeid(4);
    return `log_${level}_${timestamp}_${random}`;
}

// Generate error ID
function generateErrorId(error) {
    const errorHash = crypto.createHash('md5').update(error.message || error.toString()).digest('hex').substring(0, 8);
    const timestamp = Date.now();
    const random = makeid(4);
    return `error_${errorHash}_${timestamp}_${random}`;
}

// Generate temp ID
function generateTempId(prefix = 'temp') {
    const timestamp = Date.now();
    const random = makeid(8);
    return `${prefix}_${timestamp}_${random}`;
}

// Validate ID format
function validateId(id, type = 'general') {
    const patterns = {
        general: /^[a-zA-Z0-9_-]+$/,
        session: /^session_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/,
        message: /^msg_\d+_[a-zA-Z0-9]+$/,
        user: /^user_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/,
        group: /^group_[a-zA-Z0-9]+_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/,
        uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    };
    
    const pattern = patterns[type] || patterns.general;
    return pattern.test(id);
}

// ID storage class
class IdStorage {
    constructor() {
        this.storageFile = path.join(__dirname, 'data', 'ids.json');
        this.ids = new Map();
        this.loadIds();
    }

    async loadIds() {
        try {
            if (await fs.pathExists(this.storageFile)) {
                const data = await fs.readJson(this.storageFile);
                this.ids = new Map(Object.entries(data));
                console.log(chalk.green('✅ ID storage loaded'));
            }
        } catch (error) {
            console.error(chalk.red('❌ Error loading ID storage:'), error);
        }
    }

    async saveIds() {
        try {
            await fs.ensureDir(path.dirname(this.storageFile));
            const data = Object.fromEntries(this.ids);
            await fs.writeJson(this.storageFile, data, { spaces: 2 });
        } catch (error) {
            console.error(chalk.red('❌ Error saving ID storage:'), error);
        }
    }

    // Store ID with metadata
    storeId(id, type, metadata = {}) {
        this.ids.set(id, {
            type: type,
            created: Date.now(),
            metadata: metadata
        });
        this.saveIds();
    }

    // Get ID data
    getId(id) {
        return this.ids.get(id);
    }

    // Check if ID exists
    hasId(id) {
        return this.ids.has(id);
    }

    // Remove ID
    removeId(id) {
        const result = this.ids.delete(id);
        if (result) {
            this.saveIds();
        }
        return result;
    }

    // Get IDs by type
    getIdsByType(type) {
        const result = [];
        for (const [id, data] of this.ids.entries()) {
            if (data.type === type) {
                result.push({ id, ...data });
            }
        }
        return result;
    }

    // Clean expired IDs
    cleanExpiredIds(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
        const now = Date.now();
        let cleaned = 0;
        
        for (const [id, data] of this.ids.entries()) {
            if (now - data.created > maxAge) {
                this.ids.delete(id);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            this.saveIds();
            console.log(chalk.yellow(`🧹 Cleaned ${cleaned} expired IDs`));
        }
        
        return cleaned;
    }

    // Get storage stats
    getStats() {
        const stats = {
            total: this.ids.size,
            byType: {}
        };
        
        for (const [id, data] of this.ids.entries()) {
            stats.byType[data.type] = (stats.byType[data.type] || 0) + 1;
        }
        
        return stats;
    }
}

// Initialize ID storage
const idStorage = new IdStorage();

// Clean expired IDs every hour
setInterval(() => {
    idStorage.cleanExpiredIds();
}, 60 * 60 * 1000);

// ID utilities
const IdUtils = {
    // Generate unique ID with collision check
    generateUniqueId(type = 'general', length = 8) {
        let id;
        let attempts = 0;
        const maxAttempts = 100;
        
        do {
            switch (type) {
                case 'session':
                    id = generateSessionId();
                    break;
                case 'message':
                    id = generateMessageId();
                    break;
                case 'user':
                    id = generateUserId(makeid(10));
                    break;
                case 'group':
                    id = generateGroupId(makeid(6));
                    break;
                case 'uuid':
                    id = generateUUID();
                    break;
                default:
                    id = makeid(length);
            }
            attempts++;
        } while (idStorage.hasId(id) && attempts < maxAttempts);
        
        if (attempts >= maxAttempts) {
            throw new Error(`Failed to generate unique ID after ${maxAttempts} attempts`);
        }
        
        return id;
    },

    // Create and store ID
    createId(type, metadata = {}) {
        const id = this.generateUniqueId(type);
        idStorage.storeId(id, type, metadata);
        return id;
    },

    // Verify ID
    verifyId(id, type = null) {
        if (!idStorage.hasId(id)) {
            return { valid: false, reason: 'ID not found' };
        }
        
        const data = idStorage.getId(id);
        if (type && data.type !== type) {
            return { valid: false, reason: 'Type mismatch' };
        }
        
        return { valid: true, data: data };
    },

    // Generate short code
    generateShortCode(length = 6) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    // Generate hash from string
    generateHash(input, algorithm = 'md5', length = 8) {
        return crypto.createHash(algorithm).update(input).digest('hex').substring(0, length);
    },

    // Generate timestamp-based ID
    generateTimestampId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = makeid(4);
        return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
    },

    // Generate base64 ID
    generateBase64Id(length = 16) {
        return crypto.randomBytes(length).toString('base64')
            .replace(/[+/]/g, '')
            .substring(0, length);
    },

    // Generate phone-based ID
    generatePhoneId(phoneNumber) {
        const clean = phoneNumber.replace(/[^0-9]/g, '');
        const hash = this.generateHash(clean, 'sha256', 12);
        return `phone_${hash}`;
    },

    // Generate chat ID
    generateChatId(participants) {
        const sorted = participants.sort().join('');
        const hash = this.generateHash(sorted, 'md5', 16);
        return `chat_${hash}`;
    }
};

// Export all functions and classes
module.exports = {
    makeid,
    makeSecureId,
    makeNumericId,
    makeHexId,
    generateUUID,
    generateSessionId,
    generateMessageId,
    generateUserId,
    generateGroupId,
    generateCommandId,
    generateFileId,
    generateApiKey,
    generateToken,
    generatePairingCode,
    generateQRData,
    generateDeviceId,
    generateClientId,
    generateWebhookId,
    generateBackupId,
    generateLogId,
    generateErrorId,
    generateTempId,
    validateId,
    IdStorage,
    idStorage,
    IdUtils
};
