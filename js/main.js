// Rainbow Portal — Main JS

var stripeInstance = null;
var cardNumberElement = null;
var cardExpiryElement = null;
var cardCvcElement = null;

document.addEventListener('DOMContentLoaded', function () {
    loadContent();
    initStripe();
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

            // Show real-time validation errors from any element
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

// Load content from API and render
function loadContent() {
    fetch('/api/content')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            renderHero(data.hero);
            renderFeatures(data.features);
            renderVideo(data.video);
            renderScreenshots(data.screenshots);
            renderPricing(data.pricing);
            renderTrust(data.trust);
            renderFaq(data.faq);
            initFaqListeners();
            updatePrices();
        })
        .catch(function (err) {
            console.error('Failed to load content:', err);
        });
}

// --- Renderers ---

function renderHero(hero) {
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
        span.textContent = b;
        badges.appendChild(span);
    });
}

function renderFeatures(features) {
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
        card.className = 'bg-white rounded-xl p-6 border border-gray-100';
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

function renderPricing(pricing) {
    document.getElementById('pricing-heading').textContent = pricing.heading;
    document.getElementById('pricing-subheading').textContent = pricing.subheading;

    // Store plans globally for checkout
    window.PLANS = {};
    var grid = document.getElementById('pricing-grid');
    grid.innerHTML = '';

    var checkSvg = '<svg class="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';

    pricing.plans.forEach(function (p, i) {
        var planKey = p.name.toLowerCase().replace(/\s+/g, '-');
        window.PLANS[planKey] = { name: p.name, pricePerUser: p.pricePerUser, stripePriceId: 'price_REPLACE_ME_' + planKey.toUpperCase() };

        var card = document.createElement('div');
        var borderClass = p.highlighted ? 'border-2 border-brand-500 relative' : 'border border-gray-200';
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
        if (p.pricePerUser === 0 && !p.ctaLink) {
            ctaHtml = '<button onclick="openOnboarding()" class="w-full py-2.5 rounded-lg border border-brand-500 text-brand-600 text-sm font-medium hover:bg-blue-50 transition-colors">' + escapeHtml(p.ctaText) + '</button>';
        } else if (p.ctaLink) {
            ctaHtml = '<a href="' + p.ctaLink + '" target="_blank" class="block text-center py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-brand-500 hover:text-brand-600 transition-colors">' + escapeHtml(p.ctaText) + '</a>';
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
    var grid = document.getElementById('trust-grid');
    grid.innerHTML = '';
    trust.items.forEach(function (t) {
        var div = document.createElement('div');
        div.innerHTML =
            '<p class="text-2xl font-bold text-gray-900">' + escapeHtml(t.value) + '</p>' +
            '<p class="text-xs text-gray-400 mt-1">' + escapeHtml(t.label) + '</p>';
        grid.appendChild(div);
    });
}

function renderFaq(faq) {
    document.getElementById('faq-heading').textContent = faq.heading;
    var list = document.getElementById('faq-list');
    list.innerHTML = '';
    faq.items.forEach(function (f) {
        var item = document.createElement('div');
        item.className = 'faq-item border border-gray-200 rounded-lg overflow-hidden';
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

mobileMenuBtn.addEventListener('click', function () {
    mobileMenu.classList.toggle('hidden');
});
mobileMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () { mobileMenu.classList.add('hidden'); });
});

// --- Pricing ---
function getLicenseCount() {
    var input = document.getElementById('license-count');
    var val = parseInt(input.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 1000) val = 1000;
    input.value = val;
    return val;
}

function adjustLicenses(delta) {
    var input = document.getElementById('license-count');
    var val = parseInt(input.value, 10) + delta;
    if (val < 1) val = 1;
    if (val > 1000) val = 1000;
    input.value = val;
    updatePrices();
}

function updatePrices() {
    if (!window.PLANS) return;
    var count = getLicenseCount();
    Object.keys(window.PLANS).forEach(function (key) {
        var plan = window.PLANS[key];
        if (plan.pricePerUser > 0) {
            var el = document.getElementById(key + '-total');
            if (el) el.textContent = '\u20AC' + (plan.pricePerUser * count).toFixed(2) + '/mo total';
        }
    });
}

// --- Checkout modal ---
var selectedPlan = null;

function checkout(planKey) {
    selectedPlan = window.PLANS[planKey];
    if (!selectedPlan) return;
    var count = getLicenseCount();
    var total = (selectedPlan.pricePerUser * count).toFixed(2);

    document.getElementById('checkout-plan-name').textContent = selectedPlan.name;
    document.getElementById('checkout-licenses').textContent = count + ' user' + (count > 1 ? 's' : '');
    document.getElementById('checkout-unit-price').textContent = '\u20AC' + selectedPlan.pricePerUser.toFixed(2) + '/mo';
    document.getElementById('checkout-total').textContent = '\u20AC' + total + '/mo';
    document.getElementById('checkout-summary').textContent = selectedPlan.name + ' \u2014 ' + count + ' license' + (count > 1 ? 's' : '');

    var modal = document.getElementById('checkout-modal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCheckout() {
    var modal = document.getElementById('checkout-modal');
    modal.classList.add('hidden');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCheckout(); });

// Payment handler — real Stripe integration
function handlePayment() {
    var email = document.getElementById('checkout-email').value.trim();
    if (!email || !email.includes('@')) {
        showCardError('Please enter a valid email address.');
        return;
    }
    if (!stripeInstance || !cardNumberElement) {
        showCardError('Payment system not ready. Please refresh and try again.');
        return;
    }

    var count = getLicenseCount();
    var planKey = selectedPlan ? Object.keys(window.PLANS).find(function (k) { return window.PLANS[k] === selectedPlan; }) : null;
    if (!planKey) {
        showCardError('No plan selected.');
        return;
    }

    var btn = document.getElementById('checkout-submit');
    btn.disabled = true;
    btn.textContent = 'Processing\u2026';

    // 1. Create subscription on the server
    fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, planKey: planKey, licenseCount: count })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.error) {
            throw new Error(data.error);
        }
        // 2. Confirm card payment with Stripe
        return stripeInstance.confirmCardPayment(data.clientSecret, {
            payment_method: {
                card: cardNumberElement,
                billing_details: { email: email }
            }
        });
    })
    .then(function (result) {
        if (result.error) {
            throw new Error(result.error.message);
        }
        // 3. Payment succeeded — show success view
        showPaymentSuccess(email, count);
    })
    .catch(function (err) {
        showCardError(err.message || 'Payment failed. Please try again.');
        resetBtn();
    });
}

