// Lightweight i18n engine for Rainbow Portal
(function () {
    'use strict';

    var cache = {};
    var currentLang = 'en';
    var currentTranslations = {};
    var SUPPORTED = ['en', 'fr', 'es', 'it', 'de'];
    var DEFAULT_LANG = 'en';

    // Hide translatable elements immediately if a non-English language is stored,
    // to prevent flash of English text (FOUC) before translations load.
    var storedLang = localStorage.getItem('lang');
    if (storedLang && storedLang !== 'en' && SUPPORTED.indexOf(storedLang) !== -1) {
        var hideStyle = document.createElement('style');
        hideStyle.id = 'i18n-hide';
        hideStyle.textContent = '[data-i18n],[data-i18n-html],[data-i18n-placeholder]{visibility:hidden}';
        (document.head || document.documentElement).appendChild(hideStyle);
    }

    // Detect language: localStorage > browser > default
    function detectLang() {
        var stored = localStorage.getItem('lang');
        if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
        var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
        return SUPPORTED.indexOf(nav) !== -1 ? nav : DEFAULT_LANG;
    }

    // Fetch and cache a translation file
    function loadTranslations(lang) {
        if (cache[lang]) return Promise.resolve(cache[lang]);
        // Resolve path: works from / or /pages/ since we use absolute path
        var base = window.location.origin;
        return fetch(base + '/i18n/' + lang + '.json')
            .then(function (r) { return r.json(); })
            .then(function (data) { cache[lang] = data; return data; });
    }

    // Get nested value by dot-separated key
    function getKey(obj, key) {
        var parts = key.split('.');
        var val = obj;
        for (var i = 0; i < parts.length; i++) {
            if (val == null) return undefined;
            val = val[parts[i]];
        }
        return val;
    }

    // Translate a single key, with optional fallback to English
    function t(key, fallback) {
        var val = getKey(currentTranslations, key);
        if (val !== undefined) return val;
        // Fallback to English cache
        if (currentLang !== 'en' && cache['en']) {
            val = getKey(cache['en'], key);
            if (val !== undefined) return val;
        }
        return fallback !== undefined ? fallback : key;
    }

    // Build language switcher dropdowns (desktop + mobile)
    function initLangSwitcher() {
        var langs = { en: 'English', fr: 'Fran\u00e7ais', es: 'Espa\u00f1ol', it: 'Italiano', de: 'Deutsch' };

        // Desktop dropdown
        var dropdown = document.getElementById('lang-dropdown');
        if (dropdown) {
            dropdown.innerHTML = '';
            Object.keys(langs).forEach(function (code) {
                var btn = document.createElement('button');
                btn.textContent = langs[code];
                btn.className = code === currentLang ? 'active' : '';
                btn.onclick = function (e) {
                    e.stopPropagation();
                    setLang(code);
                    var sw = document.getElementById('lang-switcher');
                    if (sw) sw.classList.remove('open');
                };
                dropdown.appendChild(btn);
            });
        }

        // Mobile language buttons
        var mobileSwitcher = document.getElementById('mobile-lang-switcher');
        if (mobileSwitcher) {
            mobileSwitcher.innerHTML = '';
            Object.keys(langs).forEach(function (code) {
                var btn = document.createElement('button');
                btn.textContent = code.toUpperCase();
                btn.className = code === currentLang
                    ? 'px-3 py-1.5 rounded-full text-xs font-medium bg-brand-500 text-white'
                    : 'px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600';
                btn.onclick = function () { setLang(code); };
                mobileSwitcher.appendChild(btn);
            });
        }

        // Update current lang display
        var langCurrent = document.getElementById('lang-current');
        if (langCurrent) langCurrent.textContent = currentLang.toUpperCase();
    }

    // Close desktop dropdown on outside click
    document.addEventListener('click', function (e) {
        var sw = document.getElementById('lang-switcher');
        if (sw && !sw.contains(e.target)) sw.classList.remove('open');
    });

    // Remove the FOUC-prevention style so translated elements become visible
    function revealContent() {
        var h = document.getElementById('i18n-hide');
        if (h) h.parentNode.removeChild(h);
    }

    // Apply translations to all data-i18n elements on the page
    function applyTranslations() {
        // data-i18n → textContent
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var val = t(key);
            if (val !== key || currentLang === 'en') el.textContent = val;
        });
        // data-i18n-html → innerHTML
        document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-html');
            var val = t(key);
            if (val !== key || currentLang === 'en') el.innerHTML = val;
        });
        // data-i18n-placeholder → placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-placeholder');
            var val = t(key);
            if (val !== key || currentLang === 'en') el.placeholder = val;
        });
        // Update html lang attribute
        document.documentElement.lang = currentLang;
        // Update active language in switcher
        var switcher = document.getElementById('lang-current');
        if (switcher) switcher.textContent = currentLang.toUpperCase();
    }

    // Set language and re-apply
    function setLang(lang) {
        if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
        currentLang = lang;
        localStorage.setItem('lang', lang);
        loadTranslations(lang).then(function (data) {
            currentTranslations = data;
            applyTranslations();
            initLangSwitcher();
            revealContent();
            // Dispatch event so page scripts can re-render JS-built content
            window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
        });
    }

    // Initialize on DOMContentLoaded
    function init() {
        var lang = detectLang();
        currentLang = lang;
        // Always preload English as fallback
        var promises = [loadTranslations('en')];
        if (lang !== 'en') promises.push(loadTranslations(lang));
        Promise.all(promises).then(function () {
            currentTranslations = cache[lang] || cache['en'];
            applyTranslations();
            initLangSwitcher();
            revealContent();
            window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    window.i18n = {
        t: t,
        setLang: setLang,
        getLang: function () { return currentLang; },
        supported: SUPPORTED
    };
})();
