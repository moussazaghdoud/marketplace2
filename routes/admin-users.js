const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/users
router.get('/', (req, res) => {
    const db = getDb();
    const users = db.prepare('SELECT id, email, firstName, lastName, role, createdAt FROM admin_users ORDER BY createdAt DESC').all();
    res.json(users);
});

// POST /api/admin/users
router.post('/', (req, res) => {
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'All fields required' });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const id = uuidv4();
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO admin_users (id, email, password, firstName, lastName, role) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, email, hashed, firstName, lastName, role || 'admin');
    res.json({ id, email, firstName, lastName, role: role || 'admin' });
});

// PUT /api/admin/users/:id
router.put('/:id', (req, res) => {
    const { email, firstName, lastName, role, password } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (password) {
        const hashed = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE admin_users SET email = ?, firstName = ?, lastName = ?, role = ?, password = ?, updatedAt = datetime(?) WHERE id = ?')
            .run(email, firstName, lastName, role, hashed, new Date().toISOString(), req.params.id);
    } else {
        db.prepare('UPDATE admin_users SET email = ?, firstName = ?, lastName = ?, role = ?, updatedAt = datetime(?) WHERE id = ?')
            .run(email, firstName, lastName, role, new Date().toISOString(), req.params.id);
    }
    res.json({ success: true });
});

// DELETE /api/admin/users/:id
router.delete('/:id', (req, res) => {
    if (req.params.id === req.admin.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const db = getDb();
    db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
