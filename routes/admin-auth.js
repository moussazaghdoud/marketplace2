const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { generateToken, adminAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/admin/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = generateToken({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        type: 'admin'
    });
    res.json({
        token,
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
    });
});

// GET /api/admin/me
router.get('/me', adminAuth, (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT id, email, firstName, lastName, role FROM admin_users WHERE id = ?').get(req.admin.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

// POST /api/admin/change-password
router.post('/change-password', adminAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords required' });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admin_users SET password = ?, updatedAt = datetime(?) WHERE id = ?')
        .run(hashed, new Date().toISOString(), req.admin.id);
    res.json({ success: true });
});

module.exports = router;
