const express = require('express');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
const { getDb } = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

// M4: Sanitize blog HTML — allow safe tags, strip scripts/iframes/event handlers
const SANITIZE_OPTIONS = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'figure', 'figcaption', 'video', 'source', 'picture']),
    allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'width', 'height', 'class', 'loading'],
        a: ['href', 'target', 'rel', 'class'],
        '*': ['class', 'id', 'style']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard'
};

const router = express.Router();
router.use(adminAuth);

// --- Categories ---

// GET /api/admin/blog/categories
router.get('/categories', (req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM blog_categories ORDER BY name').all());
});

// POST /api/admin/blog/categories
router.post('/categories', (req, res) => {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
    const db = getDb();
    const id = uuidv4();
    db.prepare('INSERT INTO blog_categories (id, name, slug) VALUES (?, ?, ?)').run(id, name, slug);
    res.json({ id, name, slug });
});

// PUT /api/admin/blog/categories/:id
router.put('/categories/:id', (req, res) => {
    const { name, slug } = req.body;
    const db = getDb();
    db.prepare('UPDATE blog_categories SET name = ?, slug = ? WHERE id = ?').run(name, slug, req.params.id);
    res.json({ success: true });
});

// DELETE /api/admin/blog/categories/:id
router.delete('/categories/:id', (req, res) => {
    const db = getDb();
    db.prepare('UPDATE blog_articles SET categoryId = NULL WHERE categoryId = ?').run(req.params.id);
    db.prepare('DELETE FROM blog_categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Articles ---

// GET /api/admin/blog/articles
router.get('/articles', (req, res) => {
    const db = getDb();
    const articles = db.prepare(`
        SELECT a.*, c.name as categoryName
        FROM blog_articles a
        LEFT JOIN blog_categories c ON a.categoryId = c.id
        ORDER BY a.createdAt DESC
    `).all();
    res.json(articles);
});

// GET /api/admin/blog/articles/:id
router.get('/articles/:id', (req, res) => {
    const db = getDb();
    const article = db.prepare(`
        SELECT a.*, c.name as categoryName
        FROM blog_articles a
        LEFT JOIN blog_categories c ON a.categoryId = c.id
        WHERE a.id = ?
    `).get(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
});

// POST /api/admin/blog/articles
router.post('/articles', (req, res) => {
    const { title, slug, excerpt, coverImage, categoryId, status } = req.body;
    let { content } = req.body;
    if (!title || !slug) return res.status(400).json({ error: 'Title and slug required' });
    // M4: Sanitize HTML content
    content = content ? sanitizeHtml(content, SANITIZE_OPTIONS) : '';
    const db = getDb();
    const id = uuidv4();
    const publishedAt = status === 'published' ? new Date().toISOString() : null;
    db.prepare(`
        INSERT INTO blog_articles (id, title, slug, excerpt, content, coverImage, categoryId, authorId, status, publishedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, slug, excerpt || '', content, coverImage || '', categoryId || null, req.admin.id, status || 'draft', publishedAt);
    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.admin.id, 'admin', 'blog_article_created', { id, title, slug }, req.ip);
    res.json({ id });
});

// PUT /api/admin/blog/articles/:id
router.put('/articles/:id', (req, res) => {
    const { title, slug, excerpt, coverImage, categoryId, status } = req.body;
    let { content } = req.body;
    // M4: Sanitize HTML content
    content = content ? sanitizeHtml(content, SANITIZE_OPTIONS) : '';
    const db = getDb();
    const existing = db.prepare('SELECT status FROM blog_articles WHERE id = ?').get(req.params.id);
    const publishedAt = (status === 'published' && existing?.status !== 'published') ? new Date().toISOString() : undefined;

    let sql = 'UPDATE blog_articles SET title = ?, slug = ?, excerpt = ?, content = ?, coverImage = ?, categoryId = ?, status = ?, updatedAt = datetime(?)';
    const params = [title, slug, excerpt || '', content, coverImage || '', categoryId || null, status || 'draft', new Date().toISOString()];

    if (publishedAt) {
        sql += ', publishedAt = ?';
        params.push(publishedAt);
    }
    sql += ' WHERE id = ?';
    params.push(req.params.id);

    db.prepare(sql).run(...params);
    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.admin.id, 'admin', 'blog_article_updated', { id: req.params.id, title }, req.ip);
    res.json({ success: true });
});

// DELETE /api/admin/blog/articles/:id
router.delete('/articles/:id', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM blog_articles WHERE id = ?').run(req.params.id);
    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.admin.id, 'admin', 'blog_article_deleted', { id: req.params.id }, req.ip);
    res.json({ success: true });
});

// --- Reviews ---

// GET /api/admin/reviews
router.get('/reviews', (req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM reviews ORDER BY createdAt DESC').all());
});

// POST /api/admin/reviews
router.post('/reviews', (req, res) => {
    const { authorName, authorCompany, authorAvatar, rating, content } = req.body;
    if (!authorName || !rating || !content) return res.status(400).json({ error: 'Author, rating and content required' });
    const db = getDb();
    const id = uuidv4();
    db.prepare('INSERT INTO reviews (id, authorName, authorCompany, authorAvatar, rating, content, isApproved) VALUES (?, ?, ?, ?, ?, ?, 1)')
        .run(id, authorName, authorCompany || '', authorAvatar || '', rating, content);
    res.json({ id });
});

// PUT /api/admin/reviews/:id
router.put('/reviews/:id', (req, res) => {
    const { authorName, authorCompany, authorAvatar, rating, content, isApproved } = req.body;
    const db = getDb();
    db.prepare('UPDATE reviews SET authorName = ?, authorCompany = ?, authorAvatar = ?, rating = ?, content = ?, isApproved = ? WHERE id = ?')
        .run(authorName, authorCompany || '', authorAvatar || '', rating, content, isApproved ? 1 : 0, req.params.id);
    res.json({ success: true });
});

// DELETE /api/admin/reviews/:id
router.delete('/reviews/:id', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Contact Submissions ---

// GET /api/admin/contacts
router.get('/contacts', (req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM contact_submissions ORDER BY createdAt DESC').all());
});

// PUT /api/admin/contacts/:id
router.put('/contacts/:id', (req, res) => {
    const { status, adminNotes } = req.body;
    const db = getDb();
    db.prepare('UPDATE contact_submissions SET status = ?, adminNotes = ?, updatedAt = datetime(?) WHERE id = ?')
        .run(status, adminNotes || '', new Date().toISOString(), req.params.id);
    res.json({ success: true });
});

// DELETE /api/admin/contacts/:id
router.delete('/contacts/:id', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM contact_submissions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
