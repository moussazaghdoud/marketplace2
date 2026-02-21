const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    if (process.env.SMTP_HOST) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        return transporter;
    }
    return null;
}

function loadTemplate(templateName, variables) {
    const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.html`);
    let html;
    try {
        html = fs.readFileSync(templatePath, 'utf8');
    } catch (e) {
        // Fallback: simple text
        html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#4F6DF5;">{{subject}}</h2>
            <p>{{body}}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <p style="color:#999;font-size:12px;">Rainbow by ALE</p>
        </div>`;
    }
    // Replace {{variable}} placeholders
    for (const [key, value] of Object.entries(variables || {})) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return html;
}

// Send email via Brevo HTTP API (no SMTP ports needed)
async function sendViaBrevo({ to, subject, html }) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return null;

    const fromEmail = process.env.SMTP_FROM || 'noreply@rainbow-portal.com';
    const fromName = process.env.SMTP_FROM_NAME || 'Rainbow by ALE';

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: fromName, email: fromEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html
        })
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Brevo API error ${res.status}: ${errData.message || JSON.stringify(errData)}`);
    }

    const data = await res.json().catch(() => ({}));
    console.log(`[EMAIL] Sent via Brevo API to ${to} | messageId: ${data.messageId || 'n/a'}`);
    return { success: true, messageId: data.messageId };
}

async function sendEmail({ to, subject, templateName, variables, body }) {
    const db = getDb();
    const logId = uuidv4();
    const html = templateName ? loadTemplate(templateName, { ...variables, subject }) : `<p>${body}</p>`;

    // Priority 1: Brevo HTTP API (works on Railway without SMTP ports)
    if (process.env.BREVO_API_KEY) {
        try {
            await sendViaBrevo({ to, subject, html });
            db.prepare('INSERT INTO email_log (id, toEmail, subject, templateName, status) VALUES (?, ?, ?, ?, ?)')
                .run(logId, to, subject, templateName || 'inline', 'sent');
            return { success: true };
        } catch (err) {
            console.error('[EMAIL] Brevo API error:', err.message);
            db.prepare('INSERT INTO email_log (id, toEmail, subject, templateName, status, error) VALUES (?, ?, ?, ?, ?, ?)')
                .run(logId, to, subject, templateName || 'inline', 'failed', err.message);
            return { success: false, error: err.message };
        }
    }

    // Priority 2: SMTP transport (nodemailer)
    const transport = getTransporter();
    if (!transport) {
        console.log(`[EMAIL] No transport available. To: ${to} | Subject: ${subject}`);
        db.prepare('INSERT INTO email_log (id, toEmail, subject, templateName, status) VALUES (?, ?, ?, ?, ?)')
            .run(logId, to, subject, templateName || 'inline', 'logged');
        return { success: true, logged: true };
    }

    try {
        await transport.sendMail({
            from: process.env.SMTP_FROM || 'noreply@rainbow-portal.com',
            to,
            subject,
            html
        });
        db.prepare('INSERT INTO email_log (id, toEmail, subject, templateName, status) VALUES (?, ?, ?, ?, ?)')
            .run(logId, to, subject, templateName || 'inline', 'sent');
        return { success: true };
    } catch (err) {
        console.error('Email send error:', err.message);
        db.prepare('INSERT INTO email_log (id, toEmail, subject, templateName, status, error) VALUES (?, ?, ?, ?, ?, ?)')
            .run(logId, to, subject, templateName || 'inline', 'failed', err.message);
        return { success: false, error: err.message };
    }
}

// Convenience methods
const sendWelcome = (to, vars) => sendEmail({ to, subject: 'Bienvenue sur Rainbow!', templateName: 'welcome', variables: vars });
const sendVerification = (to, vars) => sendEmail({ to, subject: 'Vérifiez votre email', templateName: 'verification', variables: vars });
const sendPaymentConfirmation = (to, vars) => sendEmail({ to, subject: 'Confirmation de paiement', templateName: 'payment-confirmation', variables: vars });
const sendPasswordReset = (to, vars) => sendEmail({ to, subject: 'Réinitialisation de mot de passe', templateName: 'password-reset', variables: vars });
const sendSubscriptionChange = (to, vars) => sendEmail({ to, subject: 'Modification de votre abonnement', templateName: 'subscription-change', variables: vars });
const sendCancellation = (to, vars) => sendEmail({ to, subject: 'Confirmation d\'annulation', templateName: 'cancellation', variables: vars });
const sendLicenseInvite = (to, vars) => sendEmail({ to, subject: `You've been granted a Rainbow license by ${vars.companyName || 'a team'}`, templateName: 'license-invite', variables: vars });
const sendVerificationCode = (to, vars) => sendEmail({ to, subject: 'Your verification code', templateName: 'verification-code', variables: vars });

module.exports = {
    sendEmail, sendWelcome, sendVerification, sendPaymentConfirmation,
    sendPasswordReset, sendSubscriptionChange, sendCancellation, sendLicenseInvite,
    sendVerificationCode
};
