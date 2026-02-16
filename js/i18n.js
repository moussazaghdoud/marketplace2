// Lightweight i18n engine for Rainbow Portal
(function () {
    'use strict';

    var cache = {};
    var currentLang = 'en';
    var currentTranslations = {};
    var SUPPORTED = ['en', 'fr', 'es', 'it', 'de'];
    var DEFAULT_LANG = 'en';
    var earlyApplied = false;

    // --- Early translation via MutationObserver ---
    // Since i18n.js loads in <head> (blocks parsing), the body doesn't exist yet.
    // If we have cached translations, set up an observer that translates elements
    // as the browser creates them — before they are ever painted. No flash.
    var detectedLang = (function () {
        var stored = localStorage.getItem('lang');
        if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
        var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
        return SUPPORTED.indexOf(nav) !== -1 ? nav : DEFAULT_LANG;
    })();

    if (detectedLang !== 'en') {
        try {
            var langRaw = localStorage.getItem('i18n_' + detectedLang);
            var enRaw = localStorage.getItem('i18n_en');
            if (langRaw) {
                var earlyTr = JSON.parse(langRaw);
                var earlyEn = enRaw ? JSON.parse(enRaw) : {};
                cache[detectedLang] = earlyTr;
                if (enRaw) cache['en'] = earlyEn;
                currentLang = detectedLang;
                currentTranslations = earlyTr;

                function earlyGetKey(obj, key) {
                    var p = key.split('.'), v = obj;
                    for (var i = 0; i < p.length; i++) { if (v == null) return; v = v[p[i]]; }
                    return v;
                }
                function earlyT(k) {
                    var v = earlyGetKey(earlyTr, k);
                    if (v !== undefined) return v;
                    v = earlyGetKey(earlyEn, k);
                    return v !== undefined ? v : undefined;
                }
                function translateEl(el) {
                    var k, v;
                    k = el.getAttribute('data-i18n');
                    if (k) { v = earlyT(k); if (v !== undefined) el.textContent = v; }
                    k = el.getAttribute('data-i18n-html');
                    if (k) { v = earlyT(k); if (v !== undefined) el.innerHTML = v; }
                    k = el.getAttribute('data-i18n-placeholder');
                    if (k) { v = earlyT(k); if (v !== undefined) el.placeholder = v; }
                }
                function translateTree(node) {
                    if (node.nodeType !== 1) return;
                    translateEl(node);
                    var els = node.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-placeholder]');
                    for (var i = 0; i < els.length; i++) translateEl(els[i]);
                }

                var observer = new MutationObserver(function (mutations) {
                    for (var i = 0; i < mutations.length; i++) {
                        var added = mutations[i].addedNodes;
                        for (var j = 0; j < added.length; j++) translateTree(added[j]);
                    }
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });

                // Stop observing once DOM is complete
                document.addEventListener('DOMContentLoaded', function () {
                    observer.disconnect();
                });

                earlyApplied = true;
            }
        } catch (e) { /* corrupted localStorage, fall back to normal flow */ }
    }

    // Detect language: localStorage > browser > default
    function detectLang() {
        var stored = localStorage.getItem('lang');
        if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
        var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
        return SUPPORTED.indexOf(nav) !== -1 ? nav : DEFAULT_LANG;
    }

    // Load translations: instant from localStorage, background-refresh from server
    function loadTranslations(lang) {
        if (cache[lang]) return Promise.resolve(cache[lang]);
        try {
            var stored = localStorage.getItem('i18n_' + lang);
            if (stored) cache[lang] = JSON.parse(stored);
        } catch (e) { /* corrupted */ }

        var base = window.location.origin;
        var fetching = fetch(base + '/i18n/' + lang + '.json')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                cache[lang] = data;
                try { localStorage.setItem('i18n_' + lang, JSON.stringify(data)); } catch (e) {}
                return data;
            });

        if (cache[lang]) return Promise.resolve(cache[lang]);
        return fetching;
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
        if (currentLang !== 'en' && cache['en']) {
            val = getKey(cache['en'], key);
            if (val !== undefined) return val;
        }
        return fallback !== undefined ? fallback : key;
    }

    // Build language switcher dropdowns (desktop + mobile)
    function initLangSwitcher() {
        var langs = { en: 'English', fr: 'Fran\u00e7ais', es: 'Espa\u00f1ol', it: 'Italiano', de: 'Deutsch' };

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

        var langCurrent = document.getElementById('lang-current');
        if (langCurrent) langCurrent.textContent = currentLang.toUpperCase();
    }

    // Close desktop dropdown on outside click
    document.addEventListener('click', function (e) {
        var sw = document.getElementById('lang-switcher');
        if (sw && !sw.contains(e.target)) sw.classList.remove('open');
    });

    // Remove the FOUC-prevention style (first-visit fallback)
    function revealContent() {
        var h = document.getElementById('i18n-hide');
        if (h) h.parentNode.removeChild(h);
    }

    // Apply translations to all data-i18n elements on the page
    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var val = t(key);
            if (val !== key || currentLang === 'en') el.textContent = val;
        });
        document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-html');
            var val = t(key);
            if (val !== key || currentLang === 'en') el.innerHTML = val;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-placeholder');
            var val = t(key);
            if (val !== key || currentLang === 'en') el.placeholder = val;
        });
        document.documentElement.lang = currentLang;
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
            window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
        });
    }

    // Initialize on DOMContentLoaded
    function init() {
        var lang = detectLang();
        currentLang = lang;

        if (earlyApplied) {
            // MutationObserver already translated everything — just init switcher & refresh cache
            initLangSwitcher();
            revealContent();
            document.documentElement.lang = lang;
            window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
            // Background refresh
            var base = window.location.origin;
            fetch(base + '/i18n/en.json').then(function (r) { return r.json(); }).then(function (d) { cache['en'] = d; try { localStorage.setItem('i18n_en', JSON.stringify(d)); } catch (e) {} });
            if (lang !== 'en') fetch(base + '/i18n/' + lang + '.json').then(function (r) { return r.json(); }).then(function (d) { cache[lang] = d; try { localStorage.setItem('i18n_' + lang, JSON.stringify(d)); } catch (e) {} });
            return;
        }

        // No early apply — load translations (from localStorage or server)
        try {
            var enRaw = localStorage.getItem('i18n_en');
            if (enRaw) cache['en'] = JSON.parse(enRaw);
            if (lang !== 'en') {
                var langRaw = localStorage.getItem('i18n_' + lang);
                if (langRaw) cache[lang] = JSON.parse(langRaw);
            }
        } catch (e) {}

        if (cache[lang] || cache['en']) {
            currentTranslations = cache[lang] || cache['en'];
            applyTranslations();
            initLangSwitcher();
            revealContent();
            window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
            var base2 = window.location.origin;
            fetch(base2 + '/i18n/en.json').then(function (r) { return r.json(); }).then(function (d) { cache['en'] = d; try { localStorage.setItem('i18n_en', JSON.stringify(d)); } catch (e) {} });
            if (lang !== 'en') fetch(base2 + '/i18n/' + lang + '.json').then(function (r) { return r.json(); }).then(function (d) { cache[lang] = d; try { localStorage.setItem('i18n_' + lang, JSON.stringify(d)); } catch (e) {} });
        } else {
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
