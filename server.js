require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { v4: uuidv4 } = require('uuid');

// ===================== PERSISTENT VOLUME =====================
// On Railway, /data is a persistent volume. We copy default files there
// on first deploy, then use /data as the source of truth for all mutable data.
let VOLUME_PATH = '';
try {
    VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATABASE_PATH || '';
    if (!VOLUME_PATH && fs.existsSync('/data') && fs.statSync('/data').isDirectory()) {
        VOLUME_PATH = '/data';
    }
} catch (e) {
    console.log('[Volume] Detection error:', e.message);
}

const DATA_DIR = VOLUME_PATH ? path.join(VOLUME_PATH, 'db') : path.join(__dirname, 'data');
const I18N_DIR = VOLUME_PATH ? path.join(VOLUME_PATH, 'i18n') : path.join(__dirname, 'i18n');
const IMAGES_DIR = VOLUME_PATH ? path.join(VOLUME_PATH, 'images') : path.join(__dirname, 'images');

console.log('[Volume] VOLUME_PATH=' + JSON.stringify(VOLUME_PATH) + ' DATA_DIR=' + DATA_DIR + ' I18N_DIR=' + I18N_DIR);

try {
    if (VOLUME_PATH) {
        // Ensure directories exist
        [DATA_DIR, I18N_DIR, IMAGES_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        // Copy default data files if not yet present on volume
        const srcData = path.join(__dirname, 'data');
        if (fs.existsSync(srcData)) {
            fs.readdirSync(srcData).forEach(f => {
                if (f.endsWith('.json')) {
                    const dest = path.join(DATA_DIR, f);
                    if (!fs.existsSync(dest)) {
                        fs.copyFileSync(path.join(srcData, f), dest);
                        console.log('[Volume] Copied', f);
                    }
                }
            });
        }

        // Copy default i18n files if not yet present on volume
        const srcI18n = path.join(__dirname, 'i18n');
        if (fs.existsSync(srcI18n)) {
            fs.readdirSync(srcI18n).forEach(f => {
                if (f.endsWith('.json')) {
                    const dest = path.join(I18N_DIR, f);
                    if (!fs.existsSync(dest)) {
                        fs.copyFileSync(path.join(srcI18n, f), dest);
                        console.log('[Volume] Copied', f);
                    }
                }
            });
        }
        console.log('[Volume] Bootstrap complete');
    }
} catch (e) {
    console.error('[Volume] Bootstrap error:', e.message);
}

// Export paths for other modules
process.env._DATA_DIR = DATA_DIR;
process.env._I18N_DIR = I18N_DIR;

// Database initialization
const { seed } = require('./db/seed');
seed();
const { getDb } = require('./db/connection');

// Auth middleware
const { adminAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_PATH = path.join(DATA_DIR, 'content.json');

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
        cb(null, IMAGES_DIR);
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
// Serve uploaded images from persistent volume (overrides local /images)
if (VOLUME_PATH) {
    app.use('/images', express.static(IMAGES_DIR));
}

// ===================== SERVER-SIDE I18N =====================

const SUPPORTED_LANGS = ['en', 'fr', 'es', 'it', 'de'];
const i18nFileCache = {};
const translatedPageCache = {};

function loadI18nFile(lang) {
    if (i18nFileCache[lang]) return i18nFileCache[lang];
    try {
        const data = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lang + '.json'), 'utf8'));
        i18nFileCache[lang] = data;
        return data;
    } catch (e) { return null; }
}

function i18nGetKey(obj, key) {
    const parts = key.split('.');
    let val = obj;
    for (const part of parts) {
        if (val == null) return undefined;
        val = val[part];
    }
    return val;
}

function translateHTML(html, lang) {
    const tr = loadI18nFile(lang);
    const en = loadI18nFile('en');
    if (!tr) return html;

    function lookup(key) {
        let val = i18nGetKey(tr, key);
        if (val !== undefined) return val;
        if (en) { val = i18nGetKey(en, key); if (val !== undefined) return val; }
        return null;
    }

    // data-i18n="key">text</
    html = html.replace(/(data-i18n="([^"]+)"[^>]*>)([^<]*?)(<\/)/g, (m, before, key, oldText, after) => {
        const val = lookup(key);
        return val !== null ? before + val + after : m;
    });
    // data-i18n-html="key">html content</
    html = html.replace(/(data-i18n-html="([^"]+)"[^>]*>)([\s\S]*?)(<\/)/g, (m, before, key, oldContent, after) => {
        const val = lookup(key);
        return val !== null ? before + val + after : m;
    });
    // data-i18n-placeholder="key" ... placeholder="old"
    html = html.replace(/(data-i18n-placeholder="([^"]+)"[^>]*?)(placeholder=")([^"]*?)(")/g, (m, before, key, pAttr, oldVal, pEnd) => {
        const val = lookup(key);
        return val !== null ? before + pAttr + val + pEnd : m;
    });
    // placeholder="old" ... data-i18n-placeholder="key" (reverse order)
    html = html.replace(/(placeholder=")([^"]*?)("[^>]*?data-i18n-placeholder="([^"]+)")/g, (m, pAttr, oldVal, after, key) => {
        const val = lookup(key);
        return val !== null ? pAttr + val + after : m;
    });
    // Update <html lang="en"> to <html lang="xx">
    html = html.replace(/<html\s+lang="[^"]*"/, '<html lang="' + lang + '"');

    return html;
}

