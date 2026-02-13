const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'rainbow-portal-secret-change-me';
const JWT_EXPIRES_IN = '24h';

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

function adminAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.adminToken;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = verifyToken(token);
        if (decoded.type !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function clientAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.clientToken;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = verifyToken(token);
        if (decoded.type !== 'client') {
            return res.status(403).json({ error: 'Client access required' });
        }
        req.client = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { generateToken, verifyToken, adminAuth, clientAuth, JWT_SECRET };
