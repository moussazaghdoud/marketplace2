const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/solutions
router.get('/', (req, res) => {
    const db = getDb();
    const solutions = db.prepare('SELECT * FROM solutions ORDER BY sort_order ASC').all();
    res.json(solutions);
});

// POST /api/admin/solutions
router.post('/', (req, res) => {
    const { name, slug, description, category, icon, linkUrl, sort_order } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM solutions WHERE slug = ?').get(slug);
    if (existing) return res.status(409).json({ error: 'Slug already exists' });

    const id = uuidv4();
    db.prepare('INSERT INTO solutions (id, slug, name, description, category, icon, linkUrl, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, slug, name, description || '', category || '', icon || '', linkUrl || '', sort_order || 0);
    res.json({ id });
});

// PUT /api/admin/solutions/:id
router.put('/:id', (req, res) => {
    const { name, slug, description, category, icon, linkUrl, sort_order, active } = req.body;
    const db = getDb();
    db.prepare('UPDATE solutions SET name=?, slug=?, description=?, category=?, icon=?, linkUrl=?, sort_order=?, active=?, updatedAt=datetime(?) WHERE id=?')
        .run(name, slug, description || '', category || '', icon || '', linkUrl || '', sort_order || 0, active !== undefined ? active : 1, new Date().toISOString(), req.params.id);
    res.json({ success: true });
});

// DELETE /api/admin/solutions/:id
router.delete('/:id', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM solutions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
