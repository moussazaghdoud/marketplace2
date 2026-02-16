const express = require('express');
const fs = require('fs');
const path = require('path');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

const SUPPORTED_LANGS = ['en', 'fr', 'es', 'it', 'de'];
const I18N_DIR = path.join(__dirname, '..', 'i18n');

// GET /api/admin/i18n — list available languages
router.get('/', adminAuth, (req, res) => {
    res.json({ languages: SUPPORTED_LANGS });
});

// GET /api/admin/i18n/:lang — get full translation JSON for a language
router.get('/:lang', adminAuth, (req, res) => {
    const lang = req.params.lang;
    if (!SUPPORTED_LANGS.includes(lang)) {
        return res.status(400).json({ error: 'Unsupported language: ' + lang });
    }
    try {
        const filePath = path.join(I18N_DIR, lang + '.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read language file' });
    }
});

// PUT /api/admin/i18n/:lang — save full translation JSON for a language
router.put('/:lang', adminAuth, (req, res) => {
    const lang = req.params.lang;
    if (!SUPPORTED_LANGS.includes(lang)) {
        return res.status(400).json({ error: 'Unsupported language: ' + lang });
    }
    try {
        const filePath = path.join(I18N_DIR, lang + '.json');
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf8');

        // Clear server-side i18n caches
        const clearFn = req.app.locals.clearI18nCache;
        if (typeof clearFn === 'function') clearFn();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save language file' });
    }
});

module.exports = router;
