const express = require('express');
const { getDb } = require('../db/connection');

const router = express.Router();

// GET /api/blog/articles - Published articles
router.get('/articles', (req, res) => {
    const db = getDb();
    const { category, limit } = req.query;
    let sql = `
        SELECT a.id, a.title, a.slug, a.excerpt, a.coverImage, a.publishedAt, a.createdAt,
               c.name as categoryName, c.slug as categorySlug
        FROM blog_articles a
        LEFT JOIN blog_categories c ON a.categoryId = c.id
        WHERE a.status = 'published'
    `;
    const params = [];
    if (category) { sql += ' AND c.slug = ?'; params.push(category); }
    sql += ' ORDER BY a.publishedAt DESC';
    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

    res.json(db.prepare(sql).all(...params));
});

// GET /api/blog/articles/:slug
router.get('/articles/:slug', (req, res) => {
    const db = getDb();
    const article = db.prepare(`
        SELECT a.*, c.name as categoryName, c.slug as categorySlug
        FROM blog_articles a
        LEFT JOIN blog_categories c ON a.categoryId = c.id
        WHERE a.slug = ? AND a.status = 'published'
    `).get(req.params.slug);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
});

// GET /api/blog/categories
router.get('/categories', (req, res) => {
    const db = getDb();
    const categories = db.prepare(`
        SELECT c.*, COUNT(a.id) as articleCount
        FROM blog_categories c
        LEFT JOIN blog_articles a ON a.categoryId = c.id AND a.status = 'published'
        GROUP BY c.id
        ORDER BY c.name
    `).all();
    res.json(categories);
});

module.exports = router;
