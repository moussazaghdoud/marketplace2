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

        CREATE TABLE IF NOT EXISTS license_assignments (
            id TEXT PRIMARY KEY,
            subscriptionId TEXT NOT NULL,
            email TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            invitedAt TEXT DEFAULT (datetime('now')),
            acceptedAt TEXT,
            clientId TEXT,
            FOREIGN KEY (subscriptionId) REFERENCES subscriptions(id)
        );

        CREATE TABLE IF NOT EXISTS content_store (
            lang TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS industries (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            tagline TEXT,
            description TEXT,
            heroImage TEXT,
            icon TEXT,
            color TEXT,
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS industry_benefits (
            id TEXT PRIMARY KEY,
            industryId TEXT NOT NULL,
            category TEXT,
            title TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (industryId) REFERENCES industries(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS industry_value_props (
            id TEXT PRIMARY KEY,
            industryId TEXT NOT NULL,
            text TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (industryId) REFERENCES industries(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS industry_products (
            industryId TEXT NOT NULL,
            productId TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (industryId, productId),
            FOREIGN KEY (industryId) REFERENCES industries(id) ON DELETE CASCADE,
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS solutions (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            icon TEXT,
            linkUrl TEXT,
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        );
    `);

    // S2: Add indexes on frequently queried columns
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
        CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
        CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
        CREATE INDEX IF NOT EXISTS idx_products_isActive ON products(isActive);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_clientId ON subscriptions(clientId);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
        CREATE INDEX IF NOT EXISTS idx_blog_articles_slug ON blog_articles(slug);
        CREATE INDEX IF NOT EXISTS idx_blog_articles_status ON blog_articles(status);
        CREATE INDEX IF NOT EXISTS idx_blog_articles_categoryId ON blog_articles(categoryId);
        CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
        CREATE INDEX IF NOT EXISTS idx_audit_log_createdAt ON audit_log(createdAt);
        CREATE INDEX IF NOT EXISTS idx_industries_slug ON industries(slug);
        CREATE INDEX IF NOT EXISTS idx_industries_active ON industries(active);
        CREATE INDEX IF NOT EXISTS idx_solutions_slug ON solutions(slug);
        CREATE INDEX IF NOT EXISTS idx_solutions_active ON solutions(active);
        CREATE INDEX IF NOT EXISTS idx_industry_benefits_industryId ON industry_benefits(industryId);
        CREATE INDEX IF NOT EXISTS idx_industry_value_props_industryId ON industry_value_props(industryId);
        CREATE INDEX IF NOT EXISTS idx_license_assignments_subscriptionId ON license_assignments(subscriptionId);
        CREATE INDEX IF NOT EXISTS idx_license_assignments_email ON license_assignments(email);
    `);

    console.log('Database tables created successfully');
}

module.exports = { createTables };
