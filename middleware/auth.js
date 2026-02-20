const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required. Set it before starting the server.');
    process.exit(1);
}
const JWT_EXPIRES_IN = '24h';

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

// M2: Token blacklist helpers
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function isTokenBlacklisted(db, token) {
    const hash = hashToken(token);
    const row = db.prepare('SELECT 1 FROM token_blacklist WHERE tokenHash = ?').get(hash);
    return !!row;
}

function blacklistToken(db, token) {
    try {
        const decoded = jwt.decode(token);
        const exp = decoded && decoded.exp ? new Date(decoded.exp * 1000).toISOString() : new Date(Date.now() + 86400000).toISOString();
        const hash = hashToken(token);
        db.prepare('INSERT OR IGNORE INTO token_blacklist (tokenHash, expiresAt) VALUES (?, ?)').run(hash, exp);
    } catch (e) { /* silent */ }
}

function cleanupBlacklist(db) {
    try {
        db.prepare("DELETE FROM token_blacklist WHERE expiresAt < datetime('now')").run();
    } catch (e) { /* silent */ }
}

// M1: Password policy validation
function validatePassword(password) {
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
    if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one special character.';
    return null;
}

function adminAuth(req, res, next) {
    const bearerToken = req.headers.authorization?.replace('Bearer ', '');
    const cookieToken = req.cookies?.adminToken;
    const token = bearerToken || cookieToken;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    // M3: CSRF — if auth came from cookie (not Bearer header), check Origin
    if (!bearerToken && cookieToken) {
        const origin = req.headers.origin || req.headers.referer;
        if (origin && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
            const host = req.headers.host;
            try {
                const originHost = new URL(origin).host;
                if (originHost !== host) {
                    return res.status(403).json({ error: 'Cross-origin request blocked' });
                }
            } catch (e) {
                return res.status(403).json({ error: 'Invalid origin' });
            }
        }
    }
    try {
        // M2: Check blacklist
        const { getDb } = require('../db/connection');
        const db = getDb();
        if (isTokenBlacklisted(db, token)) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }
        const decoded = verifyToken(token);
        if (decoded.type !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.admin = decoded;
        req._authToken = token;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function clientAuth(req, res, next) {
    const bearerToken = req.headers.authorization?.replace('Bearer ', '');
    const cookieToken = req.cookies?.clientToken;
    const token = bearerToken || cookieToken;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    // M3: CSRF — if auth came from cookie, check Origin
    if (!bearerToken && cookieToken) {
        const origin = req.headers.origin || req.headers.referer;
        if (origin && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
            const host = req.headers.host;
            try {
                const originHost = new URL(origin).host;
                if (originHost !== host) {
                    return res.status(403).json({ error: 'Cross-origin request blocked' });
                }
            } catch (e) {
                return res.status(403).json({ error: 'Invalid origin' });
            }
        }
    }
    try {
        // M2: Check blacklist
        const { getDb } = require('../db/connection');
        const db = getDb();
        if (isTokenBlacklisted(db, token)) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }
        const decoded = verifyToken(token);
        if (decoded.type !== 'client') {
            return res.status(403).json({ error: 'Client access required' });
        }
        req.client = decoded;
        req._authToken = token;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { generateToken, verifyToken, adminAuth, clientAuth, blacklistToken, cleanupBlacklist, validatePassword, JWT_SECRET };
