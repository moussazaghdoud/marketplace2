const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');

const router = express.Router();

// POST /api/contact
router.post('/', (req, res) => {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email and message required' });
    }
    const db = getDb();
    const id = uuidv4();
    db.prepare('INSERT INTO contact_submissions (id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)')
        .run(id, name, email, subject || '', message);
    res.json({ success: true, id });
});

// GET /api/products/:slug - Public product detail
router.get('/products/:slug', (req, res) => {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE slug = ? AND isActive = 1').get(req.params.slug);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({
        ...product,
        plans: JSON.parse(product.plans || '{}'),
        benefits: JSON.parse(product.benefits || '[]'),
        gallery: JSON.parse(product.gallery || '[]')
    });
});

module.exports = router;
