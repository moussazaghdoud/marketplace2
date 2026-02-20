const express = require('express');
const { getDb } = require('../db/connection');

const router = express.Router();

// GET /api/solutions — all active solutions, grouped by category
router.get('/', (req, res) => {
    const db = getDb();
    const solutions = db.prepare('SELECT * FROM solutions WHERE active = 1 ORDER BY sort_order ASC').all();

    // Group by category
    const grouped = {};
    for (const s of solutions) {
        const cat = s.category || 'Other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(s);
    }

    res.json({ solutions, categories: grouped });
});

module.exports = router;
