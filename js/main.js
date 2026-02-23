// Rainbow Portal — Main JS

var stripeInstance = null;
var cardNumberElement = null;
var cardExpiryElement = null;
var cardCvcElement = null;

document.addEventListener('DOMContentLoaded', function () {
    loadContent();
    initStripe();
});

// Listen for language changes → reload content
window.addEventListener('langchange', function () {
    loadContent();
});

// Initialize Stripe Elements
function initStripe() {
    fetch('/api/stripe-key')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.publishableKey) {
                console.warn('Stripe publishable key not configured.');
                return;
            }
            stripeInstance = Stripe(data.publishableKey);
            var elements = stripeInstance.elements();
            var elementStyle = {
                base: {
                    fontSize: '14px',
                    color: '#1f2937',
                    '::placeholder': { color: '#9ca3af' }
                }
            };

            cardNumberElement = elements.create('cardNumber', { style: elementStyle });
            cardExpiryElement = elements.create('cardExpiry', { style: elementStyle });
            cardCvcElement = elements.create('cardCvc', { style: elementStyle });

            cardNumberElement.mount('#card-number-element');
            cardExpiryElement.mount('#card-expiry-element');
            cardCvcElement.mount('#card-cvc-element');

            [cardNumberElement, cardExpiryElement, cardCvcElement].forEach(function (el) {
                el.on('change', function (event) {
                    var errorEl = document.getElementById('card-errors');
                    if (event.error) {
                        errorEl.textContent = event.error.message;
                        errorEl.classList.remove('hidden');
                    } else {
                        errorEl.textContent = '';
                        errorEl.classList.add('hidden');
                    }
                });
            });
        })
        .catch(function (err) {
            console.warn('Could not initialize Stripe:', err);
        });
}

// Load content from API and render (with lang param)
function loadContent() {
    var lang = window.i18n ? i18n.getLang() : 'en';
    var url = '/api/content' + (lang !== 'en' ? '?lang=' + lang : '');
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            renderHero(data.hero);
            renderValueProp(data.valueProp);
            renderHowItWorks(data.howItWorks);
            renderFeatures(data.features);
            renderVideo(data.video);
            renderScreenshots(data.screenshots);
            renderSolutions(data.solutions);
            renderPricing(data.pricing);
            renderAddOns(data.addOns);
            renderIndustries(data.industries);
            renderTrust(data.trust);
            renderPartners(data.partners);
            renderMarketplace(data.marketplace);
            renderFaq(data.faq);
            initFaqListeners();
            updatePrices();
        })
        .catch(function (err) {
            console.error('Failed to load content:', err);
        });
}

// Helper: get i18n string or fallback
function t(key, fallback) {
    return window.i18n ? i18n.t(key, fallback) : (fallback || key);
}

// --- Renderers ---

function renderHero(hero) {
    if (!hero) return;
    document.getElementById('hero-badge').textContent = hero.badge;
    document.getElementById('hero-title').innerHTML = hero.title;
    document.getElementById('hero-description').textContent = hero.description;
    document.getElementById('hero-cta-primary').textContent = hero.ctaPrimary;
    document.getElementById('hero-cta-secondary').textContent = hero.ctaSecondary;

    if (hero.image) {
        var heroImg = document.getElementById('hero-image');
        if (heroImg) heroImg.src = hero.image;
    }

    var badges = document.getElementById('hero-trust-badges');
    badges.innerHTML = '';
    hero.trustBadges.forEach(function (b) {
        var span = document.createElement('span');
        span.className = 'inline-flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-500';
        span.innerHTML = '<svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' + escapeHtml(b);
        badges.appendChild(span);
    });
}

function renderValueProp(valueProp) {
    if (!valueProp) return;
    var el = document.getElementById('value-prop-text');
    if (el) el.textContent = valueProp.text;
}

