const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../db/connection');
const { generateToken, clientAuth } = require('../middleware/auth');
const salesforce = require('../services/salesforce');
const { sendVerification } = require('../services/email');

const router = express.Router();

const BASE_URL = process.env.BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || `http://localhost:${process.env.PORT || 3000}`;

// POST /api/client/register - Step 1: email, name, password
router.post('/register', (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM clients WHERE email = ?').get(email);
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const id = uuidv4();
    const hashed = bcrypt.hashSync(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    db.prepare(`
        INSERT INTO clients (id, email, password, firstName, lastName, verificationToken, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, email, hashed, firstName, lastName, verificationToken);

    // Send verification email
    const verifyUrl = `${BASE_URL}/verify-email?token=${verificationToken}`;
    sendVerification(email, { verifyUrl, firstName })
        .catch(err => console.error('[Email] Verification send failed:', err.message));

    // Fire-and-forget: create Salesforce Lead
    console.log('[Salesforce] Attempting lead creation for:', email);
    salesforce.createLead({ firstName, lastName, email })
        .then(result => {
            if (result.leadId) {
                db.prepare('UPDATE clients SET salesforceLeadId = ? WHERE id = ?')
                    .run(result.leadId, id);
            }
        })
        .catch(err => console.error('[Salesforce] Lead creation failed:', err.message));

    res.json({ success: true, message: 'Account created. Check your email to verify.' });
});

// POST /api/client/register-step2 - Company info
router.post('/register-step2', clientAuth, (req, res) => {
    const { company, companySize, phone, address, city, country, postalCode } = req.body;
    const db = getDb();
    db.prepare(`
        UPDATE clients SET company = ?, companySize = ?, phone = ?, address = ?, city = ?, country = ?, postalCode = ?, updatedAt = datetime(?)
        WHERE id = ?
    `).run(company || null, companySize || null, phone || null, address || null, city || null, country || null, postalCode || null, new Date().toISOString(), req.client.id);

    res.json({ success: true });
});

// POST /api/client/verify-email
router.post('/verify-email', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const db = getDb();
    const client = db.prepare('SELECT id FROM clients WHERE verificationToken = ?').get(token);
    if (!client) {
        return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    db.prepare('UPDATE clients SET emailVerified = 1, status = ?, verificationToken = NULL, updatedAt = datetime(?) WHERE id = ?')
        .run('active', new Date().toISOString(), client.id);

    res.json({ success: true, message: 'Email verified successfully. You can now sign in.' });
});

// POST /api/client/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
    if (!client || !bcrypt.compareSync(password, client.password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!client.emailVerified) {
        const [user, domain] = client.email.split('@');
        const masked = user[0] + '***@' + domain;
        return res.status(403).json({ error: `Please verify your email before signing in. Check your inbox at ${masked}` });
    }
    if (client.status === 'suspended') {
        return res.status(403).json({ error: 'Account suspended. Contact support.' });
    }
    const token = generateToken({
        id: client.id,
        email: client.email,
        firstName: client.firstName,
        lastName: client.lastName,
        type: 'client'
    });
    res.json({
        token,
        user: {
            id: client.id,
            email: client.email,
            firstName: client.firstName,
            lastName: client.lastName,
            company: client.company
        }
    });
});

// POST /api/client/forgot-password
router.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const db = getDb();
    const client = db.prepare('SELECT id FROM clients WHERE email = ?').get(email);
    if (!client) {
        // Don't reveal if email exists
        return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    db.prepare('UPDATE clients SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?')
        .run(resetToken, expiry, client.id);

    // In production, send email with reset link
    res.json({ success: true, message: 'If the email exists, a reset link has been sent.', resetToken });
});

// POST /api/client/reset-password
router.post('/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });

    const db = getDb();
    const client = db.prepare('SELECT id, resetTokenExpiry FROM clients WHERE resetToken = ?').get(token);
    if (!client) return res.status(400).json({ error: 'Invalid reset token' });
    if (new Date(client.resetTokenExpiry) < new Date()) {
        return res.status(400).json({ error: 'Reset token has expired' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE clients SET password = ?, resetToken = NULL, resetTokenExpiry = NULL, updatedAt = datetime(?) WHERE id = ?')
        .run(hashed, new Date().toISOString(), client.id);

    res.json({ success: true });
});

// GET /api/client/me
router.get('/me', clientAuth, (req, res) => {
    const db = getDb();
    const client = db.prepare(`
        SELECT id, email, firstName, lastName, company, companySize, phone, address, city, country, postalCode, stripeCustomerId, status, createdAt
        FROM clients WHERE id = ?
    `).get(req.client.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
});

// PUT /api/client/me
router.put('/me', clientAuth, (req, res) => {
    const { firstName, lastName, company, companySize, phone, address, city, country, postalCode } = req.body;
    const db = getDb();
    db.prepare(`
        UPDATE clients SET firstName = ?, lastName = ?, company = ?, companySize = ?, phone = ?, address = ?, city = ?, country = ?, postalCode = ?, updatedAt = datetime(?)
        WHERE id = ?
    `).run(firstName, lastName, company || null, companySize || null, phone || null, address || null, city || null, country || null, postalCode || null, new Date().toISOString(), req.client.id);

    res.json({ success: true });
});

// POST /api/client/change-password
router.post('/change-password', clientAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Both passwords required' });
    }
    const db = getDb();
    const client = db.prepare('SELECT password FROM clients WHERE id = ?').get(req.client.id);
    if (!bcrypt.compareSync(currentPassword, client.password)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE clients SET password = ?, updatedAt = datetime(?) WHERE id = ?')
        .run(hashed, new Date().toISOString(), req.client.id);

    res.json({ success: true });
});

// GET /api/client/check-existing
router.get('/check-existing', (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const db = getDb();
    const exists = !!db.prepare('SELECT id FROM clients WHERE email = ?').get(email);
    res.json({ exists });
});

module.exports = router;
