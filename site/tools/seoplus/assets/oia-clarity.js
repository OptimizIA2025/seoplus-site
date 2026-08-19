/* Microsoft Clarity — couche 3 de l'architecture de mesure, SOUS CONSENTEMENT.
   Doctrine : OptimizIA.xyz/09 Base_Connaissance/SEO & GEO/(C) Cookies, traceurs et consentement.md

   Le regime applicable est celui du rejeu de session, pas celui de la mesure
   d'audience agregee : aucune exemption CNIL ne s'applique, d'ou la banniere.
   Elle ne conditionne QUE ce fichier. La couche 2 (oia-tracker.js) est
   exemptee et tourne pour 100 % des visiteurs, ne jamais la brancher ici.

   Tant que data-clarity est vide, ce script est un no-op complet : aucune
   banniere, aucun cookie, aucune requete vers un tiers. Poser l'identifiant du
   projet Clarity dans l'attribut suffit a tout activer.

   ⚠️ script-src https://www.clarity.ms NE SUFFIT PAS et rien ne le signale.
   La balise n'est qu'une amorce ; la chaine reelle est
   www.clarity.ms/tag/<id> -> scripts.clarity.ms/<version>/clarity.js
   -> <region>.clarity.ms/collect, soit trois sous-domaines. Une CSP incomplete
   ne fait pas echouer le traceur, ELLE LE REND MUET : le tag s'insere, la
   requete est bloquee, le tableau de bord reste vide, aucun symptome cote site.
   D'ou le joker https://*.clarity.ms en script-src ET connect-src, plus
   https://c.bing.com en connect-src.

   ⚠️ Clarity exige `consentv2` pour l'EEE, le Royaume-Uni et la Suisse depuis
   le 31/10/2025. Sans ce signal il tourne en mode degrade : un identifiant par
   page vue, aucune session reconstituee. L'API v1 `clarity('consent', bool)`
   est depreciee. Le refus publicitaire (ad_Storage denied) est delibere : seuls
   `_clck` et `_clsk` sont poses, les cookies publicitaires Microsoft restent
   absents, ce qui rend les mentions legales beaucoup plus simples a tenir. */
