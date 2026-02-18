const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../db/connection');
const { generateToken, clientAuth } = require('../middleware/auth');
const salesforce = require('../services/salesforce');

const router = express.Router();

const RAINBOW_DOMAIN = process.env.RAINBOW_DOMAIN || 'https://sandbox.openrainbow.com';

// POST /api/client/register - Step 1: email, name, password
router.post('/register', async (req, res) => {
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

    // Send verification email via Rainbow sandbox API (same as "Start free" flow)
    // If user already exists in Rainbow, Rainbow sends a "sign in" email instead of a code
    let rainbowUserExists = false;
    try {
        const rbEmailRes = await fetch(`${RAINBOW_DOMAIN}/api/rainbow/enduser/v1.0/notifications/emails/self-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ email, lang: 'en' })
        });
        const rbEmailData = await rbEmailRes.json().catch(() => ({}));
        console.log('[Rainbow] Verification email response:', rbEmailRes.status, JSON.stringify(rbEmailData));
        // Rainbow returns 409 if user already exists
        if (rbEmailRes.status === 409) {
            rainbowUserExists = true;
        }
    } catch (err) {
        console.error('[Rainbow] Verification email failed:', err.message);
    }

    // Fire-and-forget: create Salesforce Lead (for all users, including existing Rainbow ones)
    console.log('[Salesforce] Attempting lead creation for:', email);
    salesforce.createLead({ firstName, lastName, email })
        .then(result => {
            if (result.leadId) {
                db.prepare('UPDATE clients SET salesforceLeadId = ? WHERE id = ?')
                    .run(result.leadId, id);
            }
        })
        .catch(err => console.error('[Salesforce] Lead creation failed:', err.message));

    // If Rainbow user already exists, activate local account immediately
    if (rainbowUserExists) {
        db.prepare('UPDATE clients SET emailVerified = 1, status = ?, verificationToken = NULL, updatedAt = datetime(?) WHERE id = ?')
            .run('active', new Date().toISOString(), id);
        console.log('[Register] Rainbow account already exists — auto-activated:', email);
        return res.json({ success: true, alreadyVerified: true, message: 'Rainbow account found. You can sign in directly.' });
    }

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

// POST /api/client/verify-code — verify via Rainbow 6-digit code
router.post('/verify-code', async (req, res) => {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
        return res.status(400).json({ error: 'Email, code and password are required' });
    }

    const db = getDb();
    const client = db.prepare('SELECT id, emailVerified FROM clients WHERE email = ?').get(email);
    if (!client) {
        return res.status(400).json({ error: 'Account not found' });
    }
    if (client.emailVerified) {
        return res.json({ success: true, message: 'Email already verified.' });
    }

    // Call Rainbow self-register to create Rainbow account with the code
    try {
        const rbRes = await fetch(`${RAINBOW_DOMAIN}/api/rainbow/enduser/v1.0/users/self-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ loginEmail: email, password, temporaryToken: code })
        });
        const rbData = await rbRes.json().catch(() => ({}));
        console.log('[Rainbow] self-register response:', rbRes.status, JSON.stringify(rbData));
        if (!rbRes.ok) {
            // If Rainbow says user already exists (409), that's fine — activate the local account
            const errorStr = JSON.stringify(rbData).toLowerCase();
            if (rbRes.status === 409 || errorStr.includes('already exist') || errorStr.includes('already used')) {
                console.log('[Rainbow] User already exists in Rainbow — activating local account for:', email);
                // Fall through to activate the local account below
            } else {
                // Extract a human-readable error message
                let errMsg = 'Invalid verification code';
                if (typeof rbData.errorDetails === 'string') errMsg = rbData.errorDetails;
                else if (typeof rbData.errorMsg === 'string') errMsg = rbData.errorMsg;
                else if (rbData.errorDetails && typeof rbData.errorDetails === 'object') errMsg = rbData.errorDetails.description || rbData.errorDetails.msg || JSON.stringify(rbData.errorDetails);
                else if (rbData.error && typeof rbData.error === 'string') errMsg = rbData.error;
                return res.status(400).json({ error: errMsg });
            }
        }
    } catch (err) {
        console.error('[Rainbow] Verify code failed:', err.message);
        return res.status(500).json({ error: 'Failed to verify with Rainbow. Try again.' });
    }

    // Mark local account as verified
    db.prepare('UPDATE clients SET emailVerified = 1, status = ?, verificationToken = NULL, updatedAt = datetime(?) WHERE id = ?')
        .run('active', new Date().toISOString(), client.id);

    // Auto-accept any pending license invitations for this email
    db.prepare(
        "UPDATE license_assignments SET status = 'accepted', clientId = ?, acceptedAt = datetime(?) WHERE email = ? AND status = 'pending'"
    ).run(client.id, new Date().toISOString(), email);

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

// POST /api/client/accept-invite — accept a license invitation
router.post('/accept-invite', clientAuth, (req, res) => {
    const { inviteId } = req.body;
    if (!inviteId) return res.status(400).json({ error: 'inviteId required' });

    const db = getDb();
    const assignment = db.prepare(
        "SELECT * FROM license_assignments WHERE id = ? AND status = 'pending'"
    ).get(inviteId);

    if (!assignment) {
        return res.status(404).json({ error: 'Invite not found or already used' });
    }

    // Verify email matches
    const client = db.prepare('SELECT email FROM clients WHERE id = ?').get(req.client.id);
    if (client.email.toLowerCase() !== assignment.email.toLowerCase()) {
        return res.status(403).json({ error: 'This invite was sent to a different email address' });
    }

    db.prepare(
        "UPDATE license_assignments SET status = 'accepted', clientId = ?, acceptedAt = datetime(?) WHERE id = ?"
    ).run(req.client.id, new Date().toISOString(), inviteId);

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
