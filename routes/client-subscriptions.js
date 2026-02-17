const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { clientAuth } = require('../middleware/auth');
const stripeService = require('../services/stripe-service');
const salesforce = require('../services/salesforce');
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

    res.json(subs.map(s => {
        const plans = JSON.parse(s.productPlans || '{}');
        const plan = plans[s.planKey] || {};
        return {
            ...s,
            productPlans: plans,
            planName: plan.name || s.planKey || 'Unknown Plan',
            price: (plan.pricePerUser || 0) * 100
        };
    }));
});

// POST /api/client/subscriptions - Create subscription
router.post('/', async (req, res) => {
    let { productId, planKey, planId, licenseCount, paymentMethodId } = req.body;

    // Frontend sends planId (e.g. "business") — resolve to productId + planKey
    if (planId && !planKey) planKey = planId;
    if (!licenseCount) {
        return res.status(400).json({ error: 'licenseCount required' });
    }

    const db = getDb();
    let product;
    if (productId) {
        product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    }
    // If no productId or not found, find product by planKey match
    if (!product && planKey) {
        const products = db.prepare('SELECT * FROM products WHERE isActive = 1').all();
        product = products.find(p => {
            const plans = JSON.parse(p.plans || '{}');
            return plans[planKey];
        });
    }
    if (!product) return res.status(404).json({ error: 'Product not found' });
    productId = product.id; // Ensure productId is set even when resolved by planKey
    if (!planKey) return res.status(400).json({ error: 'planKey required' });

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

    res.json({ id, stripeSubscriptionId: stripeSubId, clientSecret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY, status: plan.pricePerUser > 0 ? 'pending' : 'active' });
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

// =============================================
// License assignment endpoints
// =============================================
const emailService = require('../services/email');

// GET /api/client/subscriptions/:id/licenses
router.get('/:id/licenses', (req, res) => {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND clientId = ?')
        .get(req.params.id, req.client.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const assignments = db.prepare(
        "SELECT * FROM license_assignments WHERE subscriptionId = ? AND status != 'revoked' ORDER BY invitedAt DESC"
    ).all(req.params.id);

    res.json({ assignments, licenseCount: sub.licenseCount });
});

// POST /api/client/subscriptions/:id/licenses — invite an employee
router.post('/:id/licenses', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getDb();
    const sub = db.prepare('SELECT s.*, p.name as productName, p.plans as productPlans FROM subscriptions s LEFT JOIN products p ON s.productId = p.id WHERE s.id = ? AND s.clientId = ?')
        .get(req.params.id, req.client.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    // Check capacity
    const assignedCount = db.prepare(
        "SELECT COUNT(*) as cnt FROM license_assignments WHERE subscriptionId = ? AND status != 'revoked'"
    ).get(req.params.id).cnt;

    if (assignedCount >= sub.licenseCount) {
        return res.status(400).json({ error: 'All licenses have been assigned. Revoke one or upgrade your plan.' });
    }

    // Check duplicate
    const existing = db.prepare(
        "SELECT id FROM license_assignments WHERE subscriptionId = ? AND email = ? AND status != 'revoked'"
    ).get(req.params.id, email);
    if (existing) {
        return res.status(400).json({ error: 'This email has already been invited for this subscription.' });
    }

    const id = uuidv4();
    db.prepare('INSERT INTO license_assignments (id, subscriptionId, email) VALUES (?, ?, ?)')
        .run(id, req.params.id, email);

    // Get inviter info
    const client = db.prepare('SELECT firstName, lastName, company FROM clients WHERE id = ?').get(req.client.id);
    const inviterName = [client.firstName, client.lastName].filter(Boolean).join(' ');
    const companyName = client.company || inviterName;
    const plans = JSON.parse(sub.productPlans || '{}');
    const plan = plans[sub.planKey] || {};

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const inviteLink = `${baseUrl}/login?invite=${id}&email=${encodeURIComponent(email)}`;

    emailService.sendLicenseInvite(email, {
        companyName,
        inviterName,
        planName: plan.name || sub.planKey,
        inviteLink
    }).catch(err => console.error('License invite email failed:', err.message));

    res.json({ id, email, status: 'pending' });
});

// DELETE /api/client/subscriptions/:id/licenses/:assignmentId — revoke
router.delete('/:id/licenses/:assignmentId', (req, res) => {
    const db = getDb();
    const sub = db.prepare('SELECT id FROM subscriptions WHERE id = ? AND clientId = ?')
        .get(req.params.id, req.client.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const assignment = db.prepare('SELECT id FROM license_assignments WHERE id = ? AND subscriptionId = ?')
        .get(req.params.assignmentId, req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    db.prepare("UPDATE license_assignments SET status = 'revoked' WHERE id = ?").run(req.params.assignmentId);
    res.json({ success: true });
});

module.exports = router;
