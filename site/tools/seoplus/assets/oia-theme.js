/* Bascule clair/sombre, meme mecanique et meme cle que le site agence : le choix
 * suit le visiteur d'un site a l'autre (meme domaine). Chargee SYNCHRONE dans le
 * <head> : data-theme doit etre pose avant le premier rendu. Par defaut le site
 * reste clair. Le bouton est cree par app.js, qui construit la barre. */
(function () {
    var KEY = 'oia-theme';
    var racine = document.documentElement;
    var choix = null;
    try { choix = localStorage.getItem(KEY); } catch (e) { }
    if (choix === 'dark') racine.setAttribute('data-theme', 'dark');

    var LUNE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    var SOLEIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>';
    var LIBELLES = {
        fr: ['Passer en mode sombre', 'Passer en mode clair'],
        en: ['Switch to dark mode', 'Switch to light mode'],
        es: ['Cambiar al modo oscuro', 'Cambiar al modo claro'],
        de: ['Dunkelmodus aktivieren', 'Hellmodus aktivieren']
    };

    function peindre() {
        var sombre = racine.getAttribute('data-theme') === 'dark';
        var l = LIBELLES[(racine.getAttribute('lang') || 'en').slice(0, 2)] || LIBELLES.en;
        document.querySelectorAll('.theme-btn').forEach(function (b) {
            b.innerHTML = sombre ? SOLEIL : LUNE;
            b.setAttribute('aria-label', l[sombre ? 1 : 0]);
            b.title = l[sombre ? 1 : 0];
        });
    }
    function basculer() {
        var sombre = racine.getAttribute('data-theme') === 'dark';
        if (sombre) racine.removeAttribute('data-theme');
        else racine.setAttribute('data-theme', 'dark');
        try { localStorage.setItem(KEY, sombre ? 'light' : 'dark'); } catch (e) { }
        peindre();
    }

    window.OIA_THEME = {
        bouton: function () {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'theme-btn';
            b.addEventListener('click', basculer);
            return b;
        },
        peindre: peindre
    };
    /* Le libelle suit la langue affichee, reposee a chaque bascule. */
    document.addEventListener('seoplus:langue', peindre);
})();