function sendPage(req, res, filePath) {
    const lang = req.cookies && req.cookies.lang;
    if (!lang || lang === 'en' || SUPPORTED_LANGS.indexOf(lang) === -1) {
        return res.sendFile(filePath);
    }
    const cacheKey = filePath + ':' + lang;
    if (translatedPageCache[cacheKey]) {
        return res.type('html').send(translatedPageCache[cacheKey]);
    }
    try {
        const html = fs.readFileSync(filePath, 'utf8');
        const translated = translateHTML(html, lang);
        translatedPageCache[cacheKey] = translated;
        res.type('html').send(translated);
    } catch (e) {
        res.sendFile(filePath);
    }
}

// Expose cache-clearing function for route modules
function clearI18nCache() {
    Object.keys(translatedPageCache).forEach(k => delete translatedPageCache[k]);
    Object.keys(i18nFileCache).forEach(k => delete i18nFileCache[k]);
}
app.locals.clearI18nCache = clearI18nCache;

// API to clear translation cache (called when admin updates content)
app.post('/api/admin/clear-i18n-cache', adminAuth, (req, res) => {
    clearI18nCache();
    res.json({ success: true });
});

// ===================== PAGE ROUTES =====================

// Public pages (server-side translated)
app.get('/', (req, res) => sendPage(req, res, path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin.html')));
app.get('/login', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'client-login.html')));
app.get('/portal', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'client-portal.html')));
app.get('/blog', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'blog.html')));
app.get('/blog/:slug', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'blog-article.html')));
app.get('/reviews', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'reviews.html')));
app.get('/support', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'support.html')));
app.get('/tutorials', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'tutorials.html')));
app.get('/products', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'products.html')));
app.get('/product/:slug', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'product.html')));
app.get('/offers', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'offers.html')));
app.get('/verify-email', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'verify-email.html')));
app.get('/reset-password', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'reset-password.html')));
app.get('/industries', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'industries.html')));
app.get('/industries/:slug', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'industry.html')));
app.get('/solutions', (req, res) => sendPage(req, res, path.join(__dirname, 'pages', 'solutions.html')));

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
app.use('/api/admin/i18n', require('./routes/admin-i18n'));
app.use('/api/admin/industries', require('./routes/admin-industries'));
app.use('/api/admin/solutions', require('./routes/admin-solutions'));

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
app.use('/api/industries', require('./routes/public-industries'));
app.use('/api/solutions', require('./routes/public-solutions'));

// Public product list
app.get('/api/products', (req, res) => {
    const db = getDb();
    const products = db.prepare('SELECT * FROM products WHERE isActive = 1 ORDER BY createdAt ASC').all();
    res.json(products.map(p => ({
        ...p,
        plans: JSON.parse(p.plans || '{}'),
        benefits: JSON.parse(p.benefits || '[]'),
        gallery: JSON.parse(p.gallery || '[]')
    })));
});

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

// --- Content management (DB-backed, with optional lang param) ---
app.get('/api/content', (req, res) => {
    try {
        const lang = (req.query.lang && /^[a-z]{2}$/.test(req.query.lang)) ? req.query.lang : 'en';
        const db = getDb();
        // Try database first (persistent across deploys)
        const row = db.prepare('SELECT data FROM content_store WHERE lang = ?').get(lang);
        if (row) return res.json(JSON.parse(row.data));
        // Fallback: try English from DB
        if (lang !== 'en') {
            const enRow = db.prepare('SELECT data FROM content_store WHERE lang = ?').get('en');
            if (enRow) return res.json(JSON.parse(enRow.data));
        }
        // Last resort: read from JSON file
        const filePath = CONTENT_PATH;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read content' });
    }
});

app.post('/api/content', adminAuth, (req, res) => {
    try {
        const lang = (req.query.lang && /^[a-z]{2}$/.test(req.query.lang)) ? req.query.lang : 'en';
        const data = JSON.stringify(req.body, null, 2);
        const db = getDb();
        const upsert = db.prepare('INSERT INTO content_store (lang, data, updatedAt) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(lang) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt');
        upsert.run(lang, data);

        // Sync non-price content values (highlighted, badge, ctaLink) across all languages
        if (req.body.pricing && req.body.pricing.plans) {
            const savedPlans = req.body.pricing.plans;
            const allRows = db.prepare('SELECT lang, data FROM content_store WHERE lang != ?').all(lang);
            for (const row of allRows) {
                try {
                    const other = JSON.parse(row.data);
                    if (other.pricing && other.pricing.plans && other.pricing.plans.length === savedPlans.length) {
                        for (let i = 0; i < savedPlans.length; i++) {
                            other.pricing.plans[i].highlighted = savedPlans[i].highlighted;
                            if (savedPlans[i].badge !== undefined) other.pricing.plans[i].badge = savedPlans[i].badge;
                            if (savedPlans[i].ctaLink !== undefined) other.pricing.plans[i].ctaLink = savedPlans[i].ctaLink;
                        }
                        upsert.run(row.lang, JSON.stringify(other, null, 2));
                    }
                } catch (e) { /* skip malformed rows */ }
            }
        }

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

// ===================== HEALTH CHECK =====================

app.get('/healthz', (req, res) => {
    try {
        const db = getDb();
        db.prepare('SELECT 1').get();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

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
    console.log(`Salesforce: ${process.env.SF_CLIENT_ID ? 'configured' : 'NOT SET'}`);
});
