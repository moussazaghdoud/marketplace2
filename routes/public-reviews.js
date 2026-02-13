const express = require('express');
const { getDb } = require('../db/connection');

const router = express.Router();

// GET /api/reviews - Approved reviews
router.get('/', (req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT id, authorName, authorCompany, authorAvatar, rating, content, createdAt FROM reviews WHERE isApproved = 1 ORDER BY createdAt DESC').all());
});

module.exports = router;
