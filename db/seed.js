const { getDb } = require('./connection');
const { createTables } = require('./schema');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

function seed() {
    createTables();
    const db = getDb();

    // Seed default admin user
    const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE email = ?').get('admin@rainbow.ale.com');
    if (!existingAdmin) {
        const hashedPassword = bcrypt.hashSync('Admin123!', 10);
        db.prepare(`
            INSERT INTO admin_users (id, email, password, firstName, lastName, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), 'admin@rainbow.ale.com', hashedPassword, 'Admin', 'Rainbow', 'super_admin');
        console.log('Default admin user created: admin@rainbow.ale.com / Admin123!');
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

    // Seed Rainbow Webinar product
    const existingWebinar = db.prepare('SELECT id FROM products WHERE slug = ?').get('webinar');
    if (!existingWebinar) {
        db.prepare(`
            INSERT INTO products (id, name, slug, shortDescription, fullDescription, benefits, gallery, plans)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            'Rainbow Webinar',
            'webinar',
            'Professional webinar platform for hosting large-scale online events with up to 10,000 participants.',
            'Rainbow Webinar by Alcatel-Lucent Enterprise is a professional webinar solution for hosting large-scale online events, product demos, training sessions, and town halls with interactive Q&A, polls, and analytics.',
            JSON.stringify([
                'Up to 10,000 participants',
                'Interactive Q&A and polls',
                'HD video streaming',
                'Recording and replay',
                'Advanced analytics and reporting'
            ]),
            JSON.stringify([]),
            JSON.stringify({})
        );
        console.log('Rainbow Webinar product seeded');
    }

    // Seed Rainbow Smart Hotel product
    const existingHotel = db.prepare('SELECT id FROM products WHERE slug = ?').get('smart-hotel');
    if (!existingHotel) {
        db.prepare(`
            INSERT INTO products (id, name, slug, shortDescription, fullDescription, benefits, gallery, plans)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            'Rainbow Smart Hotel',
            'smart-hotel',
            'AI-powered guest experience platform with voice concierge and seamless hotel operations.',
            'Rainbow Smart Hotel by Alcatel-Lucent Enterprise is an AI-powered hospitality solution featuring voice concierge, room service management, real-time staff communication, and seamless integration with hotel property management systems.',
            JSON.stringify([
                'AI voice concierge',
                'Room service management',
                'Real-time staff communication',
                'Guest experience analytics',
                'PMS integration'
            ]),
            JSON.stringify([]),
            JSON.stringify({})
        );
        console.log('Rainbow Smart Hotel product seeded');
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

    // Seed industries
    const existingIndustry = db.prepare('SELECT id FROM industries LIMIT 1').get();
    if (!existingIndustry) {
        const insertIndustry = db.prepare('INSERT INTO industries (id, slug, name, tagline, description, heroImage, icon, color, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
        const insertValueProp = db.prepare('INSERT INTO industry_value_props (id, industryId, text, sort_order) VALUES (?, ?, ?, ?)');
        const insertBenefit = db.prepare('INSERT INTO industry_benefits (id, industryId, category, title, description, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');

        const industries = [
            {
                slug: 'education', name: 'Education', tagline: 'Connect classrooms, campuses and communities',
                description: 'Rainbow empowers educational institutions with unified communication tools that enhance learning, streamline administration and keep students, teachers and parents connected.',
                icon: 'academic-cap', color: 'blue', sort_order: 1,
                valueProps: [
                    'Virtual classrooms with HD video for up to 1,000 participants',
                    'Secure messaging between students, faculty and parents',
                    'Integration with LMS platforms (Moodle, Canvas, Blackboard)',
                    'Campus-wide emergency notification system'
                ],
                benefits: [
                    { cat: 'For Students', title: 'Flexible Learning', desc: 'Join classes from anywhere with HD video and screen sharing.', icon: 'device-mobile' },
                    { cat: 'For Students', title: 'Group Collaboration', desc: 'Team projects made easy with persistent chat rooms and file sharing.', icon: 'users' },
                    { cat: 'For Faculty', title: 'Office Hours Online', desc: 'Schedule and host virtual office hours with click-to-call.', icon: 'clock' },
                    { cat: 'For Faculty', title: 'Lecture Recording', desc: 'Record and share lectures automatically for review.', icon: 'video-camera' },
                    { cat: 'For IT & Admin', title: 'Centralized Management', desc: 'Manage thousands of users with role-based administration.', icon: 'cog' },
                    { cat: 'For IT & Admin', title: 'Data Compliance', desc: 'FERPA and GDPR compliant with end-to-end encryption.', icon: 'shield-check' }
                ]
            },
            {
                slug: 'healthcare', name: 'Healthcare', tagline: 'Secure communication for better patient outcomes',
                description: 'Rainbow provides HIPAA-ready communication tools that connect care teams, streamline clinical workflows and improve patient engagement across hospitals and clinics.',
                icon: 'heart', color: 'red', sort_order: 2,
                valueProps: [
                    'HIPAA-compliant messaging and video consultations',
                    'Integration with EHR/EMR systems (Epic, Cerner)',
                    'Real-time care team coordination across departments',
                    'Patient engagement portal with appointment reminders'
                ],
                benefits: [
                    { cat: 'For Clinicians', title: 'Telehealth Ready', desc: 'Conduct secure video consultations with patients from any device.', icon: 'video-camera' },
                    { cat: 'For Clinicians', title: 'Care Coordination', desc: 'Instant messaging with specialists for faster diagnoses.', icon: 'chat' },
                    { cat: 'For Patients', title: 'Virtual Visits', desc: 'Access healthcare from home with easy-to-use video calls.', icon: 'device-mobile' },
                    { cat: 'For Patients', title: 'Secure Messaging', desc: 'Message your care team securely about prescriptions and follow-ups.', icon: 'lock-closed' },
                    { cat: 'For IT & Admin', title: 'Compliance Built-In', desc: 'HIPAA, GDPR and SOC 2 compliance with audit logging.', icon: 'shield-check' },
                    { cat: 'For IT & Admin', title: 'EHR Integration', desc: 'Click-to-call from patient records with context-aware routing.', icon: 'link' }
                ]
            },
            {
                slug: 'hospitality', name: 'Hospitality', tagline: 'Elevate guest experience with smart communication',
                description: 'Rainbow transforms hotel operations with AI-powered guest services, real-time staff coordination and seamless integration with property management systems.',
                icon: 'building-office', color: 'amber', sort_order: 3,
                valueProps: [
                    'AI voice concierge for 24/7 guest assistance',
                    'Real-time housekeeping and maintenance coordination',
                    'PMS integration (Opera, Mews, Cloudbeds)',
                    'Guest satisfaction analytics and feedback collection'
                ],
                benefits: [
                    { cat: 'For Guests', title: 'Digital Concierge', desc: 'AI-powered room assistant for room service, info and requests.', icon: 'sparkles' },
                    { cat: 'For Guests', title: 'Seamless Check-in', desc: 'Mobile check-in and digital room keys via the hotel app.', icon: 'device-mobile' },
                    { cat: 'For Staff', title: 'Task Management', desc: 'Real-time task assignment and tracking for housekeeping.', icon: 'clipboard-list' },
                    { cat: 'For Staff', title: 'Instant Communication', desc: 'Push-to-talk and group messaging across all departments.', icon: 'chat' },
                    { cat: 'For Management', title: 'Revenue Insights', desc: 'Analytics on upsell opportunities and guest preferences.', icon: 'chart-bar' },
                    { cat: 'For Management', title: 'Multi-Property', desc: 'Manage communication across multiple properties from one dashboard.', icon: 'office-building' }
                ]
            },
            {
                slug: 'government', name: 'Government', tagline: 'Secure and sovereign communication for public services',
                description: 'Rainbow delivers sovereign-grade communication tools for government agencies with end-to-end encryption, on-premise deployment options and compliance with national security standards.',
                icon: 'building-library', color: 'indigo', sort_order: 4,
                valueProps: [
                    'Sovereign cloud or on-premise deployment options',
                    'End-to-end encryption meeting national security standards',
                    'Interoperability with existing government IT infrastructure',
                    'Citizen engagement portal for public services'
                ],
                benefits: [
                    { cat: 'For Officials', title: 'Secure Meetings', desc: 'Classified-level video conferencing with encryption.', icon: 'lock-closed' },
                    { cat: 'For Officials', title: 'Cross-Agency Collaboration', desc: 'Federated communication across departments and agencies.', icon: 'globe' },
                    { cat: 'For Citizens', title: 'Digital Services', desc: 'Video appointments with government offices from home.', icon: 'video-camera' },
                    { cat: 'For Citizens', title: 'Emergency Alerts', desc: 'Mass notification system for public safety communications.', icon: 'bell' },
                    { cat: 'For IT', title: 'Data Sovereignty', desc: 'Data stays in-country with on-premise or sovereign cloud hosting.', icon: 'server' },
                    { cat: 'For IT', title: 'Standards Compliance', desc: 'SecNumCloud, ISO 27001 and national security certifications.', icon: 'shield-check' }
                ]
            },
            {
                slug: 'transportation', name: 'Transportation', tagline: 'Keep operations moving with real-time communication',
                description: 'Rainbow connects transportation teams across vehicles, stations and control centers with reliable real-time communication, dispatch coordination and passenger information systems.',
                icon: 'truck', color: 'emerald', sort_order: 5,
                valueProps: [
                    'Real-time dispatch communication across fleets',
                    'Integration with SCADA and operations control systems',
                    'Passenger information and emergency broadcast systems',
                    'Mobile-first design for field workers and drivers'
                ],
                benefits: [
                    { cat: 'For Operations', title: 'Dispatch Center', desc: 'Real-time communication between control room and field teams.', icon: 'radio' },
                    { cat: 'For Operations', title: 'Fleet Coordination', desc: 'Group communication channels organized by route and zone.', icon: 'map' },
                    { cat: 'For Passengers', title: 'Live Updates', desc: 'Real-time service announcements and delay notifications.', icon: 'bell' },
                    { cat: 'For Passengers', title: 'Safety Alerts', desc: 'Emergency communication to passengers and staff simultaneously.', icon: 'exclamation-triangle' },
                    { cat: 'For Management', title: 'Analytics Dashboard', desc: 'Communication logs and response time metrics for optimization.', icon: 'chart-bar' },
                    { cat: 'For Management', title: 'Multi-Modal Support', desc: 'Unified communication across bus, rail, air and maritime.', icon: 'switch-horizontal' }
                ]
            }
        ];

        for (const ind of industries) {
            const industryId = uuidv4();
            insertIndustry.run(industryId, ind.slug, ind.name, ind.tagline, ind.description, ind.heroImage || '', ind.icon, ind.color, ind.sort_order);
            ind.valueProps.forEach((text, i) => {
                insertValueProp.run(uuidv4(), industryId, text, i + 1);
            });
            ind.benefits.forEach((b, i) => {
                insertBenefit.run(uuidv4(), industryId, b.cat, b.title, b.desc, b.icon, i + 1);
            });
        }
        console.log('Industries seeded (5 industries with benefits and value props)');
    }

    // Seed solutions
    const existingSolution = db.prepare('SELECT id FROM solutions LIMIT 1').get();
    if (!existingSolution) {
        const insertSolution = db.prepare('INSERT INTO solutions (id, slug, name, description, category, icon, linkUrl, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)');
        const solutions = [
            { slug: 'rainbow-collaboration', name: 'Rainbow Collaboration', desc: 'Unified team messaging, HD video conferencing and file sharing for enterprises of all sizes.', category: 'Digital Age Communications', icon: 'chat-bubble-left-right', link: '/product/rainbow', sort: 1 },
            { slug: 'rainbow-webinar', name: 'Rainbow Webinar', desc: 'Host interactive webinars and virtual events for up to 10,000 participants with Q&A and analytics.', category: 'Digital Age Communications', icon: 'presentation-chart-bar', link: '/product/webinar', sort: 2 },
            { slug: 'rainbow-cpaas', name: 'Rainbow CPaaS', desc: 'Embed real-time communication (voice, video, messaging) into your applications via APIs and SDKs.', category: 'Digital Age Communications', icon: 'code-bracket', link: '#', sort: 3 },
            { slug: 'oxo-connect', name: 'OXO Connect', desc: 'All-in-one communication server for SMBs — telephony, unified messaging and mobility in a single box.', category: 'Digital Age Networking', icon: 'server', link: '#', sort: 4 },
            { slug: 'omnipcx-enterprise', name: 'OmniPCX Enterprise', desc: 'Enterprise-grade IP telephony platform supporting up to 100,000 users with advanced call center features.', category: 'Digital Age Networking', icon: 'phone', link: '#', sort: 5 },
            { slug: 'omniswitch', name: 'OmniSwitch', desc: 'Intelligent LAN switches with built-in security, IoT support and simplified network management.', category: 'Digital Age Networking', icon: 'wifi', link: '#', sort: 6 },
            { slug: 'rainbow-smart-hotel', name: 'Rainbow Smart Hotel', desc: 'AI-powered guest experience platform with voice concierge and seamless hotel operations management.', category: 'Business Continuity', icon: 'building-office-2', link: '/product/smart-hotel', sort: 7 },
            { slug: 'rainbow-emergency', name: 'Rainbow Emergency', desc: 'Mass notification and crisis communication platform for business continuity and emergency response.', category: 'Business Continuity', icon: 'shield-exclamation', link: '#', sort: 8 }
        ];
        solutions.forEach(s => {
            insertSolution.run(uuidv4(), s.slug, s.name, s.desc, s.category, s.icon, s.link, s.sort);
        });
        console.log('Solutions seeded (8 solutions across 3 categories)');
    }

    // Seed content_store from JSON files (only if row doesn't exist yet)
    try {
        const contentDir = path.join(__dirname, '..', 'data');
        const existingContent = db.prepare('SELECT lang FROM content_store LIMIT 1').get();
        if (!existingContent && fs.existsSync(contentDir)) {
            const insertContent = db.prepare('INSERT OR IGNORE INTO content_store (lang, data) VALUES (?, ?)');
            const files = fs.readdirSync(contentDir).filter(f => f.startsWith('content') && f.endsWith('.json'));
            for (const file of files) {
                const lang = file === 'content.json' ? 'en' : file.replace('content.', '').replace('.json', '');
                try {
                    const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
                    JSON.parse(raw); // validate JSON
                    insertContent.run(lang, raw);
                    console.log('[Seed] Content loaded for lang:', lang);
                } catch (e) {
                    console.error('[Seed] Failed to load', file, e.message);
                }
            }
        }
    } catch (e) {
        console.error('[Seed] Content store seeding error:', e.message);
    }

    console.log('Database seeding complete');
}

// Run if called directly
if (require.main === module) {
    seed();
    process.exit(0);
}

module.exports = { seed };
