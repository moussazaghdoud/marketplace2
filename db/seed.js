const { getDb } = require('./connection');
const { createTables } = require('./schema');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function seed() {
    createTables();
    const db = getDb();

    // Seed default admin user (or fix corrupted password hash)
    const hashedPassword = bcrypt.hashSync('Admin123!', 10);
    const existingAdmin = db.prepare('SELECT id, password FROM admin_users WHERE email = ?').get('admin@rainbow.ale.com');
    if (!existingAdmin) {
        db.prepare(`
            INSERT INTO admin_users (id, email, password, firstName, lastName, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), 'admin@rainbow.ale.com', hashedPassword, 'Admin', 'Rainbow', 'super_admin');
        console.log('Default admin user created: admin@rainbow.ale.com / Admin123!');
    } else {
        // Ensure the password hash is valid bcrypt
        try {
            bcrypt.compareSync('Admin123!', existingAdmin.password);
        } catch (e) {
            db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(hashedPassword, existingAdmin.id);
            console.log('Admin password hash repaired');
        }
    }

    // Seed default Rainbow product
    const existingProduct = db.prepare('SELECT id FROM products WHERE slug = ?').get('rainbow');
    if (!existingProduct) {
        const plans = JSON.stringify({
            essential: {
                name: 'Essential',
                subtitle: 'Pour démarrer',
                price: 'Gratuit',
                pricePerUser: 0,
                priceNote: 'jusqu\'à 15 utilisateurs',
                features: [
                    'Audio & Vidéo HD (1:1)',
                    'Messagerie instantanée',
                    'Partage de fichiers (1 Go)',
                    'Intégration calendrier',
                    'App mobile iOS & Android',
                    'Support communautaire'
                ],
                ctaText: 'Démarrer gratuitement',
                ctaLink: '#',
                highlighted: false,
                badge: '',
                stripePriceId: ''
            },
            business: {
                name: 'Business',
                subtitle: 'Le plus populaire',
                price: '€9.99',
                pricePerUser: 9.99,
                priceNote: '/utilisateur/mois',
                features: [
                    'Tout Essential +',
                    'Conférence jusqu\'à 100 participants',
                    'Enregistrement des réunions',
                    'Partage d\'écran avancé',
                    'Stockage 10 Go/utilisateur',
                    'Intégration CRM & Office 365',
                    'Support prioritaire 24/7',
                    'Administration centralisée'
                ],
                ctaText: 'Essai gratuit 30 jours',
                ctaLink: '#',
                highlighted: true,
                badge: 'Populaire',
                stripePriceId: process.env.STRIPE_PRICE_BUSINESS || ''
            },
            enterprise: {
                name: 'Enterprise',
                subtitle: 'Sur mesure',
                price: '€19.99',
                pricePerUser: 19.99,
                priceNote: '/utilisateur/mois',
                features: [
                    'Tout Business +',
                    'Conférence jusqu\'à 1000 participants',
                    'Webinaires & événements',
                    'Téléphonie cloud (SIP/PSTN)',
                    'Stockage illimité',
                    'API & SDK développeur',
                    'SLA 99.99% garanti',
                    'Customer Success Manager dédié',
                    'SSO & sécurité avancée'
                ],
                ctaText: 'Contacter les ventes',
                ctaLink: '#',
                highlighted: false,
                badge: '',
                stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || ''
            }
        });

        db.prepare(`
            INSERT INTO products (id, name, slug, shortDescription, fullDescription, benefits, gallery, plans)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            'Rainbow by ALE',
            'rainbow',
            'La plateforme de communication unifiée pour les entreprises modernes.',
            'Rainbow by Alcatel-Lucent Enterprise est une plateforme cloud de communication et de collaboration. Elle combine messagerie instantanée, appels audio/vidéo, conférences, partage de fichiers et intégrations métier dans une seule solution sécurisée.',
            JSON.stringify([
                'Communication unifiée tout-en-un',
                'Déploiement cloud rapide',
                'Sécurité de niveau entreprise',
                'Intégrations CRM & outils métier',
                'Évolutif de 5 à 10 000+ utilisateurs'
            ]),
            JSON.stringify([]),
            plans
        );
        console.log('Default Rainbow product seeded');
    }

    // Seed default blog categories
    const existingCat = db.prepare('SELECT id FROM blog_categories LIMIT 1').get();
    if (!existingCat) {
        const categories = [
            { name: 'Actualités', slug: 'actualites' },
            { name: 'Tutoriels', slug: 'tutoriels' },
            { name: 'Études de cas', slug: 'etudes-de-cas' },
            { name: 'Produit', slug: 'produit' }
        ];
        const stmt = db.prepare('INSERT INTO blog_categories (id, name, slug) VALUES (?, ?, ?)');
        for (const cat of categories) {
            stmt.run(uuidv4(), cat.name, cat.slug);
        }
        console.log('Default blog categories seeded');
    }

    console.log('Database seeding complete');
}

// Run if called directly
if (require.main === module) {
    seed();
    process.exit(0);
}

module.exports = { seed };
