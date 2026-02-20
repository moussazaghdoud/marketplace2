const express = require('express');
const { getDb } = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/subscriptions
router.get('/', (req, res) => {
    const db = getDb();
    const { status, clientId } = req.query;
    let sql = `
        SELECT s.*, c.email as clientEmail, c.firstName as clientFirstName, c.lastName as clientLastName, c.company as clientCompany, p.name as productName
        FROM subscriptions s
        LEFT JOIN clients c ON s.clientId = c.id
        LEFT JOIN products p ON s.productId = p.id
    `;
    const params = [];
    const conditions = [];
    if (status) { conditions.push('s.status = ?'); params.push(status); }
    if (clientId) { conditions.push('s.clientId = ?'); params.push(clientId); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY s.createdAt DESC';

    res.json(db.prepare(sql).all(...params));
});

// PUT /api/admin/subscriptions/:id
router.put('/:id', (req, res) => {
    const { status, planKey, licenseCount } = req.body;
    const db = getDb();
    db.prepare(`
        UPDATE subscriptions SET status = ?, planKey = ?, licenseCount = ?, updatedAt = datetime(?)
        WHERE id = ?
    `).run(status, planKey, licenseCount, new Date().toISOString(), req.params.id);
    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.admin.id, 'admin', 'subscription_updated', { subscriptionId: req.params.id, status, planKey }, req.ip);
    res.json({ success: true });
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
    const db = getDb();
    const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
    const activeSubscriptions = db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").get().count;

    // Calculate MRR from active subscriptions
    const subs = db.prepare(`
        SELECT s.planKey, s.licenseCount, p.plans FROM subscriptions s
        LEFT JOIN products p ON s.productId = p.id
        WHERE s.status = 'active'
    `).all();

    let mrr = 0;
    for (const sub of subs) {
        try {
            const plans = JSON.parse(sub.plans || '{}');
            const plan = plans[sub.planKey];
            if (plan) mrr += (plan.pricePerUser || 0) * (sub.licenseCount || 1);
        } catch (e) { /* skip */ }
    }

    const newClientsThisMonth = db.prepare(
        "SELECT COUNT(*) as count FROM clients WHERE createdAt >= date('now', 'start of month')"
    ).get().count;

    const pendingContacts = db.prepare("SELECT COUNT(*) as count FROM contact_submissions WHERE status = 'new'").get().count;

    res.json({ totalClients, activeSubscriptions, mrr: mrr.toFixed(2), newClientsThisMonth, pendingContacts });
});

module.exports = router;
