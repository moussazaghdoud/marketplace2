const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_PATH = path.join(__dirname, 'data', 'content.json');

app.use(express.json());
app.use(express.static(__dirname, { index: false }));

// Public marketplace
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Get content
app.get('/api/content', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read content' });
    }
});

// Save content
app.post('/api/content', (req, res) => {
    try {
        const data = JSON.stringify(req.body, null, 2);
        fs.writeFileSync(CONTENT_PATH, data, 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save content' });
    }
});

app.listen(PORT, () => {
    console.log(`Rainbow Portal running at http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
