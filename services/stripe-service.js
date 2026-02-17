const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const { getDb } = require('../db/connection');

function isConfigured() {
    return !!stripe;
}

async function createCustomer(email, name) {
    if (!stripe) throw new Error('Stripe not configured');
    return stripe.customers.create({ email, name });
}

async function createSubscription(customerId, priceId, quantity) {
    if (!stripe) throw new Error('Stripe not configured');
    return stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent']
    });
}

async function updateSubscription(subscriptionId, { priceId, quantity }) {
    if (!stripe) throw new Error('Stripe not configured');
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return stripe.subscriptions.update(subscriptionId, {
        items: [{ id: sub.items.data[0].id, price: priceId, quantity }],
        proration_behavior: 'create_prorations'
    });
}

async function cancelSubscription(subscriptionId, atPeriodEnd = true) {
    if (!stripe) throw new Error('Stripe not configured');
    if (atPeriodEnd) {
        return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    }
    return stripe.subscriptions.cancel(subscriptionId);
}

async function createSetupIntent(customerId) {
    if (!stripe) throw new Error('Stripe not configured');
    return stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card']
    });
}

async function listPaymentMethods(customerId) {
    if (!stripe) throw new Error('Stripe not configured');
    const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    return methods.data;
}

async function detachPaymentMethod(paymentMethodId) {
    if (!stripe) throw new Error('Stripe not configured');
    return stripe.paymentMethods.detach(paymentMethodId);
}

async function setDefaultPaymentMethod(customerId, paymentMethodId) {
    if (!stripe) throw new Error('Stripe not configured');
    return stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId }
    });
}

// Ensure a Stripe product exists for this product slug; create if missing
async function ensureProduct(name, slug) {
    if (!stripe) throw new Error('Stripe not configured');
    // Search for existing product by metadata slug
    const existing = await stripe.products.search({ query: `metadata["slug"]:"${slug}"` });
    if (existing.data.length > 0) return existing.data[0].id;
    // Create new product
    const product = await stripe.products.create({ name, metadata: { slug } });
    return product.id;
}

// Ensure a Stripe price exists with the correct amount; create new + deactivate old if changed
async function ensurePrice(stripeProductId, unitAmount, currency, planKey, existingPriceId) {
    if (!stripe) throw new Error('Stripe not configured');
    // If we have an existing price, check if amount matches
    if (existingPriceId) {
        try {
            const existing = await stripe.prices.retrieve(existingPriceId);
            if (existing.unit_amount === unitAmount && existing.currency === currency) {
                return existingPriceId; // No change needed
            }
        } catch (e) {
            // Price doesn't exist or was deleted — create a new one
        }
    }
    // Create a new price (Stripe prices are immutable)
    const newPrice = await stripe.prices.create({
        product: stripeProductId,
        unit_amount: unitAmount,
        currency,
        recurring: { interval: 'month' },
        metadata: { planKey }
    });
    // Deactivate the old price if it existed
    if (existingPriceId) {
        try {
            await stripe.prices.update(existingPriceId, { active: false });
        } catch (e) {
            // Ignore if old price can't be deactivated
        }
    }
    return newPrice.id;
}

// Sync subscription status from webhook event to local DB
function syncSubscriptionFromWebhook(stripeSubscription) {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM subscriptions WHERE stripeSubscriptionId = ?')
        .get(stripeSubscription.id);
    if (!sub) return;

    let status = 'active';
    if (stripeSubscription.status === 'canceled') status = 'cancelled';
    else if (stripeSubscription.status === 'past_due') status = 'past_due';
    else if (stripeSubscription.status === 'unpaid') status = 'unpaid';
    else if (stripeSubscription.cancel_at_period_end) status = 'cancelling';

    db.prepare('UPDATE subscriptions SET status = ?, updatedAt = datetime(?) WHERE id = ?')
        .run(status, new Date().toISOString(), sub.id);
}

module.exports = {
    isConfigured, createCustomer, createSubscription, updateSubscription,
    cancelSubscription, createSetupIntent, listPaymentMethods,
    detachPaymentMethod, setDefaultPaymentMethod, syncSubscriptionFromWebhook,
    ensureProduct, ensurePrice
};