function renderHowItWorks(howItWorks) {
    if (!howItWorks) return;
    var heading = document.getElementById('how-heading');
    if (heading) heading.textContent = howItWorks.heading;

    var container = document.getElementById('how-steps');
    if (!container) return;
    container.innerHTML = '';

    var colors = ['brand-500', 'violet-500', 'emerald-500', 'amber-500'];
    var bgColors = ['brand-50', 'violet-50', 'emerald-50', 'amber-50'];

    howItWorks.steps.forEach(function (step, i) {
        var div = document.createElement('div');
        div.className = 'text-center relative z-10';
        div.innerHTML =
            '<div class="w-12 h-12 rounded-full bg-' + bgColors[i] + ' text-' + colors[i] + ' flex items-center justify-center mx-auto mb-4 text-lg font-bold border-2 border-' + colors[i] + '">' +
                step.number +
            '</div>' +
            '<h3 class="font-semibold text-gray-900 mb-1">' + escapeHtml(step.title) + '</h3>' +
            '<p class="text-sm text-gray-500">' + escapeHtml(step.description) + '</p>';
        container.appendChild(div);
    });
}

function renderFeatures(features) {
    if (!features) return;
    document.getElementById('features-heading').textContent = features.heading;
    document.getElementById('features-subheading').textContent = features.subheading;

    var grid = document.getElementById('features-grid');
    grid.innerHTML = '';

    var colorMap = {
        blue: { bg: 'bg-blue-50', text: 'text-brand-500' },
        violet: { bg: 'bg-violet-50', text: 'text-violet-500' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-500' },
        pink: { bg: 'bg-pink-50', text: 'text-pink-500' },
        cyan: { bg: 'bg-cyan-50', text: 'text-cyan-500' },
        red: { bg: 'bg-red-50', text: 'text-red-500' },
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-500' },
        teal: { bg: 'bg-teal-50', text: 'text-teal-500' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-500' }
    };

    features.items.forEach(function (f) {
        var colors = colorMap[f.iconBg] || colorMap.blue;
        var card = document.createElement('div');
        card.className = 'bg-white rounded-xl p-6 border border-gray-100 hover:shadow-md hover:border-brand-100 transition-all';
        card.innerHTML =
            '<div class="w-10 h-10 rounded-lg ' + colors.bg + ' ' + colors.text + ' flex items-center justify-center mb-4">' +
                '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="' + f.iconSvg + '"/></svg>' +
            '</div>' +
            '<h3 class="font-semibold text-gray-900 mb-1">' + escapeHtml(f.title) + '</h3>' +
            '<p class="text-sm text-gray-500 leading-relaxed">' + escapeHtml(f.description) + '</p>';
        grid.appendChild(card);
    });
}

function renderVideo(video) {
    if (!video) return;
    document.getElementById('video-heading').textContent = video.heading;
    document.getElementById('video-subheading').textContent = video.subheading;
    document.getElementById('video-iframe').src = video.youtubeUrl;
}

function renderScreenshots(screenshots) {
    if (!screenshots) return;
    var heading = document.getElementById('screenshots-heading');
    if (heading) heading.textContent = screenshots.heading || '';

    var grid = document.getElementById('screenshots-grid');
    if (!grid) return;
    grid.innerHTML = '';

    screenshots.items.forEach(function (s) {
        var div = document.createElement('div');
        div.className = 'text-center';
        div.innerHTML =
            '<img src="' + escapeHtml(s.image) + '" alt="' + escapeHtml(s.alt) + '" class="rounded-xl border border-gray-200 shadow-sm w-full mb-3">' +
            '<p class="text-sm font-medium text-gray-700">' + escapeHtml(s.label) + '</p>';
        grid.appendChild(div);
    });
}

function renderSolutions(solutions) {
    if (!solutions) return;
    var heading = document.getElementById('solutions-heading');
    var subheading = document.getElementById('solutions-subheading');
    if (heading) heading.textContent = solutions.heading;
    if (subheading) subheading.textContent = solutions.subheading;

    // Render filter buttons
    var filtersEl = document.getElementById('solutions-filters');
    if (filtersEl && solutions.categories) {
        filtersEl.innerHTML = '';
        solutions.categories.forEach(function (cat, i) {
            var btn = document.createElement('button');
            btn.className = 'sol-filter-btn px-4 py-1.5 rounded-full text-sm font-medium border border-gray-200 text-gray-600 hover:border-brand-500 hover:text-brand-500 transition-colors' + (i === 0 ? ' active bg-brand-500 !text-white !border-brand-500' : '');
            btn.textContent = cat;
            btn.onclick = function () {
                document.querySelectorAll('.sol-filter-btn').forEach(function (b) { b.classList.remove('active', 'bg-brand-500', '!text-white', '!border-brand-500'); });
                btn.classList.add('active', 'bg-brand-500', '!text-white', '!border-brand-500');
                filterSolutions(cat);
            };
            filtersEl.appendChild(btn);
        });
    }

    // Render solution cards
    var grid = document.getElementById('solutions-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var iconMap = {
        chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
        presentation: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z',
        code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
        server: 'M5 12H3l9-9 9 9h-2M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
        phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
        wifi: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0',
        building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
        shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
    };

    solutions.items.forEach(function (sol) {
        var card = document.createElement('a');
        card.href = sol.link || '#';
        card.className = 'sol-card bg-white rounded-xl p-5 border border-gray-100 hover:shadow-md hover:border-brand-200 transition-all group block';
        card.setAttribute('data-category', sol.category);
        card.setAttribute('data-visible', 'true');

        var iconPath = iconMap[sol.icon] || iconMap.chat;
        card.innerHTML =
            '<div class="w-10 h-10 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center mb-3 group-hover:bg-brand-100 transition-colors">' +
                '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="' + iconPath + '"/></svg>' +
            '</div>' +
            '<h3 class="font-semibold text-gray-900 text-sm mb-1">' + escapeHtml(sol.name) + '</h3>' +
            '<p class="text-xs text-gray-500 leading-relaxed">' + escapeHtml(sol.description) + '</p>' +
            '<span class="inline-block mt-3 text-xs font-medium text-brand-500 group-hover:underline">' + escapeHtml(sol.category) + '</span>';
        grid.appendChild(card);
    });
}

function filterSolutions(category) {
    document.querySelectorAll('.sol-card').forEach(function (card) {
        if (category === 'All' || card.getAttribute('data-category') === category) {
            card.setAttribute('data-visible', 'true');
            card.style.display = '';
        } else {
            card.setAttribute('data-visible', 'false');
            card.style.display = 'none';
        }
    });
}

function renderAddOns(addOns) {
    if (!addOns) return;
    var heading = document.getElementById('addons-heading');
    var subheading = document.getElementById('addons-subheading');
    if (heading) heading.textContent = addOns.heading;
    if (subheading) subheading.textContent = addOns.subheading;

    var grid = document.getElementById('addons-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var iconMap = {
        presentation: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z',
        building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
        code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'
    };

    addOns.items.forEach(function (addon) {
        var card = document.createElement('a');
        card.href = addon.link || '#';
        card.className = 'bg-white rounded-xl p-6 border-2 border-dashed border-gray-200 hover:border-brand-300 hover:shadow-md transition-all group block text-center';

        var iconPath = iconMap[addon.icon] || iconMap.code;
        card.innerHTML =
            '<div class="w-12 h-12 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-100 transition-colors">' +
                '<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="' + iconPath + '"/></svg>' +
            '</div>' +
            '<h3 class="font-semibold text-gray-900 mb-2">' + escapeHtml(addon.name) + '</h3>' +
            '<p class="text-sm text-gray-500 leading-relaxed">' + escapeHtml(addon.description) + '</p>' +
            '<span class="inline-flex items-center gap-1 mt-4 text-sm font-medium text-brand-500 group-hover:underline">Learn more <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></span>';
        grid.appendChild(card);
    });
}

function renderIndustries(industries) {
    if (!industries) return;
    var heading = document.getElementById('industries-heading');
    if (heading) heading.textContent = industries.heading;

    var grid = document.getElementById('industries-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var colorMap = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', hover: 'hover:border-blue-400' },
        red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', hover: 'hover:border-red-400' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', hover: 'hover:border-amber-400' },
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', hover: 'hover:border-indigo-400' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', hover: 'hover:border-emerald-400' }
    };

    var iconPaths = {
        'academic-cap': 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222',
        'heart': 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
        'building-office': 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
        'building-library': 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
        'truck': 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0'
    };

    industries.items.forEach(function (ind) {
        var c = colorMap[ind.color] || colorMap.blue;
        var tile = document.createElement('a');
        tile.href = '/industry/' + ind.slug;
        tile.className = 'flex flex-col items-center gap-3 p-5 rounded-xl border ' + c.border + ' ' + c.hover + ' ' + c.bg + ' transition-all hover:shadow-md group';

        var iconPath = iconPaths[ind.icon] || iconPaths['academic-cap'];
        tile.innerHTML =
            '<div class="w-10 h-10 rounded-lg bg-white ' + c.text + ' flex items-center justify-center shadow-sm">' +
                '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="' + iconPath + '"/></svg>' +
            '</div>' +
            '<span class="text-sm font-semibold text-gray-900">' + escapeHtml(ind.name) + '</span>';
        grid.appendChild(tile);
    });
}

