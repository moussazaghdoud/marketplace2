const express = require('express');
const { getDb } = require('../db/connection');

const router = express.Router();

// GET /api/industries — list active industries
router.get('/', (req, res) => {
    const db = getDb();
    const industries = db.prepare('SELECT * FROM industries WHERE active = 1 ORDER BY sort_order ASC').all();
    res.json(industries);
});

// GET /api/industries/:slug — single industry with benefits, value props, related products
router.get('/:slug', (req, res) => {
    const db = getDb();
    const industry = db.prepare('SELECT * FROM industries WHERE slug = ? AND active = 1').get(req.params.slug);
    if (!industry) return res.status(404).json({ error: 'Industry not found' });

    const benefits = db.prepare('SELECT * FROM industry_benefits WHERE industryId = ? ORDER BY sort_order ASC').all(industry.id);
    const valueProps = db.prepare('SELECT * FROM industry_value_props WHERE industryId = ? ORDER BY sort_order ASC').all(industry.id);
    const products = db.prepare(`
        SELECT p.id, p.name, p.slug, p.shortDescription, p.gallery
        FROM industry_products ip
        JOIN products p ON p.id = ip.productId AND p.isActive = 1
        WHERE ip.industryId = ?
        ORDER BY ip.sort_order ASC
    `).all(industry.id);

    res.json({
        ...industry,
        benefits,
        valueProps,
        products: products.map(p => ({ ...p, gallery: JSON.parse(p.gallery || '[]') }))
    });
});

module.exports = router;
