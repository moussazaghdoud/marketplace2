const express = require('express');
const { syncSubscriptionFromWebhook } = require('../services/stripe-service');
const { sendPaymentConfirmation } = require('../services/email');
const { getDb } = require('../db/connection');

const router = express.Router();

// Stripe webhook requires raw body
router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
    const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        if (endpointSecret) {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } else {
            event = JSON.parse(req.body);
            console.log('[Webhook] No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
        }
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    console.log(`[Webhook] ${event.type}`);

    switch (event.type) {
        case 'invoice.payment_succeeded': {
            const invoice = event.data.object;
            console.log(`[Webhook] Payment succeeded for ${invoice.customer_email}, amount: ${invoice.amount_paid / 100}`);
            if (invoice.subscription) {
                const db = getDb();
                const sub = db.prepare('SELECT s.*, c.email FROM subscriptions s LEFT JOIN clients c ON s.clientId = c.id WHERE s.stripeSubscriptionId = ?')
                    .get(invoice.subscription);
                if (sub) {
                    sendPaymentConfirmation(sub.email, {
                        planName: sub.planKey,
                        licenseCount: sub.licenseCount,
                        amount: `€${(invoice.amount_paid / 100).toFixed(2)}`
                    }).catch(e => console.error('Email error:', e));
                }
            }
            break;
        }
        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            console.log(`[Webhook] Payment failed for ${invoice.customer_email}`);
            break;
        }
        case 'customer.subscription.updated': {
            const subscription = event.data.object;
            syncSubscriptionFromWebhook(subscription);
            break;
        }
        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            syncSubscriptionFromWebhook(subscription);
            break;
        }
        default:
            console.log(`[Webhook] Unhandled event: ${event.type}`);
    }

    res.json({ received: true });
});

module.exports = router;
