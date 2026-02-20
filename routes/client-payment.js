const express = require('express');
const { getDb } = require('../db/connection');
const { clientAuth } = require('../middleware/auth');
const stripeService = require('../services/stripe-service');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
router.use(clientAuth);

// GET /api/client/payment-methods
router.get('/', async (req, res) => {
    const db = getDb();
    const client = db.prepare('SELECT stripeCustomerId FROM clients WHERE id = ?').get(req.client.id);
    if (!client?.stripeCustomerId || !stripeService.isConfigured()) {
        return res.json([]);
    }
    try {
        const methods = await stripeService.listPaymentMethods(client.stripeCustomerId);
        res.json(methods.map(m => ({
            id: m.id,
            brand: m.card.brand,
            last4: m.card.last4,
            expMonth: m.card.exp_month,
            expYear: m.card.exp_year
        })));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/client/payment-methods/setup-intent
router.post('/setup-intent', async (req, res) => {
    const db = getDb();
    const client = db.prepare('SELECT stripeCustomerId FROM clients WHERE id = ?').get(req.client.id);
    if (!client?.stripeCustomerId || !stripeService.isConfigured()) {
        return res.status(400).json({ error: 'Stripe customer not found' });
    }
    try {
        const intent = await stripeService.createSetupIntent(client.stripeCustomerId);
        res.json({ clientSecret: intent.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /api/client/payment-methods/:id
router.delete('/:id', async (req, res) => {
    if (!stripeService.isConfigured()) return res.status(400).json({ error: 'Stripe not configured' });
    // H3: Verify ownership — ensure payment method belongs to this client
    const db = getDb();
    const client = db.prepare('SELECT stripeCustomerId FROM clients WHERE id = ?').get(req.client.id);
    if (!client?.stripeCustomerId) return res.status(400).json({ error: 'No Stripe customer' });
    try {
        const methods = await stripeService.listPaymentMethods(client.stripeCustomerId);
        const owns = methods.some(m => m.id === req.params.id);
        if (!owns) return res.status(403).json({ error: 'Payment method does not belong to your account' });
        await stripeService.detachPaymentMethod(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/client/payment-methods/:id/default
router.post('/:id/default', async (req, res) => {
    const db = getDb();
    const client = db.prepare('SELECT stripeCustomerId FROM clients WHERE id = ?').get(req.client.id);
    if (!client?.stripeCustomerId || !stripeService.isConfigured()) {
        return res.status(400).json({ error: 'Stripe customer not found' });
    }
    try {
        // H3: Verify ownership before setting default
        const methods = await stripeService.listPaymentMethods(client.stripeCustomerId);
        const owns = methods.some(m => m.id === req.params.id);
        if (!owns) return res.status(403).json({ error: 'Payment method does not belong to your account' });
        await stripeService.setDefaultPaymentMethod(client.stripeCustomerId, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/client/payment-methods/save — save a payment method from a completed payment
router.post('/save', async (req, res) => {
    const { paymentMethodId } = req.body;
    if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId required' });

    const db = getDb();
    const client = db.prepare('SELECT stripeCustomerId FROM clients WHERE id = ?').get(req.client.id);
    if (!client?.stripeCustomerId || !stripeService.isConfigured()) {
        return res.status(400).json({ error: 'Stripe customer not found' });
    }
    try {
        await stripeService.setDefaultPaymentMethod(client.stripeCustomerId, paymentMethodId);
        res.json({ success: true });
    } catch (err) {
        console.error('[Payment] Save card error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

// GET /api/client/invoices
router.get('/invoices', async (req, res) => {
    const zuora = require('../services/zuora-stub');
    const db = getDb();
    const sub = db.prepare('SELECT zuoraAccountId FROM subscriptions WHERE clientId = ? LIMIT 1').get(req.client.id);
    if (!sub?.zuoraAccountId) return res.json({ invoices: [] });
    try {
        const result = await zuora.getInvoices(sub.zuoraAccountId);
        res.json(result);
    } catch (err) {
        res.json({ invoices: [] });
    }
});

module.exports = router;