function renderPricing(pricing) {
    var grid = document.getElementById('pricing-grid');
    if (!grid) return;

    document.getElementById('pricing-heading').textContent = pricing.heading;
    document.getElementById('pricing-subheading').textContent = pricing.subheading;

    window.PLANS = {};
    grid.innerHTML = '';

    var checkSvg = '<svg class="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';

    pricing.plans.forEach(function (p) {
        var planKey = p.name.toLowerCase().replace(/\s+/g, '-');
        window.PLANS[planKey] = { name: p.name, pricePerUser: p.pricePerUser, stripePriceId: 'price_REPLACE_ME_' + planKey.toUpperCase() };

        var card = document.createElement('div');
        var borderClass = p.highlighted ? 'border-2 border-brand-500 relative shadow-lg shadow-brand-500/10' : 'border border-gray-200';
        card.className = 'rounded-xl ' + borderClass + ' p-7 bg-white';

        var badgeHtml = (p.highlighted && p.badge) ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-brand-500 text-white text-xs font-medium rounded-full">' + escapeHtml(p.badge) + '</span>' : '';

        var priceHtml;
        if (p.pricePerUser === 0) {
            priceHtml = '<p class="text-4xl font-bold text-gray-900 mb-1">' + escapeHtml(p.price) + '</p>';
        } else {
            priceHtml =
                '<div class="flex items-baseline gap-0.5 mb-1">' +
                    '<span class="text-sm text-gray-400">&euro;</span>' +
                    '<span class="text-4xl font-bold text-gray-900">' + escapeHtml(p.price) + '</span>' +
                '</div>';
        }

        var totalHtml = '';
        if (p.pricePerUser > 0) {
            totalHtml = '<p class="text-xs text-brand-600 font-medium mb-6" id="' + planKey + '-total"></p>';
        }

        var ctaHtml;
        if (p.pricePerUser === 0) {
            ctaHtml = '<button onclick="checkout(\'' + planKey + '\')" class="w-full py-2.5 rounded-lg border border-brand-500 text-brand-600 text-sm font-medium hover:bg-blue-50 transition-colors">' + escapeHtml(p.ctaText) + '</button>';
        } else if (p.highlighted) {
            ctaHtml = '<button onclick="checkout(\'' + planKey + '\')" class="w-full py-2.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors">' + escapeHtml(p.ctaText) + '</button>';
        } else {
            ctaHtml = '<button onclick="checkout(\'' + planKey + '\')" class="w-full py-2.5 rounded-lg border border-brand-500 text-brand-600 text-sm font-medium hover:bg-blue-50 transition-colors">' + escapeHtml(p.ctaText) + '</button>';
        }

        var featuresHtml = p.features.map(function (feat) {
            return '<li class="flex items-center gap-2">' + checkSvg + ' ' + escapeHtml(feat) + '</li>';
        }).join('');

        card.innerHTML = badgeHtml +
            '<h3 class="font-semibold text-gray-900">' + escapeHtml(p.name) + '</h3>' +
            '<p class="text-xs text-gray-400 mt-1 mb-5">' + escapeHtml(p.subtitle) + '</p>' +
            priceHtml +
            '<p class="text-xs text-gray-400 mb-1">' + escapeHtml(p.priceNote) + '</p>' +
            totalHtml +
            ctaHtml +
            '<ul class="mt-6 space-y-2.5 text-sm text-gray-500">' + featuresHtml + '</ul>';

        grid.appendChild(card);
    });
}