// Show success confirmation inside the modal
function showPaymentSuccess(email, licenseCount) {
    var total = (selectedPlan.pricePerUser * licenseCount).toFixed(2);
    var modalContent = document.querySelector('#checkout-modal .bg-white');
    modalContent.innerHTML =
        '<div class="text-center py-4">' +
            '<div class="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">' +
                '<svg class="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' +
            '</div>' +
            '<h3 class="text-xl font-bold text-gray-900 mb-1">Subscription active!</h3>' +
            '<p class="text-sm text-gray-500 mb-6">Your payment was processed successfully.</p>' +
            '<div class="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm text-left">' +
                '<div class="flex justify-between"><span class="text-gray-400">Plan</span><span class="font-medium text-gray-900">' + escapeHtml(selectedPlan.name) + '</span></div>' +
                '<div class="flex justify-between"><span class="text-gray-400">Licenses</span><span class="font-medium text-gray-900">' + licenseCount + ' user' + (licenseCount > 1 ? 's' : '') + '</span></div>' +
                '<div class="flex justify-between"><span class="text-gray-400">Email</span><span class="font-medium text-gray-900">' + escapeHtml(email) + '</span></div>' +
                '<div class="border-t border-gray-200 pt-2 flex justify-between"><span class="font-semibold text-gray-900">Monthly total</span><span class="font-bold text-green-600">\u20AC' + total + '/mo</span></div>' +
            '</div>' +
            '<button onclick="closeCheckoutAndReset()" class="w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors">Close</button>' +
        '</div>';
}

// Close and rebuild the modal HTML for next use
function closeCheckoutAndReset() {
    closeCheckout();
    // Restore original modal content so it can be reused
    var modalContent = document.querySelector('#checkout-modal .bg-white');
    modalContent.innerHTML =
        '<button onclick="closeCheckout()" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100" aria-label="Close">' +
            '<svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>' +
        '</button>' +
        '<h3 class="text-lg font-bold text-gray-900 mb-1">Subscribe</h3>' +
        '<p class="text-xs text-gray-500 mb-5" id="checkout-summary"></p>' +
        '<div class="bg-gray-50 rounded-lg p-4 mb-5 space-y-2 text-sm">' +
            '<div class="flex justify-between"><span class="text-gray-400">Plan</span><span class="font-medium text-gray-900" id="checkout-plan-name"></span></div>' +
            '<div class="flex justify-between"><span class="text-gray-400">Licenses</span><span class="font-medium text-gray-900" id="checkout-licenses"></span></div>' +
            '<div class="flex justify-between"><span class="text-gray-400">Per user</span><span class="font-medium text-gray-900" id="checkout-unit-price"></span></div>' +
            '<div class="border-t border-gray-200 pt-2 flex justify-between"><span class="font-semibold text-gray-900">Monthly total</span><span class="font-bold text-brand-600" id="checkout-total"></span></div>' +
        '</div>' +
        '<div class="mb-3">' +
            '<label for="checkout-email" class="block text-xs font-medium text-gray-600 mb-1">Email</label>' +
            '<input type="email" id="checkout-email" placeholder="you@company.com" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm">' +
        '</div>' +
        '<div class="mb-3">' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Card number</label>' +
            '<div id="card-number-element" class="px-3 py-2.5 rounded-lg border border-gray-200 text-sm" style="min-height:40px"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3 mb-3">' +
            '<div>' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Expiry</label>' +
                '<div id="card-expiry-element" class="px-3 py-2.5 rounded-lg border border-gray-200 text-sm" style="min-height:40px"></div>' +
            '</div>' +
            '<div>' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">CVC</label>' +
                '<div id="card-cvc-element" class="px-3 py-2.5 rounded-lg border border-gray-200 text-sm" style="min-height:40px"></div>' +
            '</div>' +
        '</div>' +
        '<div class="mb-5">' +
            '<p id="card-errors" class="text-red-500 text-xs hidden"></p>' +
        '</div>' +
        '<button id="checkout-submit" onclick="handlePayment()" class="w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors">Subscribe & Pay</button>' +
        '<p class="text-[11px] text-gray-400 text-center mt-3">Secured by Stripe. Card data never touches our servers.</p>';

    // Re-mount Stripe card elements
    if (cardNumberElement) {
        cardNumberElement.mount('#card-number-element');
        cardExpiryElement.mount('#card-expiry-element');
        cardCvcElement.mount('#card-cvc-element');
    }
}

function resetBtn() {
    var btn = document.getElementById('checkout-submit');
    btn.disabled = false;
    btn.textContent = 'Subscribe & Pay';
    btn.classList.remove('bg-green-500');
    btn.classList.add('bg-brand-500', 'hover:bg-brand-600');
}

function showCardError(msg) {
    var el = document.getElementById('card-errors');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 4000);
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
        var t = document.querySelector(this.getAttribute('href'));
        if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    });
});
