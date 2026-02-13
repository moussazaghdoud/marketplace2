const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/products
router.get('/', (req, res) => {
    const db = getDb();
    const products = db.prepare('SELECT * FROM products ORDER BY createdAt DESC').all();
    res.json(products.map(p => ({
        ...p,
        plans: JSON.parse(p.plans || '{}'),
        benefits: JSON.parse(p.benefits || '[]'),
        gallery: JSON.parse(p.gallery || '[]')
    })));
});

// GET /api/admin/products/:id
router.get('/:id', (req, res) => {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({
        ...product,
        plans: JSON.parse(product.plans || '{}'),
        benefits: JSON.parse(product.benefits || '[]'),
        gallery: JSON.parse(product.gallery || '[]')
    });
});

// POST /api/admin/products
router.post('/', (req, res) => {
    const { name, slug, shortDescription, fullDescription, benefits, gallery, plans } = req.body;
    if (!name || !slug || !plans) return res.status(400).json({ error: 'Name, slug and plans required' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
    if (existing) return res.status(409).json({ error: 'Slug already exists' });

    const id = uuidv4();
    db.prepare(`
        INSERT INTO products (id, name, slug, shortDescription, fullDescription, benefits, gallery, plans)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, slug, shortDescription || '', fullDescription || '', JSON.stringify(benefits || []), JSON.stringify(gallery || []), JSON.stringify(plans));
    res.json({ id });
});

// PUT /api/admin/products/:id
router.put('/:id', (req, res) => {
    const { name, slug, shortDescription, fullDescription, benefits, gallery, plans, isActive } = req.body;
    const db = getDb();
    db.prepare(`
        UPDATE products SET name = ?, slug = ?, shortDescription = ?, fullDescription = ?, benefits = ?, gallery = ?, plans = ?, isActive = ?, updatedAt = datetime(?)
        WHERE id = ?
    `).run(name, slug, shortDescription || '', fullDescription || '', JSON.stringify(benefits || []), JSON.stringify(gallery || []), JSON.stringify(plans), isActive !== undefined ? isActive : 1, new Date().toISOString(), req.params.id);
    res.json({ success: true });
});

// DELETE /api/admin/products/:id
router.delete('/:id', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