function renderTrust(trust) {
    if (!trust) return;
    var grid = document.getElementById('trust-grid');
    if (!grid) return;
    grid.innerHTML = '';
    trust.items.forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'text-center';
        div.innerHTML =
            '<p class="text-2xl font-bold text-gray-900">' + escapeHtml(item.value) + '</p>' +
            '<p class="text-xs text-gray-400 mt-1">' + escapeHtml(item.label) + '</p>';
        grid.appendChild(div);
    });
}

function renderPartners(partners) {
    if (!partners) return;

    var heading = document.getElementById('partners-heading');
    var subheading = document.getElementById('partners-subheading');
    if (heading) heading.textContent = partners.heading;
    if (subheading) subheading.textContent = partners.subheading;

    // Stats
    var statsEl = document.getElementById('partners-stats');
    if (statsEl) {
        statsEl.innerHTML = '';
        partners.stats.forEach(function (s) {
            var div = document.createElement('div');
            div.className = 'text-center';
            div.innerHTML =
                '<p class="text-2xl font-bold text-brand-500">' + escapeHtml(s.value) + '</p>' +
                '<p class="text-xs text-gray-500 mt-0.5">' + escapeHtml(s.label) + '</p>';
            statsEl.appendChild(div);
        });
    }

    // Tiers
    var tiersEl = document.getElementById('partners-tiers');
    if (tiersEl) {
        tiersEl.innerHTML = '';
        var tierColors = {
            gray: { border: 'border-gray-300', bg: 'bg-gray-50', badge: 'bg-gray-200 text-gray-700', accent: 'text-gray-600' },
            amber: { border: 'border-amber-400', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', accent: 'text-amber-600' },
            violet: { border: 'border-violet-400', bg: 'bg-violet-50', badge: 'bg-violet-100 text-violet-700', accent: 'text-violet-600' }
        };
        var checkSvg = '<svg class="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';

        partners.tiers.forEach(function (tier) {
            var c = tierColors[tier.color] || tierColors.gray;
            var card = document.createElement('div');
            card.className = 'rounded-xl border-2 ' + c.border + ' ' + c.bg + ' p-6 relative';

            var benefitsHtml = tier.benefits.map(function (b) {
                return '<li class="flex items-start gap-2 text-sm text-gray-600">' + checkSvg + ' ' + escapeHtml(b) + '</li>';
            }).join('');

            card.innerHTML =
                '<span class="inline-block px-3 py-1 rounded-full text-xs font-semibold ' + c.badge + ' mb-3">' + escapeHtml(tier.name) + '</span>' +
                '<p class="text-xs text-gray-400 mb-4">' + escapeHtml(tier.requirement) + '</p>' +
                '<ul class="space-y-2">' + benefitsHtml + '</ul>';
            tiersEl.appendChild(card);
        });
    }

    // Tools
    var toolsEl = document.getElementById('partners-tools');
    if (toolsEl) {
        toolsEl.innerHTML = '';
        var toolIcons = {
            briefcase: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
            gift: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
            shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
            cog: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
            megaphone: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
            academic: 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222'
        };

        partners.tools.forEach(function (tool) {
            var iconPath = toolIcons[tool.icon] || toolIcons.briefcase;
            var card = document.createElement('div');
            card.className = 'flex gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-sm transition-all';
            card.innerHTML =
                '<div class="w-10 h-10 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">' +
                    '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="' + iconPath + '"/></svg>' +
                '</div>' +
                '<div>' +
                    '<h4 class="text-sm font-semibold text-gray-900">' + escapeHtml(tool.title) + '</h4>' +
                    '<p class="text-xs text-gray-500 mt-0.5 leading-relaxed">' + escapeHtml(tool.description) + '</p>' +
                '</div>';
            toolsEl.appendChild(card);
        });
    }

    // CTAs
    var ctaPrimary = document.getElementById('partners-cta-primary');
    var ctaSecondary = document.getElementById('partners-cta-secondary');
    if (ctaPrimary) ctaPrimary.textContent = partners.ctaPrimary;
    if (ctaSecondary) ctaSecondary.textContent = partners.ctaSecondary;
}

function renderMarketplace(marketplace) {
    if (!marketplace) return;
    var heading = document.getElementById('marketplace-heading');
    var subheading = document.getElementById('marketplace-subheading');
    var cta = document.getElementById('marketplace-cta');
    if (heading) heading.textContent = marketplace.heading;
    if (subheading) subheading.textContent = marketplace.subheading;
    if (cta) cta.textContent = marketplace.ctaText;

    var featured = document.getElementById('marketplace-featured');
    if (!featured) return;
    featured.innerHTML = '';

    marketplace.featured.forEach(function (item) {
        var chip = document.createElement('span');
        chip.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-lg text-sm text-white font-medium';
        chip.innerHTML =
            '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>' +
            escapeHtml(item.name);
        featured.appendChild(chip);
    });
}

function renderFaq(faq) {
    if (!faq) return;
    document.getElementById('faq-heading').textContent = faq.heading;
    var list = document.getElementById('faq-list');
    list.innerHTML = '';
    faq.items.forEach(function (f) {
        var item = document.createElement('div');
        item.className = 'faq-item border border-gray-200 rounded-lg overflow-hidden bg-white';
        item.innerHTML =
            '<button class="faq-toggle w-full flex items-center justify-between px-5 py-4 text-left">' +
                '<span class="text-sm font-medium text-gray-900">' + escapeHtml(f.question) + '</span>' +
                '<svg class="faq-icon w-4 h-4 text-gray-400 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>' +
            '</button>' +
            '<div class="faq-content hidden px-5 pb-4">' +
                '<p class="text-sm text-gray-500">' + escapeHtml(f.answer) + '</p>' +
            '</div>';
        list.appendChild(item);
    });
}

function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// --- FAQ interactivity ---
function initFaqListeners() {
    document.querySelectorAll('.faq-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var item = btn.closest('.faq-item');
            var wasActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(function (el) { el.classList.remove('active'); });
            if (!wasActive) item.classList.add('active');
        });
    });
}

