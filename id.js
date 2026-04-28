function makeid(num = 4) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  
  for (let i = 0; i < num; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Generate pairing code (8 characters)
function generatePairingCode() {
  return makeid(4) + makeid(4); // 8 characters total
}

// Generate session ID (16 characters)
function generateSessionId() {
  return makeid(8) + '-' + makeid(8); // Format: XXXXXXXX-XXXXXXXX
}

// Simple ID storage for tracking
const idStorage = {
  sessions: new Map(),
  pairingCodes: new Map(),
  
  // Store session ID
  storeSession(sessionId, data) {
    this.sessions.set(sessionId, {
      ...data,
      timestamp: Date.now()
    });
  },
  
  // Get session data
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  },
  
  // Remove session
  removeSession(sessionId) {
    return this.sessions.delete(sessionId);
  },
  
  // Store pairing code
  storePairingCode(code, data) {
    this.pairingCodes.set(code, {
      ...data,
      timestamp: Date.now()
    });
  },
  
  // Get pairing code data
  getPairingCode(code) {
    return this.pairingCodes.get(code);
  },
  
  // Remove pairing code
  removePairingCode(code) {
    return this.pairingCodes.delete(code);
  },
  
  // Clean expired entries (older than 5 minutes)
  cleanup() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    // Clean sessions
    for (const [id, data] of this.sessions.entries()) {
      if (now - data.timestamp > maxAge) {
        this.sessions.delete(id);
      }
    }
    
    // Clean pairing codes
    for (const [code, data] of this.pairingCodes.entries()) {
      if (now - data.timestamp > maxAge) {
        this.pairingCodes.delete(code);
      }
    }
  },
  
  // Get all active sessions
  getActiveSessions() {
    return Array.from(this.sessions.entries()).map(([id, data]) => ({
      sessionId: id,
      ...data
    }));
  },
  
  // Get all active pairing codes
  getActivePairingCodes() {
    return Array.from(this.pairingCodes.entries()).map(([code, data]) => ({
      code: code,
      ...data
    }));
  }
};

// Auto cleanup every minute
setInterval(() => {
  idStorage.cleanup();
}, 60 * 1000);

// Export all functions
module.exports = {
  makeid,
  generatePairingCode,
  generateSessionId,
  idStorage
};
