const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { clientAuth } = require('../middleware/auth');
const stripeService = require('../services/stripe-service');
const salesforce = require('../services/salesforce-stub');
const zuora = require('../services/zuora-stub');

const router = express.Router();
router.use(clientAuth);

// GET /api/client/subscriptions
router.get('/', (req, res) => {
    const db = getDb();
    const subs = db.prepare(`
        SELECT s.*, p.name as productName, p.slug as productSlug, p.plans as productPlans
        FROM subscriptions s
        LEFT JOIN products p ON s.productId = p.id
        WHERE s.clientId = ?
        ORDER BY s.createdAt DESC
    `).all(req.client.id);

    res.json(subs.map(s => ({
        ...s,
        productPlans: JSON.parse(s.productPlans || '{}')
    })));
});

// POST /api/client/subscriptions - Create subscription
router.post('/', async (req, res) => {
    const { productId, planKey, licenseCount, paymentMethodId } = req.body;
    if (!productId || !planKey || !licenseCount) {
        return res.status(400).json({ error: 'productId, planKey and licenseCount required' });
    }

    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const plans = JSON.parse(product.plans || '{}');
    const plan = plans[planKey];
    if (!plan) return res.status(400).json({ error: 'Invalid plan key' });

    const id = uuidv4();
    let stripeSubId = null;
    let clientSecret = null;

    // Create Stripe subscription if price > 0 and Stripe configured
    if (plan.pricePerUser > 0 && plan.stripePriceId && stripeService.isConfigured()) {
        try {
            const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.client.id);
            let customerId = client.stripeCustomerId;
            if (!customerId) {
                const customer = await stripeService.createCustomer(client.email, `${client.firstName} ${client.lastName}`);
                customerId = customer.id;
                db.prepare('UPDATE clients SET stripeCustomerId = ? WHERE id = ?').run(customerId, client.id);
            }
            const stripeSub = await stripeService.createSubscription(customerId, plan.stripePriceId, licenseCount);
            stripeSubId = stripeSub.id;
            clientSecret = stripeSub.latest_invoice?.payment_intent?.client_secret;
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    }

    // Create Zuora account stub
    const zuoraResult = await zuora.createAccount({
        email: req.client.email,
        name: `${req.client.firstName} ${req.client.lastName}`
    });

    // Log to Salesforce
    salesforce.logActivity(null, `New subscription: ${plan.name} x${licenseCount}`).catch(() => {});

    db.prepare(`
        INSERT INTO subscriptions (id, clientId, productId, planKey, licenseCount, status, stripeSubscriptionId, zuoraAccountId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.client.id, productId, planKey, licenseCount, plan.pricePerUser > 0 ? 'pending' : 'active', stripeSubId, zuoraResult.accountId);

    res.json({ id, stripeSubscriptionId: stripeSubId, clientSecret, status: plan.pricePerUser > 0 ? 'pending' : 'active' });
});

// PUT /api/client/subscriptions/:id - Upgrade/downgrade
router.put('/:id', async (req, res) => {
    const { planKey, licenseCount } = req.body;
    const db = getDb();
    const sub = db.prepare('SELECT s.*, p.plans as productPlans FROM subscriptions s LEFT JOIN products p ON s.productId = p.id WHERE s.id = ? AND s.clientId = ?')
        .get(req.params.id, req.client.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const plans = JSON.parse(sub.productPlans || '{}');
    const newPlan = plans[planKey || sub.planKey];
    if (!newPlan) return res.status(400).json({ error: 'Invalid plan key' });

    // Update Stripe if applicable
    if (sub.stripeSubscriptionId && stripeService.isConfigured() && newPlan.stripePriceId) {
        try {
            await stripeService.updateSubscription(sub.stripeSubscriptionId, {
                priceId: newPlan.stripePriceId,
                quantity: licenseCount || sub.licenseCount
            });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    }

    db.prepare('UPDATE subscriptions SET planKey = ?, licenseCount = ?, updatedAt = datetime(?) WHERE id = ?')
        .run(planKey || sub.planKey, licenseCount || sub.licenseCount, new Date().toISOString(), req.params.id);

    res.json({ success: true });
});

// POST /api/client/subscriptions/:id/cancel
router.post('/:id/cancel', async (req, res) => {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND clientId = ?')
        .get(req.params.id, req.client.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    if (sub.stripeSubscriptionId && stripeService.isConfigured()) {
        try {
            await stripeService.cancelSubscription(sub.stripeSubscriptionId, true);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    }

    db.prepare("UPDATE subscriptions SET status = 'cancelling', cancelledAt = datetime(?), updatedAt = datetime(?) WHERE id = ?")
        .run(new Date().toISOString(), new Date().toISOString(), req.params.id);

    res.json({ success: true });
});

module.exports = router;