// --- Mobile menu ---
var mobileMenuBtn = document.getElementById('mobile-menu-btn');
var mobileMenu = document.getElementById('mobile-menu');

if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', function () {
        mobileMenu.classList.toggle('hidden');
    });
    mobileMenu.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () { mobileMenu.classList.add('hidden'); });
    });
}

// --- Pricing ---
function getLicenseCount() {
    var input = document.getElementById('license-count');
    if (!input) return 1;
    var val = parseInt(input.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 1000) val = 1000;
    input.value = val;
    return val;
}

function adjustLicenses(delta) {
    var input = document.getElementById('license-count');
    if (!input) return;
    var val = parseInt(input.value, 10) + delta;
    if (val < 1) val = 1;
    if (val > 1000) val = 1000;
    input.value = val;
    updatePrices();
}

function updatePrices() {
    if (!window.PLANS || !document.getElementById('license-count')) return;
    var count = getLicenseCount();
    var suffix = t('home.perMonthTotal', '/mo total');
    Object.keys(window.PLANS).forEach(function (key) {
        var plan = window.PLANS[key];
        if (plan.pricePerUser > 0) {
            var el = document.getElementById(key + '-total');
            if (el) el.textContent = '\u20AC' + (plan.pricePerUser * count).toFixed(2) + suffix;
        }
    });
}

