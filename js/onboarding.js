// Rainbow Onboarding — Vanilla JS
(function () {
    'use strict';

    var API = '/api/rainbow';
    var RAINBOW_WEB = 'https://web-sandbox.openrainbow.com/';

    // --- State ---
    var state = {
        currentStep: 1,
        email: '',
        password: '',
        token: null,
        userId: null,
        countries: [],
        loading: false,
        error: ''
    };

    // --- Helpers ---
    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    function $(id) { return document.getElementById(id); }

    function setLoading(v) {
        state.loading = v;
        renderCurrentStep();
    }

    function setError(msg) {
        state.error = msg || '';
        var el = $('ob-error');
        if (el) {
            el.textContent = state.error;
            el.classList.toggle('hidden', !state.error);
        }
    }

    // --- API functions ---
    function apiPost(url, body, headers) {
        var h = Object.assign({
            'accept': 'application/json',
            'content-type': 'application/json',
            'accept-language': 'en'
        }, headers || {});
        return fetch(API + url, { method: 'POST', headers: h, body: JSON.stringify(body) })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw new Error(data.errorDetails || data.errorMsg || data.message || 'Request failed');
                    return data;
                });
            });
    }

    function apiGet(url, headers) {
        var h = Object.assign({
            'accept': 'application/json',
            'content-type': 'application/json',
            'accept-language': 'en'
        }, headers || {});
        return fetch(API + url, { method: 'GET', headers: h })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw new Error(data.errorDetails || data.errorMsg || data.message || 'Request failed');
                    return data;
                });
            });
    }

    function apiPut(url, body, headers) {
        var h = Object.assign({
            'accept': 'application/json',
            'content-type': 'application/json',
            'accept-language': 'en'
        }, headers || {});
        return fetch(API + url, { method: 'PUT', headers: h, body: JSON.stringify(body) })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw new Error(data.errorDetails || data.errorMsg || data.message || 'Request failed');
                    return data;
                });
            });
    }

    function sendVerificationEmail(email) {
        return apiPost('/enduser/v1.0/notifications/emails/self-register', { email: email, lang: 'en' });
    }

    function registerUser(email, password, temporaryToken) {
        return apiPost('/enduser/v1.0/users/self-register', {
            loginEmail: email,
            password: password,
            temporaryToken: temporaryToken
        });
    }

    function loginUser(email, password) {
        var creds = btoa(email + ':' + password);
        return apiGet('/authentication/v1.0/login', {
            'authorization': 'Basic ' + creds
        });
    }

    function updateUserProfile(userId, token, data) {
        return apiPut('/enduser/v1.0/users/' + userId, data, {
            'authorization': 'Bearer ' + token
        });
    }

    function getCountries(token) {
        return apiGet('/enduser/v1.0/countries', {
            'authorization': 'Bearer ' + token
        });
    }

    function createCompanyApi(token, companyName, userEmail) {
        var domain = userEmail.split('@')[1];
        return apiPost('/enduser/v1.0/companies', { name: companyName, domain: domain }, {
            'authorization': 'Bearer ' + token
        });
    }

    // --- Validation ---
    function isValidEmail(e) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    }

    function isValidPassword(p) {
        if (p.length < 12 || p.length > 64) return false;
        var hasUpper = /[A-Z]/.test(p);
        var hasLower = /[a-z]/.test(p);
        var hasDigit = /[0-9]/.test(p);
        var hasSpecial = /[^A-Za-z0-9]/.test(p);
        return hasUpper && hasLower && hasDigit && hasSpecial;
    }

    // --- Step renderers ---
    function stepIndicator() {
        var steps = ['Email', 'Verify', 'Profile', 'Company', 'Done'];
        var html = '<div class="flex items-center justify-center gap-1 mb-6">';
        for (var i = 0; i < steps.length; i++) {
            var n = i + 1;
            var active = n === state.currentStep;
            var done = n < state.currentStep;
            var dotColor = active ? 'bg-brand-500' : (done ? 'bg-green-500' : 'bg-gray-200');
            html += '<div class="flex items-center">';
            html += '<div class="w-2 h-2 rounded-full ' + dotColor + '"></div>';
            if (i < steps.length - 1) html += '<div class="w-6 h-px ' + (done ? 'bg-green-300' : 'bg-gray-200') + ' mx-1"></div>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function spinnerSvg() {
        return '<svg class="animate-spin h-4 w-4 inline-block mr-2" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';
    }

    function renderStep1() {
        var card = $('ob-card');
        card.innerHTML =
            stepIndicator() +
            '<h3 class="text-lg font-bold text-gray-900 mb-1">Create your Rainbow account</h3>' +
            '<p class="text-xs text-gray-500 mb-5">Enter your email to get started</p>' +
            '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Email address</label>' +
                '<input type="email" id="ob-email" placeholder="you@company.com" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm" value="' + esc(state.email) + '">' +
            '</div>' +
            '<p id="ob-error" class="text-red-500 text-xs mb-3 ' + (state.error ? '' : 'hidden') + '">' + esc(state.error) + '</p>' +
            '<button id="ob-submit" class="w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors" ' + (state.loading ? 'disabled' : '') + '>' +
                (state.loading ? spinnerSvg() + 'Sending...' : 'Send Verification Code') +
            '</button>' +
            '<p class="text-[11px] text-gray-400 text-center mt-3">We\'ll send a verification code to your email.</p>';

        $('ob-submit').addEventListener('click', handleStep1);
        $('ob-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleStep1(); });
        if (!state.loading) $('ob-email').focus();
    }

    function renderStep2() {
        var card = $('ob-card');
        card.innerHTML =
            stepIndicator() +
            '<h3 class="text-lg font-bold text-gray-900 mb-1">Verify & set password</h3>' +
            '<p class="text-xs text-gray-500 mb-5">Check <strong>' + esc(state.email) + '</strong> for a verification code</p>' +
            '<div class="mb-3">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Verification code</label>' +
                '<input type="text" id="ob-code" placeholder="Enter the 6-digit code" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm">' +
            '</div>' +
            '<div class="mb-3">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Password</label>' +
                '<input type="password" id="ob-password" placeholder="Min 12 chars, upper+lower+digit+special" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm">' +
            '</div>' +
            '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Confirm password</label>' +
                '<input type="password" id="ob-password2" placeholder="Repeat password" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm">' +
            '</div>' +
            '<p id="ob-error" class="text-red-500 text-xs mb-3 ' + (state.error ? '' : 'hidden') + '">' + esc(state.error) + '</p>' +
            '<button id="ob-submit" class="w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors" ' + (state.loading ? 'disabled' : '') + '>' +
                (state.loading ? spinnerSvg() + 'Creating account...' : 'Create Account') +
            '</button>';

        $('ob-submit').addEventListener('click', handleStep2);
        $('ob-password2').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleStep2(); });
        if (!state.loading) $('ob-code').focus();
    }

    function renderStep3() {
        var countryOptions = '<option value="">Select country</option>';
        state.countries.forEach(function (c) {
            countryOptions += '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
        });

        var card = $('ob-card');
        card.innerHTML =
            stepIndicator() +
            '<h3 class="text-lg font-bold text-gray-900 mb-1">Complete your profile</h3>' +
            '<p class="text-xs text-gray-500 mb-5">Tell us a bit about yourself</p>' +
            '<div class="mb-3">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">First name</label>' +
                '<input type="text" id="ob-firstname" placeholder="First name" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm">' +
            '</div>' +
            '<div class="mb-3">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Last name</label>' +
                '<input type="text" id="ob-lastname" placeholder="Last name" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm">' +
            '</div>' +
            '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Country</label>' +
                '<select id="ob-country" class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm bg-white">' +
                    countryOptions +
                '</select>' +
            '</div>' +
            '<p id="ob-error" class="text-red-500 text-xs mb-3 ' + (state.error ? '' : 'hidden') + '">' + esc(state.error) + '</p>' +
            '<button id="ob-submit" class="w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors" ' + (state.loading ? 'disabled' : '') + '>' +
                (state.loading ? spinnerSvg() + 'Saving...' : 'Continue') +
            '</button>';

        $('ob-submit').addEventListener('click', handleStep3);
        if (!state.loading) $('ob-firstname').focus();
    }

    function renderStep4() {
        var card = $('ob-card');
        card.innerHTML =
            stepIndicator() +
            '<h3 class="text-lg font-bold text-gray-900 mb-1">Create your company</h3>' +
            '<p class="text-xs text-gray-500 mb-5">Set up your organization on Rainbow</p>' +
            '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-gray-600 mb-1">Company name</label>' +
                '<input type="text" id="ob-company" placeholder="Acme Inc." class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none text-sm">' +
            '</div>' +
            '<p id="ob-error" class="text-red-500 text-xs mb-3 ' + (state.error ? '' : 'hidden') + '">' + esc(state.error) + '</p>' +
            '<button id="ob-submit" class="w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors" ' + (state.loading ? 'disabled' : '') + '>' +
                (state.loading ? spinnerSvg() + 'Creating...' : 'Create Company') +
            '</button>';

        $('ob-submit').addEventListener('click', handleStep4);
        $('ob-company').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleStep4(); });
        if (!state.loading) $('ob-company').focus();
    }

    function renderStep5() {
        var card = $('ob-card');
        card.innerHTML =
            '<div class="text-center py-4">' +
                '<div class="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">' +
                    '<svg class="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' +
                '</div>' +
                '<h3 class="text-xl font-bold text-gray-900 mb-1">You\'re all set!</h3>' +
                '<p class="text-sm text-gray-500 mb-6">Your Rainbow account and company have been created.</p>' +
                '<div class="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm text-left">' +
                    '<div class="flex justify-between"><span class="text-gray-400">Email</span><span class="font-medium text-gray-900">' + esc(state.email) + '</span></div>' +
                '</div>' +
                '<a href="' + RAINBOW_WEB + '" target="_blank" class="block w-full py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors text-center">Open Rainbow Platform</a>' +
                '<button onclick="closeOnboarding()" class="w-full py-3 mt-2 rounded-lg border border-gray-200 text-gray-700 font-medium text-sm hover:border-gray-300 transition-colors">Close</button>' +
            '</div>';
    }

    function renderCurrentStep() {
        var renderers = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderStep5 };
        var fn = renderers[state.currentStep];
        if (fn) {
            var card = $('ob-card');
            card.classList.add('step-entering');
            fn();
            // Trigger transition
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    card.classList.remove('step-entering');
                    card.classList.add('step-visible');
                });
            });
        }
    }

    // --- Step handlers ---
    function handleStep1() {
        var email = ($('ob-email').value || '').trim();
        if (!isValidEmail(email)) {
            setError('Please enter a valid email address.');
            return;
        }
        state.email = email;
        state.error = '';
        setLoading(true);

        sendVerificationEmail(email)
            .then(function () {
                state.loading = false;
                state.currentStep = 2;
                state.error = '';
                renderCurrentStep();
            })
            .catch(function (err) {
                state.loading = false;
                setError(err.message || 'Failed to send verification email.');
            });
    }

    function handleStep2() {
        var code = ($('ob-code').value || '').trim();
        var pwd = $('ob-password').value || '';
        var pwd2 = $('ob-password2').value || '';

        if (!code) { setError('Please enter the verification code.'); return; }
        if (!isValidPassword(pwd)) {
            setError('Password must be 12-64 characters with uppercase, lowercase, digit, and special character.');
            return;
        }
        if (pwd !== pwd2) { setError('Passwords do not match.'); return; }

        state.error = '';
        state.password = pwd;
        setLoading(true);

        registerUser(state.email, pwd, code)
            .then(function (res) {
                var newUserId = res.data && res.data.id;
                var newEmail = (res.data && res.data.loginEmail) || state.email;
                if (!newUserId) throw new Error('Could not retrieve user information.');
                state.userId = newUserId;
                return loginUser(newEmail, pwd);
            })
            .then(function (loginRes) {
                var authToken = loginRes.token;
                if (!authToken) throw new Error('Auto-login failed.');
                state.token = authToken;
                return getCountries(authToken);
            })
            .then(function (countriesRes) {
                state.countries = (countriesRes && countriesRes.data) || [];
                state.loading = false;
                state.currentStep = 3;
                state.error = '';
                renderCurrentStep();
            })
            .catch(function (err) {
                state.loading = false;
                setError(err.message || 'Account creation failed.');
            });
    }

    function handleStep3() {
        var firstName = ($('ob-firstname').value || '').trim();
        var lastName = ($('ob-lastname').value || '').trim();
        var country = $('ob-country').value || '';

        if (!firstName || !lastName) { setError('First and last name are required.'); return; }
        if (!country) { setError('Please select a country.'); return; }

        state.error = '';
        setLoading(true);

        updateUserProfile(state.userId, state.token, {
            firstName: firstName,
            lastName: lastName,
            country: country,
            language: 'en',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
            .then(function () {
                state.loading = false;
                state.currentStep = 4;
                state.error = '';
                renderCurrentStep();
            })
            .catch(function (err) {
                state.loading = false;
                setError(err.message || 'Profile update failed.');
            });
    }

    function handleStep4() {
        var company = ($('ob-company').value || '').trim();
        if (!company) { setError('Company name is required.'); return; }

        state.error = '';
        setLoading(true);

        createCompanyApi(state.token, company, state.email)
            .then(function () {
                state.loading = false;
                state.currentStep = 5;
                state.error = '';
                renderCurrentStep();
            })
            .catch(function (err) {
                state.loading = false;
                setError(err.message || 'Company creation failed.');
            });
    }

    // --- Modal open/close (exposed globally) ---
    window.openOnboarding = function () {
        // Reset state
        state.currentStep = 1;
        state.email = '';
        state.password = '';
        state.token = null;
        state.userId = null;
        state.countries = [];
        state.loading = false;
        state.error = '';

        var modal = $('onboarding-modal');
        modal.classList.remove('hidden');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderCurrentStep();
    };

    window.closeOnboarding = function () {
        var modal = $('onboarding-modal');
        modal.classList.add('hidden');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };

    // Close on Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeOnboarding();
    });
})();
