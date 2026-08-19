/* Mesure d'audience premiere partie — couche 2 de l'architecture de mesure.
   Doctrine : OptimizIA.xyz/09 Base_Connaissance/SEO & GEO/(C) Cookies, traceurs et consentement.md

   AUCUNE banniere ici, et c'est le coeur du changement du 17/08. Ce traceur
   remplit les quatre conditions d'exemption de la CNIL : finalite limitee a la
   mesure d'audience, statistiques agregees, aucun tiers destinataire (n8n est
   notre serveur), aucun suivi entre sites puisque localStorage est cloisonne
   par origine. Une couche exemptee placee derriere une banniere ne mesure que
   la fraction qui accepte : c'est une perte seche, pas une precaution.
   La banniere de oia-clarity.js ne conditionne QUE Clarity.

   La condition qui se rate le plus souvent est la duree. localStorage n'a
   aucune expiration native, donc l'identifiant y vivrait indefiniment et le
   plafond de 13 mois ne serait jamais applique. D'ou l'horodatage stocke a
   cote de l'identifiant et la regeneration au-dela. Ne pas retirer.

   Le site est declare par l'attribut data-site de la balise, jamais en dur :
   ce fichier est ainsi rigoureusement identique sur les quatre sites.
   ⚠️ Une valeur absente de la liste blanche du noeud n8n `Code - Store Event`
   est etiquetee 'inconnu' et ressort dans Le Fil de la console. */