// --- Checkout modal ---
var selectedPlan = null;

function checkout(planKey) {
    var count = getLicenseCount();
    window.location.href = '/login?plan=' + encodeURIComponent(planKey) + '&licenses=' + count;
}

function closeCheckout() {
    var modal = document.getElementById('checkout-modal');
    modal.classList.add('hidden');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCheckout(); });

function handlePayment() {
    var email = document.getElementById('checkout-email').value.trim();
    if (!email || !email.includes('@')) {
        showCardError(t('checkout.invalidEmail', 'Please enter a valid email address.'));
        return;
    }
    if (!stripeInstance || !cardNumberElement) {
        showCardError(t('checkout.notReady', 'Payment system not ready. Please refresh and try again.'));
        return;
    }

    var count = getLicenseCount();
    var planKey = selectedPlan ? Object.keys(window.PLANS).find(function (k) { return window.PLANS[k] === selectedPlan; }) : null;
    if (!planKey) {
        showCardError(t('checkout.noPlan', 'No plan selected.'));
        return;
    }

    var btn = document.getElementById('checkout-submit');
    btn.disabled = true;
    btn.textContent = t('checkout.processing', 'Processing\u2026');

    fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, planKey: planKey, licenseCount: count })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.error) throw new Error(data.error);
        return stripeInstance.confirmCardPayment(data.clientSecret, {
            payment_method: { card: cardNumberElement, billing_details: { email: email } }
        });
    })
    .then(function (result) {
        if (result.error) throw new Error(result.error.message);
        showPaymentSuccess(email, count);
    })
    .catch(function (err) {
        showCardError(err.message || t('checkout.paymentFailed', 'Payment failed. Please try again.'));
        resetBtn();
    });
}

function showPaymentSuccess(email, licenseCount) {
    var total = (selectedPlan.pricePerUser * licenseCount).toFixed(2);
    var modalContent = document.querySelector('#checkout-modal .bg-white');
    modalContent.innerHTML =
        '<div class="text-center py-4">' +
            '<div class="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">' +
                '<svg class="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' +
            '</div>' +
            '<h3 class="text-xl font-bold text-gray-900 mb-1">' + t('checkout.successTitle', 'Subscription active!') + '</h3>' +
            '<p class="text-sm text-gray-500 mb-6">' + t('checkout.successDescription', 'Your payment was processed successfully.') + '</p>' +
            '<button onclick="closeCheckout()" class="w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors">' + t('checkout.close', 'Close') + '</button>' +
        '</div>';
}

function resetBtn() {
    var btn = document.getElementById('checkout-submit');
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = t('checkout.submitBtn', 'Subscribe & Pay');
    btn.classList.remove('bg-green-500');
    btn.classList.add('bg-brand-500', 'hover:bg-brand-600');
}

function showCardError(msg) {
    var el = document.getElementById('card-errors');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 4000);
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
        var target = document.querySelector(this.getAttribute('href'));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
    });
});
