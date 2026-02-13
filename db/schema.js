const { getDb } = require('./connection');

function createTables() {
    const db = getDb();

    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            company TEXT,
            companySize TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            country TEXT,
            postalCode TEXT,
            stripeCustomerId TEXT,
            salesforceLeadId TEXT,
            emailVerified INTEGER DEFAULT 0,
            verificationToken TEXT,
            resetToken TEXT,
            resetTokenExpiry TEXT,
            status TEXT DEFAULT 'active',
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            shortDescription TEXT,
            fullDescription TEXT,
            benefits TEXT,
            gallery TEXT,
            plans TEXT NOT NULL,
            isActive INTEGER DEFAULT 1,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            clientId TEXT NOT NULL,
            productId TEXT NOT NULL,
            planKey TEXT NOT NULL,
            licenseCount INTEGER DEFAULT 1,
            status TEXT DEFAULT 'active',
            stripeSubscriptionId TEXT,
            zuoraAccountId TEXT,
            startDate TEXT DEFAULT (datetime('now')),
            endDate TEXT,
            cancelledAt TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (clientId) REFERENCES clients(id),
            FOREIGN KEY (productId) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS payment_methods (
            id TEXT PRIMARY KEY,
            clientId TEXT NOT NULL,
            stripePaymentMethodId TEXT NOT NULL,
            brand TEXT,
            last4 TEXT,
            expMonth INTEGER,
            expYear INTEGER,
            isDefault INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (clientId) REFERENCES clients(id)
        );

        CREATE TABLE IF NOT EXISTS blog_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS blog_articles (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            excerpt TEXT,
            content TEXT,
            coverImage TEXT,
            categoryId TEXT,
            authorId TEXT,
            status TEXT DEFAULT 'draft',
            publishedAt TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (categoryId) REFERENCES blog_categories(id),
            FOREIGN KEY (authorId) REFERENCES admin_users(id)
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            authorName TEXT NOT NULL,
            authorCompany TEXT,
            authorAvatar TEXT,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            content TEXT NOT NULL,
            isApproved INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS contact_submissions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'new',
            adminNotes TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS email_log (
            id TEXT PRIMARY KEY,
            toEmail TEXT NOT NULL,
            subject TEXT NOT NULL,
            templateName TEXT,
            status TEXT DEFAULT 'sent',
            error TEXT,
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            userId TEXT,
            userType TEXT,
            action TEXT NOT NULL,
            details TEXT,
            ipAddress TEXT,
            createdAt TEXT DEFAULT (datetime('now'))
        );
    `);

    console.log('Database tables created successfully');
}

module.exports = { createTables };
