const express = require('express');
const { getDb } = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/clients
router.get('/', (req, res) => {
    const db = getDb();
    const { status, search } = req.query;
    let sql = 'SELECT id, email, firstName, lastName, company, companySize, phone, status, stripeCustomerId, createdAt FROM clients';
    const params = [];
    const conditions = [];

    if (status) { conditions.push('status = ?'); params.push(status); }
    if (search) {
        conditions.push('(email LIKE ? OR firstName LIKE ? OR lastName LIKE ? OR company LIKE ?)');
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY createdAt DESC';

    res.json(db.prepare(sql).all(...params));
});

// GET /api/admin/clients/:id
router.get('/:id', (req, res) => {
    const db = getDb();
    const client = db.prepare(`
        SELECT id, email, firstName, lastName, company, companySize, phone, address, city, country, postalCode,
               stripeCustomerId, salesforceLeadId, emailVerified, status, createdAt, updatedAt
        FROM clients WHERE id = ?
    `).get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const subscriptions = db.prepare(`
        SELECT s.*, p.name as productName FROM subscriptions s
        LEFT JOIN products p ON s.productId = p.id
        WHERE s.clientId = ?
    `).all(req.params.id);

    res.json({ ...client, subscriptions });
});

// PUT /api/admin/clients/:id
router.put('/:id', (req, res) => {
    const { firstName, lastName, company, companySize, phone, status } = req.body;
    const db = getDb();
    db.prepare(`
        UPDATE clients SET firstName = ?, lastName = ?, company = ?, companySize = ?, phone = ?, status = ?, updatedAt = datetime(?)
        WHERE id = ?
    `).run(firstName, lastName, company || null, companySize || null, phone || null, status, new Date().toISOString(), req.params.id);
    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.admin.id, 'admin', 'client_updated', { clientId: req.params.id, status }, req.ip);
    res.json({ success: true });
});

// DELETE /api/admin/clients/:id
router.delete('/:id', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM subscriptions WHERE clientId = ?').run(req.params.id);
    db.prepare('DELETE FROM payment_methods WHERE clientId = ?').run(req.params.id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    // M6: Audit log
    if (req.app.locals.logAudit) req.app.locals.logAudit(req.admin.id, 'admin', 'client_deleted', { clientId: req.params.id }, req.ip);
    res.json({ success: true });
});

module.exports = router;