(function () {
    'use strict';

    var self = document.currentScript || document.querySelector('script[data-site]');
    var SITE = (self && self.getAttribute('data-site')) || 'inconnu';
    var N8N = (self && self.getAttribute('data-endpoint')) || 'https://n8n.romainben.cloud/webhook/oia/sync';
    var K = { optout: 'optimizia_notrack', vid: 'oia_vid', sid: 'oia_sid', src: 'oia_src', cmp: 'oia_cmp' };
    var VALIDITE = 397 * 24 * 3600e3; // 13 mois, plafond CNIL

    var Q = null;
    try { Q = new URLSearchParams(location.search); } catch (e) {}

    if (Q && Q.has('notrack')) {
        try {
            if (Q.get('notrack') === '1') localStorage.setItem(K.optout, '1');
            else localStorage.removeItem(K.optout);
        } catch (e) {}
    }
    try { if (localStorage.getItem(K.optout)) return; } catch (e) { return; }

    var REF = document.referrer || '';

    function uuid() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    /* L'identifiant porte sa date de naissance. Passe 13 mois il est jete et
       regenere, ce qui rend le plafond effectif la ou localStorage ne l'applique
       pas. L'ancienne forme (uuid nu, sans separateur) est acceptee une derniere
       fois et reecrite datee, pour ne pas perdre les visiteurs recurrents. */
    function visiteur() {
        var brut = localStorage.getItem(K.vid);
        if (brut) {
            var p = brut.split('|');
            if (p.length === 2) {
                if (Date.now() - Number(p[1]) < VALIDITE) return p[0];
            } else {
                localStorage.setItem(K.vid, brut + '|' + Date.now());
                return brut;
            }
        }
        var neuf = uuid();
        localStorage.setItem(K.vid, neuf + '|' + Date.now());
        return neuf;
    }

    function categorize() {
        var us = Q && (Q.get('utm_source') || '').toLowerCase().slice(0, 40);
        if (us) return us;
        if (!REF) return 'direct';
        try {
            var h = new URL(REF).hostname.toLowerCase();
            if (h === location.hostname) return null;
            var MAP = [
                /* Assistants IA en premier : ils comptent double aujourd'hui et
                   presque personne ne les mesure. */
                ['chatgpt', 'ia-chatgpt'], ['openai', 'ia-chatgpt'],
                ['perplexity', 'ia-perplexity'], ['claude.ai', 'ia-claude'],
                ['copilot', 'ia-copilot'], ['gemini.google', 'ia-gemini'],
                ['linkedin', 'linkedin'], ['lnkd.in', 'linkedin'],
                ['tiktok', 'tiktok'], ['youtu', 'youtube'],
                ['instagram', 'instagram'], ['facebook', 'facebook'], ['fb.com', 'facebook'],
                ['twitter', 'x'], ['x.com', 'x'], ['t.co', 'x'],
                ['discord', 'discord'], ['t.me', 'telegram'], ['telegram', 'telegram'],
                ['reddit', 'reddit'], ['bing', 'bing'], ['duckduckgo', 'duckduckgo'],
                ['github', 'github'],
                ['seoplus.optimizia', 'seoplus'], ['optimizia.xyz', 'optimizia.xyz'],
                ['romainben.cloud', 'romainben.cloud'], ['ginoux.xyz', 'ginoux.xyz'],
                ['exotradingplus', 'exotradingplus'],
            ];
            for (var i = 0; i < MAP.length; i++) { if (h.indexOf(MAP[i][0]) !== -1) return MAP[i][1]; }
            if (/^(www\.)?google\./.test(h)) return 'google';
            return h.replace(/^www\./, '');
        } catch (e) { return 'direct'; }
    }

    var vid, sid, src, cmp;
    try {
        vid = visiteur();
        sid = sessionStorage.getItem(K.sid);
        if (!sid) { sid = uuid(); sessionStorage.setItem(K.sid, sid); }
        src = sessionStorage.getItem(K.src);
        if (!src) { src = categorize() || 'direct'; sessionStorage.setItem(K.src, src); }
        cmp = sessionStorage.getItem(K.cmp);
        if (cmp === null) { cmp = ((Q && Q.get('utm_campaign')) || '').slice(0, 80); sessionStorage.setItem(K.cmp, cmp); }
    } catch (e) { return; }

    function payload(event, element) {
        return {
            site: SITE, event: event, page: location.pathname, element: element || '',
            visitorId: vid, sessionId: sid, source: src, campaign: cmp,
            timestamp: new Date().toISOString()
        };
    }
    function send(event, element) {
        fetch(N8N, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload(event, element))
        }).catch(function () {});
    }

    send('pageview', document.title);

    document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('a[href], button, [data-track]') : null;
        if (!el) return;
        var href = el.getAttribute('href') || '';
        var text = (el.textContent || '').trim().slice(0, 80);
        var external = false;
        if (href && href.indexOf('#') !== 0) {
            try { external = new URL(href, location.href).hostname !== location.hostname; } catch (err) {}
        }
        if (el.matches('button, [data-track], [class*="btn"], [class*="cta"]')) send('cta_click', text);
        else if (external) send('external_click', text || href.slice(0, 80));
        else send('nav_click', text);
    });

    document.querySelectorAll('form').forEach(function (form) {
        form.addEventListener('submit', function () {
            send('form_submit', form.id || form.getAttribute('action') || 'form');
        });
    });

    var depths = [25, 50, 75, 100], fired = {};
    window.addEventListener('scroll', function () {
        var pct = Math.round((window.scrollY + window.innerHeight) / Math.max(document.body.scrollHeight, 1) * 100);
        depths.forEach(function (d) { if (pct >= d && !fired[d]) { fired[d] = true; send('scroll_depth', d + '%'); } });
    }, { passive: true });

    var t0 = Date.now(), sentTime = false;
    function sendTime() {
        if (sentTime) return;
        var s = Math.round((Date.now() - t0) / 1000);
        if (s < 1) return;
        sentTime = true;
        /* sendBeacon en text/plain : garde la requete CORS simple, le webhook
           n8n ne gere pas le prevol OPTIONS. */
        try { navigator.sendBeacon(N8N, new Blob([JSON.stringify(payload('time_on_page', s + 's'))], { type: 'text/plain' })); } catch (e) {}
    }
    window.addEventListener('pagehide', sendTime);
    window.addEventListener('beforeunload', sendTime);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') sendTime();
    });
})();