(function () {
    'use strict';

    var self = document.currentScript || document.querySelector('script[data-clarity]');
    var CLARITY_ID = (self && self.getAttribute('data-clarity')) || '';
    if (!CLARITY_ID) return; // aucun projet declare : rien ne se charge, rien ne s'affiche

    var LEGAL = (self && self.getAttribute('data-legal')) || 'mentions-legales.html';
    var ACCENT = (self && self.getAttribute('data-accent')) || '#F97316';
    var STORE = 'oia_clarity_consent';
    /* Un refus se represente plus tot qu'une acceptation : le visiteur qui a dit
       non n'a pas a etre resollicite tous les mois, celui qui a dit oui doit
       pouvoir revenir sur son choix dans le delai de 13 mois. */
    var VALIDITE = { granted: 397, denied: 183 };

    var isEN = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
    var TXT = isEN ? {
        region: 'Session replay consent',
        titre: 'Session replay',
        /* « sans vous identifier » et non « anonyme » : la mesure est pseudonyme,
           l'ancienne formulation etait juridiquement fausse. */
        corps: 'We use Microsoft Clarity to replay browsing sessions and improve this site, without identifying you and without advertising cookies. <a href="' + LEGAL + '">Learn more</a>',
        oui: 'Accept', non: 'Decline', gerer: 'Manage cookies'
    } : {
        region: 'Consentement au rejeu de session',
        titre: 'Rejeu de session',
        corps: 'Nous utilisons Microsoft Clarity pour rejouer les parcours et améliorer ce site, sans vous identifier et sans cookie publicitaire. <a href="' + LEGAL + '">En savoir plus</a>',
        oui: 'Accepter', non: 'Refuser', gerer: 'Gérer les cookies'
    };

    var CSS =
        '#oia-clarity{position:fixed;left:18px;bottom:18px;z-index:9999;max-width:360px;' +
        'background:#0F172A;color:#E2E8F0;border:1px solid rgba(148,163,184,.28);border-radius:14px;' +
        'padding:16px 18px;font-size:13px;line-height:1.55;box-shadow:0 12px 34px rgba(2,6,18,.45);font-family:inherit}' +
        '#oia-clarity[hidden]{display:none}' +
        '#oia-clarity a{color:inherit;text-decoration:underline}' +
        '#oia-clarity .oiac-t{font-weight:600;margin:0 0 6px;font-size:12.5px;letter-spacing:.04em;text-transform:uppercase}' +
        '#oia-clarity .oiac-b{margin:0}' +
        '#oia-clarity .oiac-act{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}' +
        /* Meme gabarit pour les deux boutons : refuser doit etre aussi facile
           qu'accepter, et le refus est place en premier. */
        '#oia-clarity button{cursor:pointer;border-radius:8px;font-size:12.5px;font-weight:600;' +
        'padding:7px 14px;font-family:inherit;border:1px solid rgba(148,163,184,.4);' +
        'background:transparent;color:#CBD5E1}' +
        '#oia-clarity button[data-oiac="oui"]{border-color:' + ACCENT + ';background:' + ACCENT + ';color:#fff}' +
        '.oiac-relink{background:none;border:none;padding:0;font:inherit;color:inherit;' +
        'text-decoration:underline;cursor:pointer}' +
        '@media print{#oia-clarity,.oiac-relink-wrap{display:none}}';

    function lire() {
        var brut;
        try { brut = localStorage.getItem(STORE); } catch (e) { return null; }
        if (!brut) return null;
        var v;
        try { v = JSON.parse(brut); } catch (e) { return null; }
        if (!v || !VALIDITE.hasOwnProperty(v.s)) return null;
        if ((Date.now() - (v.t || 0)) / 86400000 > VALIDITE[v.s]) return null;
        return v.s;
    }

    function ecrire(s) {
        try { localStorage.setItem(STORE, JSON.stringify({ s: s, t: Date.now() })); } catch (e) {}
    }

    var charge = false;

    function charger() {
        if (charge) return;
        charge = true;
        /* Souche officielle Microsoft. Elle empile les appels dans `clarity.q`
           en attendant le vrai script : le signal de consentement pose juste
           apres ne peut donc pas arriver trop tot, il sera rejoue. */
        (function (c, l, a, r, i, t, y) {
            c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
            t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
            y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
        })(window, document, 'clarity', 'script', CLARITY_ID);
        window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    }

    function revoquer() {
        if (window.clarity) {
            window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
        }
        /* `_clck` et `_clsk` sont deposes en premiere partie sur ce domaine : on
           les efface nous-memes plutot que de dependre du script tiers. Le
           rechargement qui suit coupe la collecte deja en cours, un refus devant
           prendre effet immediatement et pas au prochain clic. */
        ['_clck', '_clsk'].forEach(function (n) {
            document.cookie = n + '=; Max-Age=0; path=/';
            document.cookie = n + '=; Max-Age=0; path=/; domain=.' + location.hostname;
        });
    }

    var bandeau = null;

    function construire() {
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        bandeau = document.createElement('div');
        bandeau.id = 'oia-clarity';
        bandeau.setAttribute('role', 'region');
        bandeau.setAttribute('aria-label', TXT.region);
        bandeau.hidden = true;
        bandeau.innerHTML =
            '<p class="oiac-t"></p><p class="oiac-b"></p>' +
            '<div class="oiac-act">' +
            '<button type="button" data-oiac="non"></button>' +
            '<button type="button" data-oiac="oui"></button>' +
            '</div>';

        /* En tete de <body> : une banniere de consentement doit etre atteinte
           tot au clavier et par un lecteur d'ecran, meme si elle s'affiche en bas. */
        document.body.insertBefore(bandeau, document.body.firstChild);

        bandeau.querySelector('.oiac-t').textContent = TXT.titre;
        bandeau.querySelector('.oiac-b').innerHTML = TXT.corps;
        bandeau.querySelector('[data-oiac="non"]').textContent = TXT.non;
        bandeau.querySelector('[data-oiac="oui"]').textContent = TXT.oui;

        bandeau.querySelector('[data-oiac="non"]').addEventListener('click', function () {
            ecrire('denied');
            bandeau.hidden = true;
            if (charge) { revoquer(); location.reload(); }
        });
        bandeau.querySelector('[data-oiac="oui"]').addEventListener('click', function () {
            ecrire('granted');
            bandeau.hidden = true;
            charger();
        });
    }

    function afficher() {
        if (!bandeau) construire();
        bandeau.hidden = false;
    }

    /* Revenir sur son choix. Un element portant data-oia-cookies est pris s'il
       existe ; sinon un lien discret est ajoute au premier <footer> de la page,
       pour qu'aucun site ne se retrouve sans porte de sortie. */
    function poserRappel() {
        var cibles = document.querySelectorAll('[data-oia-cookies]');
        if (cibles.length) {
            cibles.forEach(function (el) { el.addEventListener('click', afficher); });
            return;
        }
        var pied = document.querySelector('footer');
        if (!pied) return;
        var wrap = document.createElement('span');
        wrap.className = 'oiac-relink-wrap';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'oiac-relink';
        b.textContent = TXT.gerer;
        b.addEventListener('click', afficher);
        wrap.appendChild(document.createTextNode(' · '));
        wrap.appendChild(b);
        pied.appendChild(wrap);
    }

    function demarrer() {
        var etat = lire();
        if (etat === 'granted') charger();
        construire();
        if (etat === null) bandeau.hidden = false;
        poserRappel();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
    else demarrer();

    window.oiaClarity = { ouvrir: afficher };
})();
