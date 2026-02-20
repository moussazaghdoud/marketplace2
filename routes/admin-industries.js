const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/industries
router.get('/', (req, res) => {
    const db = getDb();
    const industries = db.prepare('SELECT * FROM industries ORDER BY sort_order ASC').all();
    res.json(industries);
});

// GET /api/admin/industries/:id
router.get('/:id', (req, res) => {
    const db = getDb();
    const industry = db.prepare('SELECT * FROM industries WHERE id = ?').get(req.params.id);
    if (!industry) return res.status(404).json({ error: 'Industry not found' });

    const benefits = db.prepare('SELECT * FROM industry_benefits WHERE industryId = ? ORDER BY sort_order ASC').all(industry.id);
    const valueProps = db.prepare('SELECT * FROM industry_value_props WHERE industryId = ? ORDER BY sort_order ASC').all(industry.id);
    const productLinks = db.prepare('SELECT productId, sort_order FROM industry_products WHERE industryId = ? ORDER BY sort_order ASC').all(industry.id);

    res.json({ ...industry, benefits, valueProps, productIds: productLinks.map(p => p.productId) });
});

// POST /api/admin/industries
router.post('/', (req, res) => {
    const { name, slug, tagline, description, heroImage, icon, color, sort_order, benefits, valueProps, productIds } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM industries WHERE slug = ?').get(slug);
    if (existing) return res.status(409).json({ error: 'Slug already exists' });

    const id = uuidv4();
    db.prepare('INSERT INTO industries (id, slug, name, tagline, description, heroImage, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, slug, name, tagline || '', description || '', heroImage || '', icon || '', color || '', sort_order || 0);

    saveNested(db, id, benefits, valueProps, productIds);
    res.json({ id });
});

// PUT /api/admin/industries/:id
router.put('/:id', (req, res) => {
    const { name, slug, tagline, description, heroImage, icon, color, sort_order, active, benefits, valueProps, productIds } = req.body;
    const db = getDb();

    db.prepare('UPDATE industries SET name=?, slug=?, tagline=?, description=?, heroImage=?, icon=?, color=?, sort_order=?, active=?, updatedAt=datetime(?) WHERE id=?')
        .run(name, slug, tagline || '', description || '', heroImage || '', icon || '', color || '', sort_order || 0, active !== undefined ? active : 1, new Date().toISOString(), req.params.id);

    saveNested(db, req.params.id, benefits, valueProps, productIds);
    res.json({ success: true });
});

// DELETE /api/admin/industries/:id
router.delete('/:id', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM industry_benefits WHERE industryId = ?').run(req.params.id);
    db.prepare('DELETE FROM industry_value_props WHERE industryId = ?').run(req.params.id);
    db.prepare('DELETE FROM industry_products WHERE industryId = ?').run(req.params.id);
    db.prepare('DELETE FROM industries WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

function saveNested(db, industryId, benefits, valueProps, productIds) {
    // Replace benefits
    if (Array.isArray(benefits)) {
        db.prepare('DELETE FROM industry_benefits WHERE industryId = ?').run(industryId);
        const stmt = db.prepare('INSERT INTO industry_benefits (id, industryId, category, title, description, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
        benefits.forEach((b, i) => {
            stmt.run(uuidv4(), industryId, b.category || '', b.title || '', b.description || '', b.icon || '', i + 1);
        });
    }
    // Replace value props
    if (Array.isArray(valueProps)) {
        db.prepare('DELETE FROM industry_value_props WHERE industryId = ?').run(industryId);
        const stmt = db.prepare('INSERT INTO industry_value_props (id, industryId, text, sort_order) VALUES (?, ?, ?, ?)');
        valueProps.forEach((v, i) => {
            const text = typeof v === 'string' ? v : v.text;
            stmt.run(uuidv4(), industryId, text || '', i + 1);
        });
    }
    // Replace product links
    if (Array.isArray(productIds)) {
        db.prepare('DELETE FROM industry_products WHERE industryId = ?').run(industryId);
        const stmt = db.prepare('INSERT INTO industry_products (industryId, productId, sort_order) VALUES (?, ?, ?)');
        productIds.forEach((pid, i) => {
            stmt.run(industryId, pid, i + 1);
        });
    }
}

module.exports = router;
