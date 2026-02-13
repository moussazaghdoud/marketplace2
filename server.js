require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { v4: uuidv4 } = require('uuid');

// Database initialization
const { seed } = require('./db/seed');
seed();
const { getDb } = require('./db/connection');

// Auth middleware
const { adminAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_PATH = path.join(__dirname, 'data', 'content.json');

// Rainbow config
const RAINBOW_DOMAIN = process.env.RAINBOW_DOMAIN || 'https://sandbox.openrainbow.com';
const RAINBOW_APP_ID = process.env.RAINBOW_APP_ID || '';
const RAINBOW_APP_SECRET = process.env.RAINBOW_APP_SECRET || '';
const RAINBOW_CLIENT_VERSION = process.env.RAINBOW_CLIENT_VERSION || '2.165.11';

// --- Stripe Webhook (raw body — must come BEFORE express.json) ---
app.use('/api/webhooks/stripe', require('./routes/stripe-webhooks'));

// --- Rainbow API proxy ---
app.use('/api/rainbow', express.json());

app.use('/api/rainbow', createProxyMiddleware({
    target: RAINBOW_DOMAIN,
    changeOrigin: true,
    secure: true,
    pathRewrite: function (path) { return '/api/rainbow' + path; },
    on: {
        proxyReq: function (proxyReq, req) {
            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-host');
            proxyReq.removeHeader('x-forwarded-proto');
            proxyReq.removeHeader('x-forwarded-port');

            proxyReq.setHeader('x-rainbow-client', 'web_win');
            proxyReq.setHeader('x-rainbow-client-version', RAINBOW_CLIENT_VERSION);

            var password = '';
            if (req.url.match(/\/authentication\/.*\/login/)) {
                var authHeader = req.headers['authorization'] || '';
                if (authHeader.startsWith('Basic ')) {
                    try {
                        var decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
                        var colonIdx = decoded.indexOf(':');
                        if (colonIdx > -1) password = decoded.substring(colonIdx + 1);
                    } catch (e) {
                        console.error('Rainbow auth header error:', e.message);
                    }
                }
            } else if (req.url.match(/self-register/) && req.body && req.body.password) {
                password = req.body.password;
            }

            if (password && RAINBOW_APP_ID && RAINBOW_APP_SECRET) {
                var hash = crypto.createHash('sha256')
                    .update(RAINBOW_APP_SECRET + password)
                    .digest('hex')
                    .toUpperCase();
                var appAuth = Buffer.from(RAINBOW_APP_ID + ':' + hash).toString('base64');
                proxyReq.setHeader('x-rainbow-app-auth', 'Basic ' + appAuth);
            }

            if (req.body && Object.keys(req.body).length > 0) {
                var bodyData = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
        }
    }
}));

// --- Global middleware ---
app.use(express.json());
app.use(cookieParser());

// Request logging
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.path}`);
    }
    next();
});

// Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'images'));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, base + '-' + Date.now() + ext);
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Static files
app.use(express.static(__dirname, { index: false }));

// ===================== PAGE ROUTES =====================

// Public pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'client-login.html')));
app.get('/portal', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'client-portal.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'blog.html')));
app.get('/blog/:slug', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'blog-article.html')));
app.get('/reviews', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'reviews.html')));
app.get('/support', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'support.html')));
app.get('/tutorials', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'tutorials.html')));
app.get('/product/:slug', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'product.html')));

// ===================== API ROUTES =====================

// --- Auth routes ---
app.use('/api/admin', require('./routes/admin-auth'));
app.use('/api/client', require('./routes/client-auth'));

// --- Admin CRUD routes ---
app.use('/api/admin/users', require('./routes/admin-users'));
app.use('/api/admin/clients', require('./routes/admin-clients'));
app.use('/api/admin/products', require('./routes/admin-products'));
app.use('/api/admin/subscriptions', require('./routes/admin-subscriptions'));
app.use('/api/admin/blog', require('./routes/admin-blog'));

// Admin audit log
app.get('/api/admin/audit-log', adminAuth, (req, res) => {
    const db = getDb();
    const { limit } = req.query;
    const logs = db.prepare('SELECT * FROM audit_log ORDER BY createdAt DESC LIMIT ?').all(parseInt(limit) || 100);
    res.json(logs);
});

// Admin email log
app.get('/api/admin/email-log', adminAuth, (req, res) => {
    const db = getDb();
    const logs = db.prepare('SELECT * FROM email_log ORDER BY createdAt DESC LIMIT 100').all();
    res.json(logs);
});

// --- Client portal routes ---
app.use('/api/client/subscriptions', require('./routes/client-subscriptions'));
app.use('/api/client/payment-methods', require('./routes/client-payment'));
app.get('/api/client/invoices', require('./routes/client-payment'));

// --- Public API routes ---
app.use('/api/blog', require('./routes/public-blog'));
app.use('/api/reviews', require('./routes/public-reviews'));
app.use('/api/contact', require('./routes/public-contact'));

// Public product detail
app.get('/api/products/:slug', (req, res) => {
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

// --- Content management (JSON file) ---
app.get('/api/content', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read content' });
    }
});

app.post('/api/content', adminAuth, (req, res) => {
    try {
        const data = JSON.stringify(req.body, null, 2);
        fs.writeFileSync(CONTENT_PATH, data, 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save content' });
    }
});

// --- Image upload ---
app.post('/api/upload', adminAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const relativePath = 'images/' + req.file.filename;
    res.json({ success: true, path: relativePath });
});

// --- Stripe endpoints (legacy — kept for homepage checkout) ---
app.get('/api/stripe-key', (req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

app.post('/api/create-subscription', async (req, res) => {
    const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
    }

    const { email, planKey, licenseCount } = req.body;
    if (!email || !planKey || !licenseCount) {
        return res.status(400).json({ error: 'Missing required fields: email, planKey, licenseCount' });
    }

    // Get price from DB product
    const db = getDb();
    const product = db.prepare("SELECT plans FROM products WHERE slug = 'rainbow'").get();
    let priceId = null;
    if (product) {
        const plans = JSON.parse(product.plans || '{}');
        const plan = plans[planKey];
        if (plan?.stripePriceId) priceId = plan.stripePriceId;
    }
    // Fallback to env
    if (!priceId) {
        const PLAN_PRICES = {
            'business': process.env.STRIPE_PRICE_BUSINESS || 'price_REPLACE_ME_BUSINESS',
            'enterprise': process.env.STRIPE_PRICE_ENTERPRISE || 'price_REPLACE_ME_ENTERPRISE'
        };
        priceId = PLAN_PRICES[planKey];
    }

    if (!priceId || priceId.startsWith('price_REPLACE_ME')) {
        return res.status(400).json({ error: 'Invalid plan or Stripe Price ID not configured.' });
    }

    try {
        const customer = await stripe.customers.create({ email });
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId, quantity: licenseCount }],
            payment_behavior: 'default_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.payment_intent']
        });
        res.json({
            subscriptionId: subscription.id,
            clientSecret: subscription.latest_invoice.payment_intent.client_secret
        });
    } catch (err) {
        console.error('Stripe error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

// ===================== AUDIT LOGGING HELPER =====================

function logAudit(userId, userType, action, details, ipAddress) {
    try {
        const db = getDb();
        db.prepare('INSERT INTO audit_log (id, userId, userType, action, details, ipAddress) VALUES (?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), userId, userType, action, typeof details === 'string' ? details : JSON.stringify(details), ipAddress);
    } catch (e) { /* silent */ }
}
app.locals.logAudit = logAudit;

// ===================== ERROR HANDLER =====================

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ===================== START =====================

app.listen(PORT, () => {
    console.log(`Rainbow Portal running at http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
    console.log(`Client portal: http://localhost:${PORT}/portal`);
    console.log(`Blog: http://localhost:${PORT}/blog`);
    console.log(`Rainbow APP_ID: ${RAINBOW_APP_ID ? RAINBOW_APP_ID.slice(0, 6) + '...' : 'NOT SET'}`);
    console.log(`Stripe: ${process.env.STRIPE_SECRET_KEY ? 'configured' : 'NOT SET'}`);
});
