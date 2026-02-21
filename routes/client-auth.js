const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../db/connection');
const { generateToken, clientAuth, blacklistToken, validatePassword } = require('../middleware/auth');
const salesforce = require('../services/salesforce');
const emailService = require('../services/email');

const router = express.Router();

function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

const RAINBOW_DOMAIN = process.env.RAINBOW_DOMAIN || 'https://sandbox.openrainbow.com';

// POST /api/client/register - Step 1: email, name, password
router.post('/register', async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    const emailNorm = email.trim().toLowerCase();
    // M1: Server-side password policy
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });
    const db = getDb();
    const existing = db.prepare('SELECT id FROM clients WHERE email = ?').get(emailNorm);
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const id = uuidv4();
    const hashed = bcrypt.hashSync(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    db.prepare(`
        INSERT INTO clients (id, email, password, firstName, lastName, verificationToken, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, emailNorm, hashed, firstName, lastName, verificationToken);

    // Send verification email via Rainbow sandbox API (same as "Start free" flow)
    // If user already exists in Rainbow, Rainbow sends a "sign in" email instead of a code
    let rainbowUserExists = false;
    let rainbowEmailSent = false;
    try {
        const rbEmailRes = await fetch(`${RAINBOW_DOMAIN}/api/rainbow/enduser/v1.0/notifications/emails/self-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ email: emailNorm, lang: 'en' })
        });
        const rbEmailData = await rbEmailRes.json().catch(() => ({}));
        console.log('[Rainbow] Verification email response:', rbEmailRes.status, JSON.stringify(rbEmailData));
        // Rainbow returns 409 if user already exists
        if (rbEmailRes.status === 409) {
            rainbowUserExists = true;
        } else if (rbEmailRes.ok) {
            rainbowEmailSent = true;
        }
    } catch (err) {
        console.error('[Rainbow] Verification email failed:', err.message);
    }

    // Brevo fallback: generate a 6-digit code and send via Brevo
    const verificationCode = generateVerificationCode();
    db.prepare('UPDATE clients SET verificationCode = ? WHERE id = ?').run(verificationCode, id);

    let brevoSent = false;
    try {
        const result = await emailService.sendVerificationCode(emailNorm, { code: verificationCode });
        brevoSent = result.success && !result.logged;
        console.log(`[Register] Brevo verification code ${brevoSent ? 'sent' : 'logged-only'} for: ${emailNorm}`);
    } catch (err) {
        console.error('[Register] Brevo verification code failed:', err.message);
    }

    console.log(`[Register] Email delivery for ${emailNorm}: Rainbow=${rainbowEmailSent}, Brevo=${brevoSent}, RainbowUserExists=${rainbowUserExists}`);

    // Fire-and-forget: create Salesforce Lead (for all users, including existing Rainbow ones)
    console.log('[Salesforce] Attempting lead creation for:', emailNorm);
    salesforce.createLead({ firstName, lastName, email: emailNorm })
        .then(result => {
            if (result.leadId) {
                db.prepare('UPDATE clients SET salesforceLeadId = ? WHERE id = ?')
                    .run(result.leadId, id);
            }
        })
        .catch(err => console.error('[Salesforce] Lead creation failed:', err.message));

    // If Rainbow user already exists, activate local account immediately
    if (rainbowUserExists) {
        db.prepare('UPDATE clients SET emailVerified = 1, status = ?, verificationToken = NULL, verificationCode = NULL, updatedAt = datetime(?) WHERE id = ?')
            .run('active', new Date().toISOString(), id);
        console.log('[Register] Rainbow account already exists — auto-activated:', emailNorm);
        return res.json({ success: true, alreadyVerified: true, message: 'Rainbow account found. You can sign in directly.' });
    }

    // If neither Rainbow nor Brevo could send, return an error
    if (!rainbowEmailSent && !brevoSent) {
        return res.status(500).json({ error: 'Unable to send verification email. Please try again later or contact support.' });
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

// POST /api/client/verify-code — verify via local Brevo code or Rainbow 6-digit code
router.post('/verify-code', async (req, res) => {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
        return res.status(400).json({ error: 'Email, code and password are required' });
    }
    const emailNorm = email.trim().toLowerCase();

    const db = getDb();
    const client = db.prepare('SELECT id, emailVerified, verificationCode FROM clients WHERE email = ?').get(emailNorm);
    if (!client) {
        return res.status(400).json({ error: 'Account not found' });
    }
    if (client.emailVerified) {
        return res.json({ success: true, message: 'Email already verified.' });
    }

    // Check local verification code first (Brevo fallback path)
    if (client.verificationCode && client.verificationCode === code.trim()) {
        console.log('[Verify] Local verification code matched for:', emailNorm);
        db.prepare('UPDATE clients SET emailVerified = 1, status = ?, verificationToken = NULL, verificationCode = NULL, updatedAt = datetime(?) WHERE id = ?')
            .run('active', new Date().toISOString(), client.id);
        db.prepare(
            "UPDATE license_assignments SET status = 'accepted', clientId = ?, acceptedAt = datetime(?) WHERE email = ? AND status = 'pending'"
        ).run(client.id, new Date().toISOString(), emailNorm);
        return res.json({ success: true, message: 'Email verified successfully. You can now sign in.' });
    }

    // If local code didn't match, try Rainbow self-register (for users who got Rainbow's email)
    try {
        const rbRes = await fetch(`${RAINBOW_DOMAIN}/api/rainbow/enduser/v1.0/users/self-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ loginEmail: emailNorm, password, temporaryToken: code })
        });
        const rbData = await rbRes.json().catch(() => ({}));
        console.log('[Rainbow] self-register response:', rbRes.status, JSON.stringify(rbData));
        if (!rbRes.ok) {
            // If Rainbow says user already exists (409), that's fine — activate the local account
            const errorStr = JSON.stringify(rbData).toLowerCase();
            if (rbRes.status === 409 || errorStr.includes('already exist') || errorStr.includes('already used')) {
                console.log('[Rainbow] User already exists in Rainbow — activating local account for:', emailNorm);
                // Fall through to activate the local account below
            } else {
                // Extract a human-readable error message from Rainbow
                let errMsg = 'Invalid verification code';
                const fullResp = JSON.stringify(rbData).toLowerCase();
                // Check if errorDetails is an array (Rainbow validation errors)
                if (Array.isArray(rbData.errorDetails)) {
                    const first = rbData.errorDetails[0];
                    if (first && first.msg) errMsg = first.msg;
                } else if (rbData.errorDetails && typeof rbData.errorDetails === 'object') {
                    errMsg = rbData.errorDetails.description || rbData.errorDetails.msg || rbData.errorDetails.message || JSON.stringify(rbData.errorDetails);
                } else if (typeof rbData.errorDetails === 'string' && rbData.errorDetails !== 'Bad Request') {
                    errMsg = rbData.errorDetails;
                } else if (rbData.details && typeof rbData.details === 'string') {
                    errMsg = rbData.details;
                } else if (typeof rbData.errorMsg === 'string' && rbData.errorMsg !== 'Bad Request') {
                    errMsg = rbData.errorMsg;
                } else if (rbData.error && typeof rbData.error === 'string' && rbData.error !== 'Bad Request') {
                    errMsg = rbData.error;
                }
                // If still generic, try to give a better hint
                if (errMsg === 'Invalid verification code' || errMsg === 'Bad Request') {
                    if (fullResp.includes('password')) {
                        errMsg = 'Password does not meet Rainbow requirements: 12-64 characters, with at least 1 lowercase, 1 uppercase, 1 number and 1 special character.';
                    } else if (fullResp.includes('token') || fullResp.includes('code')) {
                        errMsg = 'Invalid or expired verification code. Please try again.';
                    }
                }
                // Clean up Rainbow's verbose password messages
                if (errMsg.toLowerCase().includes('expected a password matching')) {
                    errMsg = 'Password does not meet Rainbow requirements: 12-64 characters, with at least 1 lowercase, 1 uppercase, 1 number and 1 special character.';
                }
                console.log('[Rainbow] Verify error detail:', errMsg, '| Full response:', JSON.stringify(rbData));
                return res.status(400).json({ error: errMsg });
            }
        }
    } catch (err) {
        console.error('[Rainbow] Verify code failed:', err.message);
        return res.status(500).json({ error: 'Failed to verify with Rainbow. Try again.' });
    }

    // Mark local account as verified
    db.prepare('UPDATE clients SET emailVerified = 1, status = ?, verificationToken = NULL, verificationCode = NULL, updatedAt = datetime(?) WHERE id = ?')
        .run('active', new Date().toISOString(), client.id);

    // Auto-accept any pending license invitations for this email
    db.prepare(
        "UPDATE license_assignments SET status = 'accepted', clientId = ?, acceptedAt = datetime(?) WHERE email = ? AND status = 'pending'"
    ).run(client.id, new Date().toISOString(), emailNorm);

    res.json({ success: true, message: 'Email verified successfully. You can now sign in.' });
});

// POST /api/client/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    const emailNorm = email.trim().toLowerCase();
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(emailNorm);
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
    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(client.id, 'client', 'login', { email }, req.ip);
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
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const emailNorm = email.trim().toLowerCase();

    const db = getDb();
    const client = db.prepare('SELECT id, firstName FROM clients WHERE email = ?').get(emailNorm);
    if (!client) {
        // Don't reveal if email exists
        return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    db.prepare('UPDATE clients SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?')
        .run(resetToken, expiry, client.id);

    // Send password reset email
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    emailService.sendPasswordReset(emailNorm, { resetUrl, firstName: client.firstName || '' })
        .catch(err => console.error('[Email] Password reset send failed:', err.message));

    res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
});

// POST /api/client/reset-password
router.post('/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });

    // M1: Password policy on reset
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const db = getDb();
    // M5: Timing-safe token comparison — fetch all clients with a reset token and compare safely
    const candidates = db.prepare('SELECT id, resetToken, resetTokenExpiry FROM clients WHERE resetToken IS NOT NULL').all();
    let matched = null;
    const tokenBuf = Buffer.from(token);
    for (const c of candidates) {
        const candidateBuf = Buffer.from(c.resetToken);
        if (tokenBuf.length === candidateBuf.length && crypto.timingSafeEqual(tokenBuf, candidateBuf)) {
            matched = c;
            break;
        }
    }
    if (!matched) return res.status(400).json({ error: 'Invalid reset token' });
    if (new Date(matched.resetTokenExpiry) < new Date()) {
        return res.status(400).json({ error: 'Reset token has expired' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE clients SET password = ?, resetToken = NULL, resetTokenExpiry = NULL, updatedAt = datetime(?) WHERE id = ?')
        .run(hashed, new Date().toISOString(), matched.id);

    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(matched.id, 'client', 'password_reset', {}, req.ip);

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
    // M1: Password policy
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const db = getDb();
    const client = db.prepare('SELECT password FROM clients WHERE id = ?').get(req.client.id);
    if (!bcrypt.compareSync(currentPassword, client.password)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE clients SET password = ?, updatedAt = datetime(?) WHERE id = ?')
        .run(hashed, new Date().toISOString(), req.client.id);

    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.client.id, 'client', 'password_changed', {}, req.ip);

    res.json({ success: true });
});

// M2: POST /api/client/logout
router.post('/logout', clientAuth, (req, res) => {
    const db = getDb();
    blacklistToken(db, req._authToken);
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.client.id, 'client', 'logout', {}, req.ip);
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
    const emailNorm = email.trim().toLowerCase();
    const db = getDb();
    const exists = !!db.prepare('SELECT id FROM clients WHERE email = ?').get(emailNorm);
    res.json({ exists });
});

// POST /api/client/resend-code — resend verification code via Brevo
const resendCooldowns = new Map(); // email -> timestamp
router.post('/resend-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const emailNorm = email.trim().toLowerCase();

    // Rate limit: 1 resend per 60 seconds per email
    const lastSent = resendCooldowns.get(emailNorm);
    if (lastSent && Date.now() - lastSent < 60000) {
        const wait = Math.ceil((60000 - (Date.now() - lastSent)) / 1000);
        return res.status(429).json({ error: `Please wait ${wait} seconds before requesting another code.` });
    }

    const db = getDb();
    const client = db.prepare('SELECT id, emailVerified FROM clients WHERE email = ?').get(emailNorm);
    if (!client) {
        // Don't reveal if email exists
        return res.json({ success: true, message: 'If the email exists, a new code has been sent.' });
    }
    if (client.emailVerified) {
        return res.json({ success: true, message: 'Email already verified.' });
    }

    const verificationCode = generateVerificationCode();
    db.prepare('UPDATE clients SET verificationCode = ?, updatedAt = datetime(?) WHERE id = ?')
        .run(verificationCode, new Date().toISOString(), client.id);

    try {
        const result = await emailService.sendVerificationCode(emailNorm, { code: verificationCode });
        resendCooldowns.set(emailNorm, Date.now());
        if (result.success && !result.logged) {
            console.log('[Resend] Verification code sent via Brevo for:', emailNorm);
        } else {
            console.log('[Resend] Verification code logged (no transport) for:', emailNorm);
        }
    } catch (err) {
        console.error('[Resend] Failed to send verification code:', err.message);
        return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
    }

    res.json({ success: true, message: 'A new verification code has been sent to your email.' });
});

module.exports = router;
