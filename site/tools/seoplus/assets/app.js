/* SEOPlus! - logique front commune.
   Mode demo (mock local) actif tant que config.js n'a pas de ROAST_WEBHOOK_URL. */

(function () {
  "use strict";

  var CFG = window.SEOPLUS_CONFIG || {};
  var page = document.body.dataset.page;

  /* Prefixe du site dans optimizia.xyz depuis la migration du 16/08. Tous les
     chemins internes ecrits en JS passent par lui.
     Il n'est PAS applique aux chemins du site analyse ("/sitemap.xml",
     "/llms.txt", "/og-image.jpg", "Allow: /") : ceux-la appartiennent au
     visiteur, les prefixer casserait le generateur de fichiers. */
  var BASE = "/tools/seoplus";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------- i18n FR/EN (tunnel audit : roast, rapport, compte) ----------
     Le moteur emet le payload en francais ; la traduction se fait au rendu via
     le dictionnaire assets/i18n-en.js. Cle absente = repli silencieux sur le FR. */

  var LANG = (function () {
    /* Pages statiques traduites en fichiers séparés (blog EN, légal EN) :
       la langue est celle du fichier, pas celle de la préférence stockée. */
    var forced = document.body.getAttribute("data-lang");
    if (forced === "fr" || forced === "en") return forced;

    /* ?lang= porte la langue d'une page a l'autre. Sans lui, un lecteur anglais
       venu d'un article EN et dont le navigateur est en francais retombait en
       francais des qu'il cliquait sur Tarifs ou Classement : les pages coeur
       n'ont pas d'URL anglaise dediee, elles se traduisent au rendu. Les liens
       des pages EN portent donc ?lang=en. La preference est memorisee pour que
       la suite de la visite reste dans la meme langue. */
    var q = (location.search.match(/[?&]lang=(fr|en)\b/) || [])[1];
    if (q) {
      try { localStorage.setItem("seoplus_lang", q); } catch (e) {}
      return q;
    }
    try {
      var s = localStorage.getItem("seoplus_lang");
      if (s === "fr" || s === "en") return s;
    } catch (e) {}
    var n = (navigator.language || "fr").toLowerCase();
    return n.indexOf("fr") === 0 ? "fr" : "en";
  })();
  var ENDICT = window.SEOPLUS_EN || null;
  var isEN = LANG === "en" && !!ENDICT;
  /* Pages traduisibles. Blog/articles (contenu editorial FR) et pages legales (droit francais) restent en francais. */
  var I18N_PAGES = ["home", "roast", "bilan", "rapport", "compte", "classement", "methodologie", "llms", "a-propos"];

  function tUI(key, fr) {
    if (isEN && ENDICT.ui[key] != null) return ENDICT.ui[key];
    return fr;
  }
  function tFmt(key, fr, vars) {
    var s = tUI(key, fr);
    Object.keys(vars || {}).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  /* Provenance de campagne : premiere touche gagnante, memorisee en local et
     jointe a chaque audit archive. Mesure first-party, aucun traceur tiers :
     on sait d ou viennent les audits sans poser de cookie publicitaire. */
  var UTM = (function () {
    try {
      var p = new URLSearchParams(window.location.search);
      var src = p.get("utm_source");
      if (src) {
        var v = {
          source: src.slice(0, 40),
          medium: (p.get("utm_medium") || "").slice(0, 40) || null,
          campaign: (p.get("utm_campaign") || "").slice(0, 60) || null,
          content: (p.get("utm_content") || "").slice(0, 60) || null,
          ts: new Date().toISOString()
        };
        if (!localStorage.getItem("seoplus_utm")) localStorage.setItem("seoplus_utm", JSON.stringify(v));
        return JSON.parse(localStorage.getItem("seoplus_utm"));
      }
      var stored = localStorage.getItem("seoplus_utm");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  })();

  /* La traduction des constats du moteur (libelles, valeurs, correctifs) pese
     130 Ko, soit le double du dictionnaire d'interface, et ne sert qu'au rendu
     d'un audit. Elle vit donc dans un second fichier, charge au moment ou un
     rapport s'affiche en anglais : la page d'accueil, le blog et les pages de
     contenu ne le telechargent plus jamais.
     En cas d'echec de chargement on n'insiste pas : l'interface reste en
     anglais et les constats sortent en francais, exactement comme avant que
     ce dictionnaire existe. Mieux vaut ca qu'une page qui ne s'affiche pas. */
  var dictAudit = null;
  function dictAuditPret() { return !isEN || dictAudit === true; }
  function chargerDictAudit(cb) {
    if (dictAuditPret()) { if (cb) cb(); return; }
    if (!dictAudit) {
      dictAudit = new Promise(function (res) {
        var s = document.createElement("script");
        s.src = BASE + "/assets/i18n-en-audit.js?v=20260821c";
        s.onload = s.onerror = function () { res(); };
        document.head.appendChild(s);
      }).then(function () { dictAudit = true; });
    }
    Promise.resolve(dictAudit).then(function () { if (cb) cb(); });
  }

  /* Depuis le 14/08 la seizieme categorie s'adapte au type de site : fiche
     etablissement, boutique, media, presence personnelle, service numerique ou
     presence et confiance. Tout nouveau rapport porte donc seize boites.
     La carte "non applicable" ne sert plus qu'aux rapports d'avant cette date
     encore en cache, qui n'ont aucune categorie de type. */
  var CATS_TYPE = [
    "Fiche etablissement et referencement local",
    "Boutique en ligne",
    "Media et contenu",
    "Presence personnelle",
    "Service numerique",
    "Presence et confiance"
  ];
  var CAT_CONDITIONNELLE = CATS_TYPE[0];

  function categorieLocaleAbsente(cats) {
    return !(cats || []).some(function (c) { return CATS_TYPE.indexOf(c.label) !== -1; });
  }

  function texteNonApplicable() {
    return isEN
      ? "This category applies only to establishments and local service businesses. We found no sign of one on your site: no business markup, no opening hours, no map, and not two of the physical signals we require. It is therefore not counted in your score, and nothing here is held against you."
      : "Cette catégorie ne concerne que les établissements et les services de proximité. Nous n'en avons trouvé aucun signe sur votre site : ni balisage d'établissement, ni horaires, ni carte, ni deux des signaux physiques que nous exigeons. Elle n'entre donc pas dans votre score, et rien ici ne vous est reproché.";
  }

  function titreNonApplicable() {
    return isEN ? "Not applicable" : "Non applicable";
  }

  function trCheck(label) { return (isEN && ENDICT.checks[label]) || label; }
  function trCat(label) { return (isEN && ENDICT.cats[label]) || label; }
  function trVal(v) {
    if (!isEN || !v) return v;
    v = String(v);
    if (ENDICT.fixes[v]) return ENDICT.fixes[v];
    for (var i = 0; i < ENDICT.rules.length; i++) v = v.replace(ENDICT.rules[i][0], ENDICT.rules[i][1]);
    return v;
  }
  var trFix = trVal;

  /* Date de l'analyse. Une mesure servie sans date finit par etre prise pour un
     constat frais : c'est ce qui faisait diverger le score du roast gratuit,
     servi par le cache 24 h du moteur, et celui de l'audit complet. */
  function fmtAnalyzedAt(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return "";
    return d.toLocaleString(isEN ? "en-GB" : "fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function renderAnalyzedAt(el, data) {
    if (!el) return;
    var when = fmtAnalyzedAt(data && data.analyzedAt);
    if (!when) { el.hidden = true; return; }
    /* Plus aucun cache : toute mesure affichee vient d'etre prise a l'instant,
       la date suffit et il n'y a plus rien a "relancer". */
    el.innerHTML = esc(tFmt("analyzedAt", "Analysé le {when}", { when: when }));
    el.hidden = false;
  }

  /* Checks non conformes : lien vers l'article du blog qui explique le point.
     Cle = libelle exact du moteur (sans accents), valeur = [article FR, article EN].
     Les chemins sont ecrits sans le prefixe du site : learnMore() ajoute BASE.
     Les checks sans article pedagogique (securite, TLS, email) ne sont pas mappes. */
  var LEARN_MORE = {
    "Fichier robots.txt": ["/visibilite-ia/crawlers-ia-robots-txt/", "/en/ai-visibility/ai-crawlers-robots-txt/"],
    "Indexation robots.txt": ["/visibilite-ia/crawlers-ia-robots-txt/", "/en/ai-visibility/ai-crawlers-robots-txt/"],
    "Directives crawlers IA": ["/visibilite-ia/crawlers-ia-robots-txt/", "/en/ai-visibility/ai-crawlers-robots-txt/"],
    "Sitemap XML": ["/autorite-confiance/pourquoi-site-invisible-google/", "/en/authority-trust/website-invisible-on-google/"],
    "Sitemap declare": ["/autorite-confiance/pourquoi-site-invisible-google/", "/en/authority-trust/website-invisible-on-google/"],
    "Indexation autorisee": ["/autorite-confiance/pourquoi-site-invisible-google/", "/en/authority-trust/website-invisible-on-google/"],
    "Pages internes en erreur": ["/autorite-confiance/pourquoi-site-invisible-google/", "/en/authority-trust/website-invisible-on-google/"],
    "Fraicheur du sitemap": ["/contenu-seo/mettre-a-jour-ancien-contenu/", "/en/seo-content/update-old-content/"],
    "Fichier llms.txt": ["/visibilite-ia/llms-txt-guide/", "/en/ai-visibility/llms-txt-guide/"],
    "Guidage IA (llms.txt)": ["/visibilite-ia/llms-txt-guide/", "/en/ai-visibility/llms-txt-guide/"],
    "Donnees structurees JSON-LD": ["/seo-technique/donnees-structurees-json-ld/", "/en/technical-seo/structured-data-json-ld/"],
    "Schema entreprise (Organization)": ["/seo-technique/donnees-structurees-json-ld/", "/en/technical-seo/structured-data-json-ld/"],
    "Syntaxe JSON-LD": ["/seo-technique/donnees-structurees-json-ld/", "/en/technical-seo/structured-data-json-ld/"],
    "Liens de confiance (sameAs)": ["/visibilite-ia/chatgpt-connait-pas-votre-marque/", "/en/ai-visibility/chatgpt-doesnt-know-your-brand/"],
    "Contenu en questions / FAQ": ["/visibilite-ia/ai-overviews-france/", "/en/ai-visibility/ai-overviews-france/"],
    "Passages extractibles (listes)": ["/visibilite-ia/geo-etre-cite/", "/en/ai-visibility/geo-get-cited/"],
    "Faits et chiffres citables": ["/visibilite-ia/geo-etre-cite/", "/en/ai-visibility/geo-get-cited/"],
    "Flux RSS / Atom": ["/visibilite-ia/geo-etre-cite/", "/en/ai-visibility/geo-get-cited/"],
    "Signaux E-E-A-T": ["/contenu-seo/eeat-prouver-expertise/", "/en/seo-content/eeat-prove-expertise/"],
    "Volume de contenu": ["/contenu-seo/contenu-600-mots/", "/en/seo-content/content-600-words/"],
    "Contenu des pages internes": ["/contenu-seo/contenu-600-mots/", "/en/seo-content/content-600-words/"],
    "Profondeur de contenu": ["/contenu-seo/contenu-600-mots/", "/en/seo-content/content-600-words/"],
    "Balise title": ["/contenu-seo/titles-meta-descriptions/", "/en/seo-content/titles-meta-descriptions/"],
    "Meta description": ["/contenu-seo/titles-meta-descriptions/", "/en/seo-content/titles-meta-descriptions/"],
    "Titles uniques sur le site": ["/contenu-seo/titles-meta-descriptions/", "/en/seo-content/titles-meta-descriptions/"],
    "Meta descriptions internes": ["/contenu-seo/titles-meta-descriptions/", "/en/seo-content/titles-meta-descriptions/"],
    "Balise H1": ["/contenu-seo/titles-meta-descriptions/", "/en/seo-content/titles-meta-descriptions/"],
    "Hierarchie des titres": ["/contenu-seo/titles-meta-descriptions/", "/en/seo-content/titles-meta-descriptions/"],
    "Maillage interne": ["/seo-technique/maillage-interne/", "/en/technical-seo/internal-linking/"],
    "URL canonique": ["/contenu-seo/cannibalisation-mots-cles/", "/en/seo-content/keyword-cannibalization/"],
    "Score performance Google (Lighthouse mobile)": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    "Chargement (LCP)": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    "Stabilite visuelle (CLS)": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    /* Le moteur ecrit "Reactivite (INP)" quand les donnees terrain CrUX
       existent et "(INP estime)" sinon : sans les deux clefs, le lien
       disparaissait justement pour les sites qui ont de vraies mesures. */
    "Reactivite (INP)": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    "Reactivite (INP estime)": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    "Compression HTTP": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    "Poids de la page": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    "Lazy loading images": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"],
    "Ressources bloquantes": ["/seo-technique/core-web-vitals-guide/", "/en/technical-seo/core-web-vitals-guide/"]
  };

  function learnMore(label) {
    var art = LEARN_MORE[label];
    if (!art) return "";
    return '<a class="learn-more" href="' + BASE + art[isEN ? 1 : 0] + '" target="_blank" rel="noopener">' +
      tUI("learnMore", "En savoir plus") + "</a>";
  }

  /* "Ce qu'on vérifie" : une phrase par vérification, affichée dans le détail par
     catégorie. Vit côté front (clé = libellé exact du moteur) : zéro octet de plus
     dans le payload et les rapports archivés en profitent aussi. */
  var CHECK_DESC = {
    "Fichier robots.txt": "Le fichier qui dit aux robots ce qu'ils peuvent explorer, et où trouver le sitemap.",
    "Sitemap XML": "Le nombre d'adresses déclarées dans votre sitemap.xml, et rien d'autre. Les pages atteintes en suivant votre menu sont comptées séparément : un écart entre les deux est justement ce qu'on cherche à montrer.",
    "Fraicheur du sitemap": "La date de dernière mise à jour déclarée dans le sitemap : un site vivant se voit.",
    "Volume de contenu": "La quantité de texte réellement indexable sur la page d'accueil.",
    "Hierarchie des titres": "Les sous-titres H2/H3 qui organisent la lecture pour Google et les IA.",
    "Contenu des pages internes": "La densité de texte des pages intérieures, là où se joue le référencement des services.",
    "Pages internes en erreur": "Les pages du sitemap ou du menu qui répondent en erreur au lieu d'un contenu.",
    "Pages legales": "La présence des mentions légales, de la politique de confidentialité et des CGV/CGU.",
    "Pages legales atteignables en un clic": "Un lien direct et explicitement libellé depuis l'accueil. La page peut exister et être trouvée par ailleurs : ce point ne juge que son accessibilité, pas son existence. Un lien replié sous un menu, ou pointant vers une adresse générique, ne satisfait pas la LCEN qui exige des mentions « facilement accessibles ».",
    "Enregistrement SPF": "La liste des serveurs autorisés à envoyer des emails en votre nom.",
    "Politique DMARC": "La consigne donnée aux messageries quand un email prétend venir de votre domaine sans preuve.",
    "Politique MTA-STS": "Le chiffrement imposé aux emails entrants pour empêcher leur interception.",
    "Content-Security-Policy": "L'en-tête qui limite les scripts autorisés à s'exécuter sur vos pages.",
    "Strict-Transport-Security": "L'en-tête qui force le navigateur à rester en HTTPS à chaque visite.",
    "X-Frame-Options": "La protection contre l'affichage de votre site dans un cadre invisible (clickjacking).",
    "Referrer-Policy": "Ce que votre site révèle de la navigation de vos visiteurs aux sites tiers.",
    "Permissions-Policy": "Les accès navigateur (caméra, micro, géolocalisation) que vos pages s'interdisent.",
    "Fuite de version serveur": "Les en-têtes qui affichent vos versions logicielles aux attaquants.",
    "Cookies securises": "Les attributs Secure, HttpOnly et SameSite des cookies déposés par le serveur.",
    "Balise title": "Le titre affiché dans les résultats de recherche : présence et longueur.",
    "Meta description": "Le texte d'aperçu sous le titre dans les résultats de recherche.",
    "Balise H1": "Le titre principal de la page : il en faut exactement un.",
    "Viewport mobile": "La balise qui rend la page lisible sur téléphone.",
    "URL canonique": "L'adresse officielle déclarée de la page, contre le contenu dupliqué.",
    "Langue declaree": "L'attribut lang qui annonce la langue du site aux moteurs et lecteurs d'écran.",
    "Maillage interne": "Les liens entre vos propres pages, qui font circuler visiteurs et robots.",
    "Titles uniques sur le site": "Chaque page doit porter un titre distinct : toutes les pages scannées sont comparées.",
    "Meta descriptions internes": "La présence d'une meta description sur chacune des pages intérieures.",
    "Indexation robots.txt": "Le robots.txt ne doit pas bloquer l'indexation et doit pointer vers le sitemap.",
    "Sitemap declare": "Le sitemap est présent et déclaré là où les moteurs le cherchent.",
    "Favicon": "L'icône du site dans les onglets et les résultats de recherche.",
    "Fichier llms.txt": "Le fichier qui guide ChatGPT, Claude et Perplexity vers vos pages clés.",
    "Indexation autorisee": "Aucune directive noindex ne doit exclure la page des moteurs.",
    "Directives crawlers IA": "Votre politique explicite face aux robots des IA (GPTBot, ClaudeBot, PerplexityBot).",
    "Canonique et adresse reelle coherentes": "On compare votre canonique à l'adresse qui a réellement répondu. Si l'apex et le www répondent tous les deux en 200, c'est cette absence de redirection qui est mesurée ici, pas une erreur de cible de l'audit.",
    "Longueur de la chaine de redirections": "Le nombre de sauts entre l'adresse en http et la page finale.",
    "Canonique auto-referente (pages internes)": "Chaque page intérieure doit se déclarer elle-même comme adresse officielle.",
    "Comportement sur page inexistante": "Une URL au hasard doit répondre 404, pas 200 : sinon les moteurs indexent du vide.",
    "Sante du sitemap": "Un échantillon d'URLs du sitemap est testé : elles doivent répondre 200 sans rediriger.",
    "Pages orphelines": "Les pages présentes au sitemap mais liées depuis aucune page scannée.",
    "Donnees structurees JSON-LD": "Le balisage schema.org qui décrit votre activité aux moteurs et aux IA.",
    "Schema entreprise (Organization)": "La fiche d'identité structurée de votre entreprise (nom, logo, contact).",
    "Liens de confiance (sameAs)": "Les liens structurés vers vos profils officiels, qui relient votre marque à ses preuves.",
    "Contenu en questions / FAQ": "Le format question/réponse que les IA reprennent en priorité.",
    "Passages extractibles (listes)": "Les listes et paragraphes courts qu'une IA peut citer tels quels.",
    "Faits et chiffres citables": "Les données chiffrées qui rendent votre contenu sourçable.",
    "Profondeur de contenu": "La matière disponible pour qu'une IA construise une réponse à partir de vos pages.",
    "Guidage IA (llms.txt)": "Le résumé d'activité destiné aux modèles de langage.",
    "Syntaxe JSON-LD": "La validité technique de vos blocs JSON-LD : un bloc cassé est ignoré.",
    "Signaux E-E-A-T": "Les preuves d'expérience et de fiabilité que cherchent Google et les IA.",
    "Flux RSS / Atom": "Le flux qui distribue vos contenus aux agrégateurs et à certains crawlers IA.",
    "Page a propos": "Une page qui dit qui est derrière le site, condition pour être cité.",
    "Coordonnees reelles": "Téléphone ou adresse en clair : la preuve qu'une organisation réelle existe.",
    "Auteur identifie": "Une signature ou un schema author sur les contenus.",
    "Date de publication ou de mise a jour": "Une date visible qui prouve que le contenu est entretenu.",
    "Score performance Google (Lighthouse mobile)": "Le score de vitesse mesuré par Google sur mobile, via l'API PageSpeed.",
    "Chargement (LCP)": "Le délai avant l'affichage de l'élément principal de la page.",
    "Stabilite visuelle (CLS)": "Les décalages de mise en page pendant le chargement.",
    "Reactivite (INP)": "Le temps de réponse de la page quand on clique ou tape.",
    "Compression HTTP": "La compression gzip ou brotli du HTML transféré, mesurée sur la taille réelle.",
    "Attributs alt sur les pages internes": "Les textes alternatifs des images sur les pages intérieures.",
    "Dimensions explicites des images": "Les attributs width et height qui évitent les sauts de mise en page.",
    "Formats d image modernes": "La part d'images servies en WebP ou AVIF. Deux preuves comptent : la réponse réelle du serveur quand on lui demande le format moderne (un CDN qui convertit à la volée est crédité même si l'adresse finit en .jpg), et les blocs picture du code, où le navigateur choisit la source WebP et ne garde le JPEG qu'en secours.",
    "Poids de la plus grosse image": "L'image la plus lourde de la page, presque toujours responsable du LCP.",
    "Poids de la page": "La taille du HTML téléchargé.",
    "Attributs alt images": "Les textes alternatifs des images de la page d'accueil.",
    "Lazy loading images": "Le chargement différé des images sous la ligne de flottaison.",
    "Ressources bloquantes": "Les CSS et scripts qui retardent le premier affichage.",
    "HTTPS": "Le chiffrement de la connexion entre le visiteur et votre serveur.",
    "HSTS": "L'en-tête qui interdit au navigateur de retomber en HTTP.",
    "Redirection HTTP vers HTTPS": "Le passage automatique, en un seul saut, de http vers https.",
    "Contenu mixte": "Des ressources encore chargées en http sur des pages https.",
    "DNSSEC": "La signature cryptographique de votre zone DNS contre le détournement.",
    "Enregistrement CAA": "La liste des autorités autorisées à émettre des certificats pour votre domaine.",
    "Traceurs analytics": "Les outils de mesure et de pistage chargés avant tout consentement.",
    "Cookies a l accueil": "Les cookies déposés dès l'arrivée, avant toute action du visiteur.",
    "Fichiers sensibles accessibles": "Des chemins critiques (.git, .env, sauvegardes) testés un par un : aucun ne doit répondre.",
    "Listing de repertoire": "L'affichage du contenu brut des dossiers du serveur.",
    "Version du logiciel exposee": "La balise generator qui publie la version de votre CMS.",
    "Fichiers d administration et de deploiement": "Des scripts de déploiement et fichiers d'infra qui ne doivent jamais être servis.",
    "Technologies detectees": "La plateforme et les briques logicielles reconnues dans le code et les en-têtes. Constat, pas jugement.",
    "Instructions cachees destinees aux IA": "Cherche des instructions cachées adressées aux IA, dans les commentaires ou les blocs masqués, et des caractères invisibles. C'est un vecteur d'injection de prompt.",
    "Secrets et cles exposes dans le code": "Cherche dans le code de la page les clés secrètes qui ne devraient jamais y être. Les clés publiques par conception, comme celle de Google Maps, sont volontairement ignorées.",
    "Endpoints d automatisation ouverts": "Repère les webhooks Zapier, Make, n8n ou Discord écrits en clair dans la page : ils sont appelables par n'importe qui.",
    "Interfaces d automatisation et d API exposees": "Teste si des interfaces techniques répondent publiquement : liste des comptes WordPress, XML-RPC, statut du serveur.",
    "Politique CORS": "L'en-tête qui autorise d'autres sites à lire vos réponses. Trop permissif, il expose les données de vos visiteurs connectés.",
    "Protection contre le reniflage de type (nosniff)": "L'en-tête qui empêche le navigateur de deviner le type d'un fichier et d'exécuter comme script ce qui n'en est pas un.",
    "HSTS en liste de prechargement": "La directive qui protège la toute première visite, avant même que votre en-tête HSTS ait pu être lu.",
    "Integrite des ressources externes (SRI)": "L'empreinte qui vérifie qu'un script chargé depuis un autre domaine n'a pas été modifié. Sans elle, un fournisseur compromis exécute son code chez vous.",
    "Point de contact securite (security.txt)": "Le fichier normalisé qui indique à qui signaler une faille. Sans lui, un chercheur bien intentionné ne sait pas qui prévenir.",
    "Signature DKIM": "La signature cryptographique de vos e-mails. Mesurée en sondant les noms de sélecteurs les plus répandus, un nom personnalisé peut donc lui échapper.",
    "Rapports TLS (TLS-RPT)": "L'adresse qui reçoit les rapports quand un e-mail qui vous était destiné n'a pas pu être chiffré.",
    "Logo verifie dans la messagerie (BIMI)": "L'enregistrement qui affiche votre logo à côté de vos e-mails chez Gmail et Yahoo. Il suppose un DMARC déjà strict.",
    "Serveur de reception (MX)": "Les serveurs qui reçoivent les e-mails de votre domaine. Sans eux, un message envoyé à votre adresse se perd.",
    "Expiration du nom de domaine": "La date de fin de votre nom de domaine, lue dans le registre officiel. Un domaine expiré coupe le site et les e-mails le même jour.",
    "Anciennete du domaine": "Depuis quand le domaine existe, d'après le registre. Un domaine ancien inspire davantage confiance aux moteurs.",
    "Certificat TLS le plus recent": "L'échéance du dernier certificat émis pour ce domaine, lue dans les journaux publics de certificats.",
    "Sous-domaines visibles publiquement": "Tout certificat émis est inscrit dans un journal public : vos sous-domaines y sont donc lisibles, même sans lien depuis le site.",
    "Adressage IPv6": "La présence d'une adresse IPv6, sans laquelle une part croissante des accès mobiles passe par une passerelle de traduction.",
    "Hebergement DNS": "Les serveurs de noms qui font autorité sur votre domaine, et l'opérateur qui les héberge.",
    "Recueil du consentement": "Le croisement entre les traceurs chargés et la présence d'un bandeau de consentement. Des traceurs sans bandeau, c'est le manquement RGPD le plus courant.",
    "Ressources chargees depuis d autres domaines": "L'inventaire des domaines tiers qui servent du contenu à vos visiteurs. Chacun voit passer leur adresse IP.",
    "Transferts de donnees hors Union europeenne": "Les services chargés par la page dont l'éditeur est établi hors UE : un transfert de données à mentionner dans votre politique de confidentialité.",
    "Localisation du serveur": "Le pays et l'opérateur qui hébergent la page, d'après l'adresse IP du serveur.",
    "Parcours de contact lisible par une machine": "Vérifie qu'un agent IA trouve un moyen de vous joindre dans le code : lien téléphone, e-mail, formulaire, prise de rendez-vous.",
    "Sources externes citees": "Les domaines cités en lien, hors réseaux sociaux. Un contenu qui ne renvoie à rien est plus difficile à corroborer pour un moteur de réponse.",
    "Lien de credit en pied de page": "Un lien suivi vers votre prestataire, répété sur toutes les pages par le pied de page. Ne vise que ce cas précis : un lien sortant vers une vraie source dans votre contenu reste bénéfique.",
    /* Descriptions FR posees le 13/08 : 54 constats en avaient une en
       anglais et aucune en francais, donc pas d infobulle sur le rapport
       francais, qui est pourtant le principal. */
    "Solidite de l enregistrement SPF": "Si votre SPF bloque réellement les envois non autorisés, ou s'il se contente de les signaler.",
    "Solidite de la politique DMARC": "Ce que votre politique DMARC fait vraiment des e-mails qui usurpent votre domaine : rien, la quarantaine, ou le rejet.",
    "Isolation entre origines": "Les en-têtes qui empêchent un autre site d'observer ou de manipuler le vôtre dans le navigateur.",
    "Formulaires envoyes en clair": "Les formulaires dont la destination n'est pas en HTTPS : tout ce qui y est saisi voyage lisible.",
    "Methodes HTTP autorisees": "Les verbes que votre serveur accepte. TRACE et les méthodes d'écriture n'ont rien à faire sur un site vitrine.",
    "Solidite de la politique CSP": "Ce que votre CSP interdit réellement. Une politique qui autorise unsafe-inline ne protège presque de rien.",
    "Pare-feu applicatif ou CDN de protection": "La présence d'un pare-feu applicatif ou d'un CDN filtrant devant votre site.",
    "Longueur des titles sur les pages internes": "La longueur des balises title de vos pages internes, coupées par Google au-delà de 65 caractères.",
    "Longueur des meta descriptions internes": "La longueur des meta descriptions internes, tronquées dans les résultats au-delà de 160 caractères.",
    "Donnees structurees sur les pages internes": "Si le balisage JSON-LD existe ailleurs que sur l'accueil, ou seulement là.",
    "Balise H1 sur les pages internes": "Si chaque page interne porte un H1, et un seul.",
    "Meta descriptions uniques sur le site": "Les meta descriptions recopiées d'une page à l'autre, que Google réécrit alors lui-même.",
    "Balises de partage (Open Graph)": "Le titre, la description et l'image affichés quand votre lien est partagé sur un réseau social.",
    "Langue declaree coherente avec le texte": "Si l'attribut lang de la page correspond à la langue réellement écrite dedans.",
    "Versions linguistiques declarees (hreflang)": "Les balises hreflang qui disent à Google quelle version servir à quel pays.",
    "Maillage entre pages internes (silos)": "La façon dont vos pages se citent entre elles, et celles qu'aucune autre ne mentionne.",
    "Expression cible identifiable": "Si le title, le H1 et le texte s'accordent sur un sujet, seule définition opérationnelle d'une page qui sait de quoi elle parle.",
    "Accord entre le title et le H1": "Le recouvrement entre la promesse affichée dans Google et le titre que le visiteur lit en arrivant.",
    "Terme metier dans le title de l accueil": "Si le title de l'accueil dit ce que vous faites, ou seulement qui vous êtes. Personne ne cherche une marque qu'il ne connaît pas encore.",
    "Sur-optimisation du mot cle": "La part du texte occupée par le terme cible. Au-delà d'un seuil, la page se lit comme écrite pour une machine.",
    "Cannibalisation entre pages": "Les paires de pages qui visent la même requête et se concurrencent au lieu de s'additionner.",
    "Adresses de page lisibles": "Si les adresses reprennent un mot de leur propre titre, plutôt qu'un identifiant que seule la base de données comprend.",
    "Libelles des liens internes": "Le texte de vos liens internes, l'une des rares choses qui disent à Google de quoi parle la page visée.",
    "Intentions de recherche couvertes": "Si le site couvre à la fois ceux qui sont prêts à acheter et ceux qui cherchent encore à comprendre.",
    "Balisage etablissement (LocalBusiness)": "Si le site se déclare comme une entreprise rattachée à un lieu, ce qui conditionne son entrée dans le pack local.",
    "Adresse postale complete et balisee": "Si la rue, le code postal et la ville sont balisés pour les machines, et pas seulement imprimés pour les humains.",
    "Coherence des coordonnees (nom, adresse, telephone)": "Si les coordonnées balisées disent la même chose que la page visible. La contradiction est le défaut local numéro un.",
    "Telephone cliquable": "Si le numéro est un lien tel:, pour qu'un visiteur mobile appelle d'un seul doigt.",
    "Horaires d ouverture publies": "Si les horaires sont publiés et balisés. C'est l'information la plus demandée sur un établissement.",
    "Situation sur une carte": "La présence de coordonnées géographiques ou d'une carte, qui lèvent le doute sur l'adresse.",
    "Ville dans le title et le H1": "Si la ville apparaît là où la recherche de proximité trouve sa réponse mot pour mot : le title et le H1.",
    "Zone d intervention ou plan d acces": "Si le site dit jusqu'où vous vous déplacez, ou comment on vient chez vous.",
    "Fiche produit balisee (Product)": "Si vos produits sont déclarés en données structurées, condition des résultats enrichis.",
    "Prix et disponibilite balises (offers)": "Si le balisage produit porte un prix et une disponibilité lisibles par une machine.",
    "Prix affiches sur la page": "Les prix repérés en clair sur la page d'accueil.",
    "Parcours d achat visible": "Si un panier ou un bouton d'achat est accessible dès l'accueil.",
    "Conditions generales de vente": "La présence d'un lien vers vos CGV, obligation légale d'une boutique.",
    "Livraison et retours annonces": "Si les délais, frais de livraison et conditions de retour sont annoncés.",
    "Paiement securise annonce": "Si les moyens de paiement et leur sécurité sont affichés.",
    "Recherche produit": "La présence d'un champ de recherche interne.",
    "Articles balises (Article / BlogPosting)": "Si vos contenus sont déclarés en données structurées éditoriales.",
    "Rubriques navigables": "Si les articles sont organisés en catégories accessibles depuis la navigation.",
    "Pagination ou archives": "S'il existe un chemin vers les anciens articles : pagination ou archives.",
    "Recherche interne": "La présence d'un champ de recherche interne.",
    "Fraicheur editoriale": "La date du contenu le plus récent lisible sur l'accueil.",
    "Partage des articles": "La présence de boutons de partage vers les réseaux.",
    "Newsletter proposee": "Si une inscription newsletter est proposée au lecteur.",
    "Espace de commentaires ou communaute": "La présence d'un espace de commentaires. L'absence est un choix, pas une faute.",
    "Identite balisee (Person)": "Si le site déclare qui vous êtes en données structurées (bloc Person).",
    "Nom porte par le title": "Si votre nom, tel que déclaré dans le balisage, apparaît dans le title.",
    "Profils professionnels lies": "Si LinkedIn ou GitHub sont liés depuis la page.",
    "Realisations presentees": "Si des projets ou réalisations concrètes sont mis en avant.",
    "Parcours ou CV accessible": "Si un CV ou une page parcours sont accessibles.",
    "Competences ou services enonces": "Si ce que vous proposez est écrit noir sur blanc.",
    "Disponibilite annoncee": "Si votre statut (freelance, disponible, en poste) est affiché.",
    "Site en son nom propre": "Si le nom de domaine porte votre nom.",
    "Offre balisee (SoftwareApplication / Service)": "Si votre produit ou service est déclaré en données structurées.",
    "Page tarifs accessible": "Si une page tarifs est liée depuis la navigation.",
    "Tarification affichee": "Si un prix ou un modèle tarifaire sont visibles.",
    "Essai ou demonstration proposes": "Si un essai gratuit ou une démo sont proposés dès l'accueil.",
    "Espace de connexion": "Si vos utilisateurs peuvent se connecter depuis l'accueil.",
    "Documentation ou centre d aide": "Si une documentation ou un centre d'aide publics sont liés.",
    "Page de statut ou fiabilite": "La présence d'une page de statut publique, signal de sérieux d'un service en ligne.",
    "Nouveautes ou changelog": "Si le produit montre ses mises à jour : changelog ou page nouveautés.",
    "Offre ou services detailles": "Si chaque service a sa page, plutôt qu'une liste sur l'accueil.",
    "References ou realisations": "Si des cas clients, réalisations ou témoignages sont montrés.",
    "Equipe ou visages": "Si l'équipe ou les fondateurs sont présentés.",
    "Certifications ou labels": "Les certifications, labels ou agréments mentionnés.",
    "Partenaires ou clients affiches": "Si des clients ou partenaires sont cités, la preuve sociale la plus rapide à lire.",
    "Recrutement ou vie de l entreprise": "La présence d'une page recrutement, signal de vitalité.",
    "Newsletter ou point de contact regulier": "Si un moyen de rester en contact est proposé aux visiteurs pas encore prêts.",
    "Signal d activite recente": "Le dernier signe de vie datable : contenu, mise à jour, actualité.",
    "Declaration d usage IA (ai.txt)": "Un fichier /ai.txt qui déclare ce que les IA ont le droit de faire de vos contenus.",
    "Pages internes exclues de l indexation": "Les pages internes marquées noindex, donc volontairement absentes de Google.",
    "Page d erreur personnalisee": "Ce que voit un visiteur qui tombe sur une adresse inexistante de votre site.",
    "Profils sociaux lies depuis le site": "Les profils que votre balisage déclare, et ceux que la page lie réellement.",
    "Avis et notes declares": "Le balisage des avis clients, que Google peut afficher en étoiles sous votre lien.",
    "Fil d Ariane structure (BreadcrumbList)": "Le balisage que Google transforme en chemin lisible sous votre lien dans les résultats.",
    "Contenu lisible sans JavaScript": "Si le texte est dans le code servi par le serveur ou assemblé par le navigateur. Les crawlers IA n'exécutent pas JavaScript.",
    "Titres formules en questions": "La part de vos H2 et H3 écrits comme la question qu'un client poserait vraiment.",
    "Mesure Google Lighthouse": "Si l'API PageSpeed de Google a répondu. Quand ce n'est pas le cas, cinq mesures de performance manquent au rapport, et nous le disons.",
    "Temps de reponse du serveur": "Le temps que met votre serveur à commencer à répondre, avant que le navigateur ait quoi que ce soit à afficher.",
    "Cache navigateur des fichiers statiques": "La durée de cache servie sur vos images, feuilles de style et scripts, mesurée fichier par fichier.",
    "Ordre des niveaux de titre": "Si les niveaux de titre descendent un par un. Le plan des titres est le sommaire de la page.",
    "Zoom autorise sur mobile": "Si la balise viewport empêche d'agrandir la page, ce qui exclut les personnes malvoyantes.",
    "Champs de formulaire etiquetes": "Si chaque champ porte une vraie étiquette. Un texte gris dans le champ disparaît dès qu'on commence à taper.",
    "Liens sans libelle lisible": "Les liens en icône sans texte ni nom accessible : un lecteur d'écran annonce « lien », sans dire où il mène.",
    "Reperes de structure de page": "Les repères main, nav, header et footer qui disent aux gens et aux machines où se trouve le contenu.",
    "Liens ouverts dans un nouvel onglet": "Les liens en target blank, et la présence de rel noopener qui empêche la page ouverte d'agir sur la vôtre.",
    "Encodage des caracteres declare": "Si l'encodage est déclaré dans l'en-tête HTTP, et pas seulement dans une balise que le navigateur lit plus tard.",
    "Sous-domaine recuperable par un tiers": "Les sous-domaines dont le CNAME pointe encore vers un hébergement supprimé, que n'importe qui peut réclamer.",
    "Bibliotheques JavaScript obsoletes": "Les bibliothèques JavaScript dont la version n'est plus maintenue par son éditeur.",
    "Chemins sensibles reveles par le robots.txt": "Les chemins d'administration nommés dans votre robots.txt, un fichier public que tout le monde peut lire.",
    "Messages d erreur techniques visibles": "Les messages d'erreur applicatifs laissés à l'écran, qui livrent chemins de fichiers, versions du moteur et parfois la requête SQL.",
  };
  function checkDesc(label) {
    var key = String(label || "").indexOf("Reactivite (INP") === 0 ? "Reactivite (INP)" : label;
    return (isEN && ENDICT.descs && ENDICT.descs[key]) || CHECK_DESC[key] || "";
  }

  /* ---------- Bascule FR/EN sans rechargement ----------
     Le bouton de langue faisait un location.reload() alors que toute la
     traduction se fait deja au rendu : la page repartait de zero, images et
     scripts compris, pour un travail que le navigateur pouvait faire sur place.
     On memorise le francais d'origine au premier passage, ce qui rend la
     traduction reversible et permet de basculer dans les deux sens sans jamais
     relire le serveur ni perdre sa position dans la page.

     Les articles de blog gardent la navigation : leur version anglaise est un
     VRAI fichier, avec sa propre URL et son hreflang. C'est ce que Google
     attend d'un contenu editorial, et aucun basculement JS ne le remplace. */
  var ORIG = new WeakMap();
  function memoriser(el, cle, valeur) {
    var m = ORIG.get(el);
    if (!m) { m = {}; ORIG.set(el, m); }
    if (!(cle in m)) m[cle] = valeur;
    return m[cle];
  }
  function origine(el, cle) {
    var m = ORIG.get(el);
    return m && (cle in m) ? m[cle] : null;
  }
  var TITRE_FR = null;
  /* Chaque ecran depose ici de quoi se redessiner : le contenu du bilan, du
     rapport ou du classement est construit en JS, il ne suffit pas de traduire
     le HTML deja pose. */
  var REDESSINER = null;

  function applyI18nStatic(vers) {
    if (I18N_PAGES.indexOf(page) === -1) return;
    var en = vers === "en" && !!ENDICT;
    document.documentElement.lang = en ? "en" : "fr";
    $$("[data-i18n]").forEach(function (el) {
      var fr = memoriser(el, "text", el.textContent);
      var v = en ? ENDICT.html[el.dataset.i18n] : null;
      el.textContent = v != null ? v : fr;
    });
    $$("[data-i18n-html]").forEach(function (el) {
      var fr = memoriser(el, "html", el.innerHTML);
      var v = en ? ENDICT.html[el.dataset.i18nHtml] : null;
      el.innerHTML = v != null ? v : fr;
    });
    $$("[data-i18n-ph]").forEach(function (el) {
      var fr = memoriser(el, "ph", el.placeholder);
      var v = en ? ENDICT.html[el.dataset.i18nPh] : null;
      el.placeholder = v != null ? v : fr;
    });
    /* Capture paresseuse : le titre est retenu au moment de passer en anglais,
       pas au chargement. Sinon on memorise le titre du fichier HTML alors que
       l'ecran le remplace ensuite par « Bilan de monsite.fr », et le retour au
       francais restaure un titre que la personne n'a jamais vu. */
    if (!en) { if (TITRE_FR !== null) document.title = TITRE_FR; return; }
    if (TITRE_FR === null) TITRE_FR = document.title;
    var tKey = { rapport: "titleRapport", roast: "titleRoast", compte: "titleCompte" }[page];
    if (tKey && ENDICT.ui[tKey]) document.title = ENDICT.ui[tKey];
    if (ENDICT.titles && ENDICT.titles[page]) document.title = ENDICT.titles[page];
  }

  /* Pages statiques (home, classement, methodologie, generateur) : traduction par
     correspondance exacte du texte des elements, sans toucher au HTML source. */
  function applyPageMap(vers) {
    if (!ENDICT || !ENDICT.pages || I18N_PAGES.indexOf(page) === -1) return;
    var en = vers === "en";
    var map = ENDICT.pages;
    var sel = "main h1, main h2, main h3, main p, main li, main span, main a, main b, main small, main summary, main label, main cite, main button, main div, main dt, main dd, header .nav-links a, footer a, footer p, footer b, footer span";
    $$(sel).forEach(function (el) {
      /* La cle est le texte FRANCAIS. Une fois l'element traduit, son texte
         courant est anglais et ne retrouverait plus rien dans la table : on
         retient donc la cle et le HTML d'origine des le premier passage. */
      var cle = origine(el, "cle");
      if (cle == null) {
        var k = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (map[k] == null) return;
        memoriser(el, "cle", k);
        memoriser(el, "htmlFr", el.innerHTML);
        cle = k;
      }
      if (!en) { el.innerHTML = origine(el, "htmlFr"); return; }
      var val = map[cle];
      if (val == null) return;
      if (val.indexOf("<") !== -1) { el.innerHTML = val; return; }
      if (!el.children.length) { el.textContent = val; return; }
      var tn = null, n, i;
      for (i = 0; i < el.childNodes.length; i++) {
        n = el.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue.replace(/\s+/g, "")) { if (tn) { tn = null; break; } tn = n; }
      }
      if (tn) tn.nodeValue = val;
    });
    $$("input[placeholder], textarea[placeholder]").forEach(function (el) {
      var cle = origine(el, "phCle");
      if (cle == null) {
        if (map[el.placeholder] == null) return;
        cle = memoriser(el, "phCle", el.placeholder);
      }
      el.placeholder = en && map[cle] != null ? map[cle] : cle;
    });
  }

  function initLangToggle() {
    /* Blog et articles : la traduction vit dans un fichier separe (hreflang
       alternate) ; la pilule navigue vers ce fichier au lieu de recharger. */
    var altLink = null, cur = LANG;
    if (I18N_PAGES.indexOf(page) === -1) {
      /* Ici la langue courante est celle du FICHIER (documentElement.lang),
         pas la preference stockee : une page FR reste FR meme si pref=en. */
      cur = document.documentElement.lang === "en" ? "en" : "fr";
      var want = cur === "en" ? "fr" : "en";
      altLink = $('link[rel="alternate"][hreflang="' + want + '"]');
      if (!altLink || !altLink.href) return;
    }
    /* Dans .nav-links : la pilule suit le flux des liens (gap commun) au lieu
       de flotter seule a droite de la barre. */
    var nav = $(".nav-links") || $(".nav-inner");
    if (!nav) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-pill";
    function habiller() {
      /* Sur une page a jumeau, la pilule decrit le FICHIER courant, pas la
         preference stockee : un article FR affiche EN meme si pref=en. */
      var l = altLink ? cur : LANG;
      btn.textContent = l === "en" ? "FR" : "EN";
      btn.setAttribute("aria-label", l === "en" ? "Passer en français" : "Switch to English");
    }
    habiller();
    btn.addEventListener("click", function () {
      var vers = (altLink ? cur : LANG) === "en" ? "fr" : "en";
      try { localStorage.setItem("seoplus_lang", vers); } catch (e) {}
      /* Article de blog : sa traduction est un autre fichier, on y va.
         Chemin absolu, pas basename : depuis la migration en silos du 16/08,
         l'URL d'un article finit par « / » et son basename est VIDE (la pilule
         rechargeait la meme page, panne signalee par RBE). Le pathname du
         hreflang marche en prod comme sur le serveur local, tous deux servis
         a la racine. */
      if (altLink) { location.href = new URL(altLink.href).pathname; return; }
      basculerLangue(vers);
      habiller();
    });
    nav.appendChild(btn);
  }

  /* Bascule sur place. Aucune requete, aucun rechargement, et la position dans
     la page est conservee : c'est le meme document, seuls ses textes changent. */
  function basculerLangue(vers) {
    LANG = vers;
    isEN = vers === "en" && !!ENDICT;
    applyI18nStatic(vers);
    applyPageMap(vers);
    /* Le contenu construit en JS (bilan, rapport, classement) n'est pas dans le
       HTML : le traduire suppose de le redessiner a partir de ses donnees. */
    if (typeof REDESSINER === "function") { try { REDESSINER(); } catch (e) {} }
    /* Les liens internes portent la langue pour les pages qui n'ont pas d'URL
       anglaise dediee. Sans ca, un clic sur Tarifs repartait en francais.
       L'accueil se lie desormais par « / » (16/08, une seule forme d'URL en
       circulation), et le fragment est CONSERVE : l'ancienne version le
       perdait, un clic sur Tarifs en anglais arrivait en haut de page. */
    $$('a[href]').forEach(function (a) {
      var h = a.getAttribute("href") || "";
      if (/^(https?:|mailto:|tel:|#)/i.test(h)) return;
      var i = h.indexOf("#");
      var frag = i > -1 ? h.slice(i) : "";
      var base = h.split("?")[0].split("#")[0];
      /* Les liens du HTML portent le prefixe du site depuis la migration en
         sous-dossier. Les comparaisons se font sur le chemin sans prefixe, et
         le prefixe est remis avant l'ecriture : sans ca, « /tools/seoplus/ »
         ne ressemble ni a « / » ni a une page de I18N_PAGES, et la bascule de
         langue ne reecrivait plus aucun lien. */
      var rel = base.indexOf(BASE) === 0 ? base.slice(BASE.length) : base;
      /* Le blog a de vraies URLs par langue : le lien de nav bascule entre les
         deux listings au lieu de porter un parametre. */
      if (rel === "/blog/" || rel === "/en/blog/") {
        a.setAttribute("href", BASE + (vers === "en" ? "/en/blog/" : "/blog/") + frag);
        return;
      }
      var cible = rel === "/" ? "home"
        : /\.html$/i.test(rel) ? rel.replace(/^\//, "").replace(/\.html$/, "").replace(/^index$/, "home")
        : null;
      if (cible === null || I18N_PAGES.indexOf(cible) === -1) return;
      a.setAttribute("href", base + (vers === "en" ? "?lang=en" : "") + frag);
    });
    document.dispatchEvent(new CustomEvent("seoplus:langue", { detail: { lang: vers } }));
  }

  /* ---------- Auth Supabase (Google + magic link) ----------
     Le gate est purement UX/leadgen : les donnees viennent d'un webhook public,
     l'objectif est la capture de contact, pas la protection du contenu. */

  var sbInstance = null;
  function sbClient() {
    if (sbInstance) return sbInstance;
    if (!window.supabase || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return null;
    sbInstance = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce" }
    });
    return sbInstance;
  }

  /* Le SDK Supabase pese 203 Ko et ne sert qu'a l'authentification. Il etait
     charge sur CHAQUE page, y compris pour un visiteur anonyme qui lit un
     article de blog et ne se connectera jamais. Il est desormais telecharge au
     moment ou une operation en a reellement besoin.

     sbConfigure() repond a la question « l'authentification est-elle branchee
     sur ce site », qui ne demande pas le SDK. C'est ce que testaient les
     appels a sbClient() places avant toute connexion. */
  function sbConfigure() { return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY); }

  var sbPromesse = null;
  function avecSupabase(cb) {
    if (!sbConfigure()) { cb(null); return; }
    if (window.supabase) { cb(sbClient()); return; }
    if (!sbPromesse) {
      sbPromesse = new Promise(function (res) {
        var s = document.createElement("script");
        s.src = BASE + "/assets/vendor/supabase.min.js?v=20260814b";
        s.onload = function () { res(true); };
        s.onerror = function () { res(false); };
        document.head.appendChild(s);
      });
    }
    sbPromesse.then(function (ok) { cb(ok ? sbClient() : null); });
  }

  /* Une session ouverte laisse sa trace en local sous une cle sb-<ref>-auth-token.
     La lire evite de telecharger le SDK pour apprendre que le visiteur n'est pas
     connecte, ce qui est le cas de l'immense majorite. On balaye les cles plutot
     que de reconstruire la reference du projet : le nom reste juste meme si
     l'adresse du projet change. Si la cle etait un jour renommee par Supabase,
     le pire cas est qu'on propose de se connecter a quelqu'un qui l'est deja,
     et sa session reprend au premier clic. */
  function sessionStockee() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true;
      }
    } catch (e) {}
    return false;
  }

  function authCardHtml(title, sub, badge) {
    return '<div class="auth-card">' +
      '<span class="report-badge">' + (badge || tUI("reportReady", "Rapport prêt")) + "</span>" +
      "<h2>" + title + "</h2>" +
      "<p>" + sub + "</p>" +
      '<button type="button" class="btn auth-google" data-auth-google>' +
        '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-3.9-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>' +
        tUI("authGoogle", "Continuer avec Google") + "</button>" +
      '<div class="auth-sep"><span>' + tUI("authOr", "ou par email") + "</span></div>" +
      '<form class="auth-magic" data-auth-magic>' +
        '<input type="email" name="email" required placeholder="' + tUI("emailPlaceholder", "votre@email.fr") + '" autocomplete="email" aria-label="Adresse email">' +
        '<button type="submit" class="btn btn-primary">' + tUI("authMagic", "Recevoir le code") + "</button>" +
      "</form>" +
      '<form class="auth-magic auth-code" data-auth-code hidden>' +
        '<input type="text" name="code" required inputmode="numeric" maxlength="12" autocomplete="one-time-code" placeholder="' + tUI("authCodePlaceholder", "Code recu") + '" aria-label="Code de connexion recu par email">' +
        '<button type="submit" class="btn btn-primary">' + tUI("authCodeBtn", "Se connecter") + "</button>" +
      "</form>" +
      '<button type="button" class="auth-again" data-auth-again hidden>' + tUI("authAgain", "Recevoir un nouveau code") + "</button>" +
      '<p class="auth-status" data-auth-status hidden></p>' +
      '<p class="auth-note">' + tUI("authNote", "Gratuit, sans carte bancaire. Votre email sert à retrouver vos rapports et à vous prévenir quand un nouvel audit de votre site est utile. Jamais de publicité, jamais de revente.") + ' <a href="politique-confidentialite.html">' + tUI("authPrivacy", "Confidentialité") + "</a></p>" +
    "</div>";
  }

  /* Branche les actions d'une carte auth.
     Google : redirection OAuth, la session est relue au chargement suivant.
     Email : code numerique, et non plus un lien (change le 07/08/2026).
     La longueur du code est un reglage Supabase (8 chiffres sur ce projet) :
     elle n'est presumee nulle part dans ce fichier.

     Pourquoi : les messageries d'entreprise (Microsoft 365 / SafeLinks,
     Proofpoint, Barracuda) ouvrent automatiquement les liens recus pour les
     inspecter, AVANT que le destinataire ne clique. Un lien de connexion etant
     a usage unique, le scanner consommait le jeton et la personne recevait
     "lien invalide ou expire" sans jamais ouvrir de session. Constate le
     07/08 sur une adresse Microsoft 365 : compte cree, email confirme par le
     scanner, zero session, quatre tentatives. Un code saisi a la main ne peut
     pas etre consomme par un robot.

     Apres verification on recharge la page : tout le reste du code suppose que
     la session est lue au chargement, jamais posee a chaud. */
  /* La carte de connexion vient d'etre posee a l'ecran : c'est le bon moment
     pour aller chercher le SDK, la personne va lire avant de cliquer. */
  function bindAuthCard(root) {
    avecSupabase(function (client) { if (client) bindAuthCardAvec(root, client); });
  }

  function bindAuthCardAvec(root, client) {
    var status = $("[data-auth-status]", root);
    var formEmail = $("[data-auth-magic]", root);
    var formCode = $("[data-auth-code]", root);
    var again = $("[data-auth-again]", root);
    var pendingEmail = "";

    function say(msg, isError) {
      status.textContent = msg;
      status.classList.toggle("bad", !!isError);
      status.hidden = false;
    }
    function showCodeStep(on) {
      formEmail.hidden = !!on;
      formCode.hidden = !on;
      again.hidden = !on;
    }
    /* Memorise la page a rouvrir apres connexion : si l'allowlist Supabase
       rejette le redirectTo, le retour atterrit sur la Site URL (racine) et
       handleAuthReturn() nous ramene ici. Utile pour Google uniquement : le
       code par email ne quitte jamais la page. */
    function rememberReturn() {
      try { localStorage.setItem("seoplus_auth_return", window.location.href); } catch (e) {}
    }

    $("[data-auth-google]", root).addEventListener("click", function () {
      rememberReturn();
      client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href }
      }).then(function (res) {
        if (res.error) say(tUI("authGoogleKo", "Connexion Google indisponible pour le moment. Essayez par email."), true);
      });
    });

    /* Chaque nouvelle demande de code INVALIDE la precedente, et Supabase
       refuse les demandes trop rapprochees (429). Sans garde-fou, la personne
       qui reclique par impatience annule le code qu'elle vient de recevoir et
       s'enferme dans une boucle d'echecs. Observe en production le 07/08 :
       sept tentatives refusees pour deux connexions reussies, dont un 429.
       D'ou le compte a rebours sur le renvoi, et le mot "dernier" dans le
       message : ce sont les deux seules choses qui evitent la boucle. */
    var renvoiTimer = null;
    function armerRenvoi(secondes) {
      var reste = secondes;
      var libelle = tUI("authAgain", "Recevoir un nouveau code");
      if (renvoiTimer) { clearInterval(renvoiTimer); renvoiTimer = null; }
      again.disabled = true;
      again.textContent = tFmt("authAgainWait", "Nouveau code dans {s} s", { s: reste });
      renvoiTimer = setInterval(function () {
        reste -= 1;
        if (reste > 0) {
          again.textContent = tFmt("authAgainWait", "Nouveau code dans {s} s", { s: reste });
          return;
        }
        clearInterval(renvoiTimer); renvoiTimer = null;
        again.disabled = false;
        again.textContent = libelle;
      }, 1000);
    }

    /* Etape 1 : demander le code. Pas de emailRedirectTo : aucun lien n'est
       attendu en retour, la personne revient avec son code sur cette page. */
    function sendCode(email) {
      var btnMail = $("button", formEmail);
      btnMail.disabled = true;
      again.disabled = true;
      say(tUI("authSending", "Envoi du code..."));
      client.auth.signInWithOtp({ email: email }).then(function (res) {
        btnMail.disabled = false;
        if (res.error) {
          var msg = "" + (res.error.message || "");
          /* 429 : message d'origine en anglais et peu parlant. */
          if (res.error.status === 429 || /security purposes|rate limit|too many/i.test(msg)) {
            showCodeStep(true);
            say(tUI("authTropVite", "Trop de demandes rapprochees. Patientez un instant, puis redemandez un code."), true);
            armerRenvoi(60);
            return;
          }
          again.disabled = false;
          say(tFmt("authSendKo", "Envoi impossible ({err}). Reessayez ou passez par Google.", { err: msg }), true);
          return;
        }
        pendingEmail = email;
        showCodeStep(true);
        say(tFmt("authCodeSent", "Code envoye a {email}. Saisissez le DERNIER code recu (pensez aux spams).", { email: email }));
        var input = $("input", formCode);
        input.value = "";
        try { input.focus(); } catch (e) {}
        armerRenvoi(60);
      });
    }

    formEmail.addEventListener("submit", function (e) {
      e.preventDefault();
      /* Champs lus par selecteur et non par acces nomme (form.email) : un nom
         de champ qui percute une propriete native du formulaire renverrait
         autre chose qu'un input, sans erreur visible. */
      var field = $("input[name=email]", formEmail);
      var email = ((field && field.value) || "").trim();
      if (email) sendCode(email);
    });

    again.addEventListener("click", function () {
      if (pendingEmail) sendCode(pendingEmail);
    });

    /* Un code demande par une personne qui n'a pas encore de compte est un
       jeton de type "signup", pas "email" : on essaie les deux plutot que de
       renvoyer "code incorrect" a la premiere inscription. Un essai qui echoue
       ne consomme rien. */
    function verifyWith(types, code, done) {
      var i = 0;
      function step() {
        client.auth.verifyOtp({ email: pendingEmail, token: code, type: types[i] }).then(function (res) {
          if (!res.error) { done(null); return; }
          i += 1;
          if (i < types.length) step(); else done(res.error);
        }, function (err) {
          i += 1;
          if (i < types.length) step(); else done(err || new Error("verify"));
        });
      }
      step();
    }

    /* Etape 2 : verifier le code. Succes = session posee immediatement, on
       recharge pour repasser par le chemin normal (gate, rapport, compte). */
    formCode.addEventListener("submit", function (e) {
      e.preventDefault();
      var field = $("input[name=code]", formCode);
      var code = ((field && field.value) || "").replace(/[^0-9]/g, "");
      /* La longueur du code est un reglage Supabase (6 a 10 selon le projet,
         8 ici) : ne jamais la coder en dur cote site. On verifie seulement
         qu'un code plausible a ete saisi, le serveur tranche le reste. */
      if (code.length < 6 || code.length > 12) {
        say(tUI("authCodeFormat", "Saisissez le code recu par email."), true);
        return;
      }
      var btnCode = $("button", formCode);
      btnCode.disabled = true;
      say(tUI("authChecking", "Verification..."));
      verifyWith(["email", "signup"], code, function (err) {
        if (err) {
          btnCode.disabled = false;
          say(tUI("authCodeKo", "Code incorrect ou expire. Verifiez que c'est bien le dernier recu."), true);
          return;
        }
        /* Filet : une reponse sans session laisserait la page muette. */
        client.auth.getSession().then(function (s) {
          if (s && s.data && s.data.session) {
            say(tUI("authOk", "Connexion reussie, un instant..."));
            window.location.reload();
          } else {
            btnCode.disabled = false;
            say(tUI("authNoSession", "Connexion incomplete. Reessayez ou passez par Google."), true);
          }
        });
      });
    });
  }

  /* Capitalise le contact : upsert par (user, host), met a jour le score au re-audit. */
  function recordLead(user, host, score, grade) {
    var client = sbClient();
    if (!client || !user || !host) return;
    var meta = user.user_metadata || {};
    client.from("leads").upsert({
      user_id: user.id,
      email: user.email,
      name: meta.full_name || meta.name || null,
      host: host,
      score: score == null ? null : Math.round(Number(score)),
      grade: grade || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,host" }).then(function () {}, function () {});
  }

  /* Historique : chaque audit genere (diagnostic gratuit ou complet) est archive
     dans Supabase (table reports, RLS par user) et reapparait sur Mon compte. */
  function saveReport(user, data, url, kind) {
    var client = sbClient();
    if (!client || !user || !data || !data.host) return;
    client.from("reports").insert({
      user_id: user.id,
      host: data.host,
      url: url || null,
      score: data.score == null ? null : Math.round(Number(data.score)),
      grade: data.grade || null,
      kind: kind || "complet",
      utm: UTM,
      payload: data
    }).then(function () {}, function () {});
  }

  /* Societe : demandee une seule fois apres le premier audit connecte (table
     profiles, RLS par user). Optionnel, jamais bloquant, memorisable "plus tard". */
  function promptCompany(user, container) {
    var client = sbClient();
    if (!client || !user || !container) return;
    try { if (localStorage.getItem("seoplus_company_done")) return; } catch (e) {}
    client.from("profiles").select("company").eq("user_id", user.id).maybeSingle().then(function (res) {
      if (res.error) return;
      if (res.data && res.data.company) {
        try { localStorage.setItem("seoplus_company_done", "1"); } catch (e) {}
        return;
      }
      var card = document.createElement("div");
      card.className = "company-card";
      card.innerHTML =
        '<div class="company-text"><b>' + tUI("companyTitle", "Une dernière chose : votre société ?") + "</b>" +
        "<p>" + tUI("companySub", "Optionnel. Ça nous aide à adapter nos conseils à votre activité.") + "</p></div>" +
        '<form class="company-form"><input type="text" name="company" maxlength="120" placeholder="' + tUI("companyPlaceholder", "Nom de votre société") + '" aria-label="Société">' +
        '<button type="submit" class="btn btn-primary">' + tUI("companySave", "Enregistrer") + "</button>" +
        '<button type="button" class="company-later">' + tUI("companyLater", "Plus tard") + "</button></form>";
      container.insertBefore(card, container.firstChild);
      $(".company-later", card).addEventListener("click", function () {
        try { localStorage.setItem("seoplus_company_done", "1"); } catch (e) {}
        card.remove();
      });
      $(".company-form", card).addEventListener("submit", function (e) {
        e.preventDefault();
        var company = (e.target.company.value || "").trim();
        if (!company) { card.remove(); return; }
        client.from("profiles").upsert({
          user_id: user.id,
          company: company,
          updated_at: new Date().toISOString()
        }).then(function () {}, function () {});
        try { localStorage.setItem("seoplus_company_done", "1"); } catch (e) {}
        card.innerHTML = '<div class="company-text"><b>' + (isEN ? "Thanks!" : "Merci !") + "</b><p>" + tUI("companyDone", "C'est noté.") + "</p></div>";
        setTimeout(function () { card.remove(); }, 2200);
      });
    }, function () {});
  }

  function getUser(cb) {
    /* Aucune trace de session en local : inutile de telecharger le SDK pour se
       l'entendre confirmer. C'est le cas de presque tous les chargements. */
    if (!sessionStockee()) { cb(null); return; }
    avecSupabase(function (client) {
      if (!client) { cb(null); return; }
      client.auth.getSession().then(function (res) {
        cb((res.data && res.data.session && res.data.session.user) || null);
      }, function () { cb(null); });
    });
  }

  /* Icone compte (bonhomme) en haut a droite, sur toutes les pages, connecte
     ou non : compte.html affiche la connexion si besoin, puis l'historique. */
  function initAccountLink() {
    var nav = $(".nav-links");
    if (!nav) return;
    var a = document.createElement("a");
    a.href = BASE + "/compte.html";
    a.className = "nav-account";
    a.setAttribute("aria-label", "Mon compte");
    a.title = "Mon compte";
    a.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    nav.appendChild(a);
  }

  /* Menu mobile : burger + panneau deroulant, injectes en JS pour ne pas
     dupliquer le markup dans toutes les pages. Le panneau clone les liens de
     la nav (CTA comprise) ; l'icone compte reste dans la barre. */
  function initMobileNav() {
    var header = $(".nav");
    var inner = $(".nav-inner");
    var links = $(".nav-links");
    if (!header || !inner || !links) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-burger";
    btn.setAttribute("aria-label", "Ouvrir le menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span></span><span></span><span></span>";
    inner.appendChild(btn);
    var panel = document.createElement("nav");
    panel.className = "nav-mobile";
    panel.setAttribute("aria-label", "Navigation mobile");
    header.appendChild(panel);
    function close() {
      document.body.classList.remove("nav-open");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Ouvrir le menu");
    }
    btn.addEventListener("click", function () {
      var open = !document.body.classList.contains("nav-open");
      if (open) {
        panel.innerHTML = "";
        $$("a", links).forEach(function (a) {
          if (a.classList.contains("nav-account")) return;
          panel.appendChild(a.cloneNode(true));
        });
      }
      document.body.classList.toggle("nav-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    });
    panel.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
    document.addEventListener("click", function (e) {
      if (document.body.classList.contains("nav-open") && !e.target.closest(".nav")) close();
    });
  }

  /* Retour OAuth / magic link : le ?code= peut atterrir sur n'importe quelle
     page (Site URL en fallback). Creer le client suffit a echanger le code
     (detectSessionInUrl) ; une fois la session posee, on repart vers la page
     memorisee avant la connexion, sinon on nettoie juste l'URL. */
  function handleAuthReturn() {
    /* Le test du ?code= passe AVANT le chargement du SDK : sans lui, chaque
       page allait chercher 203 Ko pour decouvrir qu'elle n'a rien a echanger. */
    if (!/[?&]code=/.test(window.location.search)) return;
    avecSupabase(function (client) { if (client) echangerCode(client); });
  }

  function echangerCode(client) {
    var handled = false;
    client.auth.onAuthStateChange(function (event, session) {
      if (handled || !session) return;
      handled = true;
      var params = new URLSearchParams(window.location.search);
      params.delete("code");
      var qs = params.toString();
      var clean = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
      var ret = null;
      try {
        ret = localStorage.getItem("seoplus_auth_return");
        localStorage.removeItem("seoplus_auth_return");
      } catch (e) {}
      if (ret && ret !== window.location.origin + clean) window.location.replace(ret);
      else window.history.replaceState(null, "", clean);
    });
  }

  /* ---------- Landing : mini-rapport anime du hero ---------- */

  /* Normalise une saisie utilisateur en URL https absolue. */
  function normalizeUrl(raw) {
    var v = (raw || "").trim();
    if (!v) return "";
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    return v;
  }

  /* Lignes du classement public (partage entre la home et classement.html) */
  function rankRowsHtml(sites) {
    var html = '<div class="rank-row rank-row--head"><span>' + (isEN ? "Rank" : "Rang") + "</span><span>Site</span><span>Score</span></div>";
    sites.forEach(function (s) {
      var score = Math.max(0, Math.min(100, Math.round(Number(s.score) || 0)));
      var cls = score >= 70 ? "good" : score >= 50 ? "warn" : "bad";
      html += '<div class="rank-row' + (s.rank === 1 ? " rank-row--first" : "") + '">' +
        '<span class="rank-pos mono">' + Number(s.rank) + '</span>' +
        '<span class="rank-host">' + esc(s.host) + '</span>' +
        '<span class="rank-score mono ' + cls + '">' + score + '<small>/100</small></span>' +
        '</div>';
    });
    return html;
  }

  /* Seuil du podium : au-dessus, le site sort du tableau et passe en carte doree.
     Une seule constante, partagee par la home et /classement. */
  var ELITE_MIN = 90;

  /* Le classement est fige dans le HTML au deploiement (voir
     09 Deploiement/(C) generer-snapshot-classement.js) : les crawlers IA, qui
     n'executent pas JavaScript, voient enfin de vrais sites avec de vrais
     scores au lieu d'un "Chargement du classement...". Le fetch ne fait que
     rafraichir cette photo.
     Consequence sur les chemins d'echec : quand le reseau ne repond pas, il ne
     faut SURTOUT pas afficher l'etat vide, sinon la page annoncerait "le
     classement demarre" juste au-dessus d'un classement rempli. On garde la
     photo, qui date au pire du dernier deploiement. */
  function aUnSnapshot(el) {
    return !!(el && el.children.length);
  }

  function eliteCardsHtml(sites) {
    return sites.map(function (s) {
      var score = Math.max(0, Math.min(100, Math.round(Number(s.score) || 0)));
      return '<article class="elite-card">' +
        '<span class="elite-rank mono">#' + Number(s.rank) + "</span>" +
        '<span class="elite-tag">' + esc(tUI("eliteTag", "Élite")) + "</span>" +
        '<h3 class="elite-host">' + esc(s.host) + "</h3>" +
        '<p class="elite-score mono"><b>' + score + "</b><span>/100</span></p>" +
        "</article>";
    }).join("");
  }

  /* Rend le classement complet : podium Elite au-dessus, tableau pour le reste.
     Un site n'apparait jamais dans les deux, sinon le total affiche est faux. */
  function renderRanking(sites, eliteEl, tableEl, headEl) {
    REDESSINER = function () { renderRanking(sites, eliteEl, tableEl, headEl); };
    var elite = sites.filter(function (s) { return Number(s.score) >= ELITE_MIN; });
    var rest = sites.filter(function (s) { return Number(s.score) < ELITE_MIN; });

    if (eliteEl) {
      if (elite.length) {
        eliteEl.innerHTML = eliteCardsHtml(elite);
        eliteEl.hidden = false;
        if (headEl) headEl.hidden = false;
      } else {
        eliteEl.hidden = true;
        if (headEl) headEl.hidden = true;
      }
    }

    if (tableEl) {
      /* Sans podium, le tableau porte tout le classement. */
      var rows = eliteEl ? rest : sites;
      if (rows.length) {
        tableEl.innerHTML = rankRowsHtml(rows);
        tableEl.hidden = false;
      } else {
        tableEl.hidden = true;
      }
    }
  }

  function initHome() {
    var heroForm = $("#hero-roast-form");
    if (heroForm) {
      heroForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = $("#hero-url");
        var url = normalizeUrl(input.value);
        try { new URL(url); } catch (err) { input.focus(); return; }
        var optin = $("#hero-optin");
        window.location.href = BASE + "/bilan.html?url=" + encodeURIComponent(url) + (optin && optin.checked ? "&classement=1" : "");
      });
    }

    // Top 5 du classement public sur la home
    var rankLoad = $("#home-rank-loading");
    if (rankLoad) {
      var rankFail = function () {
        rankLoad.hidden = true;
        /* Meme regle que sur /classement : la photo figee au deploiement vaut
           mieux qu'un message d'etat vide pose par-dessus elle. */
        if (aUnSnapshot($("#home-rank-elite")) || aUnSnapshot($("#home-rank-table"))) return;
        $("#home-rank-empty").hidden = false;
      };
      if (!CFG.CLASSEMENT_URL) {
        rankFail();
      } else {
        fetch(CFG.CLASSEMENT_URL)
          .then(function (r) { return r.text(); })
          .then(function (t) {
            var data = null;
            try { data = JSON.parse(t); } catch (e) {}
            if (!data || data.ok === false) throw new Error();
            rankLoad.hidden = true;
            if (!data.sites || !data.sites.length) { rankFail(); return; }
            /* Meme fonction que /classement : le cercle Elite se decide a un
               seul endroit (ELITE_MIN), donc la home ne peut pas diverger de la
               page de classement le jour ou le seuil bouge. */
            renderRanking(data.sites.slice(0, 5), $("#home-rank-elite"), $("#home-rank-table"), $("#home-rank-elite-head"));
          })
          .catch(rankFail);
      }
    }

    // Compteur public d'audits (stats live, masque si l'endpoint ne repond pas)
    var statAudits = $("#stat-audits");
    if (statAudits && CFG.STATS_URL) {
      fetch(CFG.STATS_URL)
        .then(function (r) { return r.json(); })
        .then(function (s) {
          var total = Number(s && s.audits) || 0;
          if (!total) return;
          var b = statAudits.querySelector("b");
          statAudits.classList.remove("stat--pending");
          /* Le chiffre est desormais ECRIT dans le HTML (visible des le premier
             rendu, crawlers compris) : le webhook ne fait que le rafraichir.
             L'animation part donc de la valeur affichee, pas de zero, sinon le
             compteur retomberait a 0 sous les yeux du visiteur. */
          var depart = Number(b.textContent) || 0;
          if (total === depart) return;
          if (reducedMotion) { b.textContent = total; return; }
          var t0 = null;
          var tick = function (t) {
            if (!t0) t0 = t;
            var p = Math.min(1, (t - t0) / 900);
            b.textContent = Math.round(depart + (total - depart) * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })
        .catch(function () {});
    }

    var ring = $(".score-ring .value");
    var num = $(".score-num strong");
    var finding = $(".report-finding");
    if (!ring) return;

    var target = 58;
    var circumference = 2 * Math.PI * 48;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference;

    function run() {
      ring.style.strokeDashoffset = circumference * (1 - target / 100);

      if (reducedMotion) {
        num.textContent = target;
      } else {
        var start = null;
        var animate = function (ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / 1500, 1);
          num.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }

      $$(".cat-bar .fill").forEach(function (fill, i) {
        var v = Number(fill.dataset.value) / 100;
        setTimeout(function () { fill.style.transform = "scaleX(" + v + ")"; }, reducedMotion ? 0 : 150 + i * 90);
      });

      setTimeout(function () { finding && finding.classList.add("visible"); }, reducedMotion ? 0 : 1400);
    }

    setTimeout(run, reducedMotion ? 0 : 300);
  }

  /* ---------- /roast : le roast gratuit ---------- */

  function statusFromScore(s) {
    if (s >= 70) return "good";
    if (s >= 45) return "warn";
    return "bad";
  }

  /* Mock demo, calque sur l'exemple romainben.cloud. */
  function roastMock(url) {
    var host;
    try { host = new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { host = "votre-site.fr"; }
    return {
      ok: true,
      host: host,
      url: url,
      score: 66,
      grade: "C",
      counts: { conformes: 22, avertissements: 7, erreurs: 8 },
      punch: "Bon... ça tient debout, mais faut pas pousser trop fort.",
      verdict: "Le site " + host + " obtient un score global de 66/100, ce qui indique des améliorations nécessaires. Les deux points forts sont sa gestion de la vie privée et des traceurs (99/100) et sa performance (92/100). Les deux faiblesses critiques : la structure et le contenu (25/100) et la conformité légale (45/100). La priorité devrait être de créer un fichier robots.txt et un sitemap XML pour améliorer la structure du site.",
      concurrentiel: "Le site opère dans les services numériques et la consultation en technologie. Face aux acteurs types du secteur, il bénéficie d'un avantage défendable sur la souveraineté de l'hébergement et la mesure d'audience souveraine. En revanche, il accuse un retard sur le contenu et la structure, avec des lacunes notables (sitemap XML, robots.txt) qui pèsent sur sa visibilité. Pour progresser, priorité au contenu, à la structure et à la conformité légale.",
      categories: [
        { label: "Structure & contenu", score: 25, teaser: "Sitemap XML absent, robots.txt incomplet, jamais archivé par la Wayback Machine." },
        { label: "Conformité légale", score: 45, teaser: "Pages légales incomplètes : CGU/CGV manquantes selon la juridiction." },
        { label: "Email (SPF/DKIM/DMARC)", score: 33, teaser: "Configuration d'authentification e-mail partielle, risque d'usurpation." },
        { label: "En-têtes de sécurité HTTP", score: 55, teaser: "CSP, HSTS preload et security.txt à corriger ou absents." },
        { label: "SEO on-page", score: 90, teaser: "Titres, meta descriptions et H1 propres sur les pages analysées." },
        { label: "Visibilité SEO / IA", score: 82, teaser: "Découvrable par les moteurs et les crawlers IA, ai.txt manquant." },
        { label: "Optimisation IA (GEO)", score: 88, teaser: "JSON-LD présent, mais peu de statistiques et de citations exploitables." },
        { label: "Performance", score: 92, teaser: "Bon score Lighthouse mobile, Core Web Vitals dans le vert." },
        { label: "TLS / certificat", score: 90, teaser: "Certificat valide, TLS 1.3, chaîne conforme." },
        { label: "Vie privée & traceurs", score: 99, teaser: "Aucun cookie ni traceur détecté sur la page d'accueil." }
      ],
      server: {
        flag: "🇫🇷",
        city: "Paris, Île-de-France",
        ip: "148.230.115.190",
        type: "IPv4",
        asn: "Hostinger International (AS47583)",
        tz: "Europe/Paris (UTC +02:00)",
        cc: "FR",
        lat: 48.85,
        lon: 2.35
      },
      og: {
        title: "Romain Ben | Co-fondateur OptimizIA.xyz",
        desc: "Étudiant ingénieur en maths appliquées, co-fondateur d'OptimizIA. Automatisation, IA et dev au service des PME/ETI.",
        hasImage: false,
        note: "Image de partage recommandée : 1200×630 px, JPG ou PNG, < 5 Mo, balise og:image."
      },
      signaux: { https: true, robots: false, sitemap: false, llms: false, jsonld: true, org: false, faq: false, sameas: false, spf: false, dmarc: false, csp: false, hsts: false, og: false, trackers: false, legal: true, mots: 420, h2: 4, liens: 3, stats: 2 },
      cwv: {
        ok: true, perfScore: 92, source: "lab",
        lcp: { value: "2.1", unit: "s", rating: "good" },
        cls: { value: "0.02", unit: "", rating: "good" },
        inp: { value: "140", unit: "ms", rating: "good", proxy: true }
      }
    };
  }

  function renderRoast(data) {
    /* Le bilan est entierement construit en JS : sans ce rappel, une bascule de
       langue traduirait l'habillage de la page et laisserait le rapport en
       francais au milieu. */
    REDESSINER = function () { renderRoast(data); };
    /* Rien ne s'affiche avant que la traduction des constats soit la, sinon le
       rapport sortirait a moitie en francais le temps du telechargement. */
    if (!dictAuditPret()) { chargerDictAudit(function () { renderRoast(data); }); return; }
    var host = data.host || data.url;
    $("#rv-host").textContent = host;

    var score = Math.max(0, Math.min(100, Number(data.score) || 0));
    $("#rv-punch").textContent = (isEN && data.punch_en) || data.punch || "";
    $("#rv-verdict-long").textContent = (isEN && data.verdict_en) || data.verdict || "";
    $("#rv-concurrentiel").textContent = (isEN && data.concurrentiel_en) || data.concurrentiel || "";

    var c = data.counts || {};

    /* Trajectoire : deux chiffres et un ecart, a la place de la note lettre.
       Ce que le visiteur doit retenir n'est pas "vous valez B", c'est "il vous
       manque N points et ils sont atteignables". La cible sort de targetScore,
       le meme calcul que le plan d'action du rapport complet : les deux ecrans
       ne doivent jamais annoncer deux objectifs differents. */
    var cible = targetScore(score, (c.erreurs || 0) > 0 || (c.avertissements || 0) > 0);
    var trajNow = $("#rv-traj-now"), trajGoal = $("#rv-traj-goal"), trajLabel = $("#rv-traj-label");
    if (trajNow) trajNow.textContent = score;
    if (trajGoal) trajGoal.textContent = cible;
    if (trajLabel) {
      trajLabel.textContent = isEN
        ? (cible - score) + " points within reach in 4 weeks"
        : (cible - score) + " points à gagner en 4 semaines";
    }

    /* Compteurs : on ne compte plus des fautes, on compte des points d'appui,
       des gains disponibles et des urgences. Meme mesure, autre regard. */
    $("#rv-counts").innerHTML =
      '<span class="rv-count good"><b>' + (c.conformes || 0) + "</b> " + tUI("acquis", "acquis") + "</span>" +
      '<span class="rv-count warn"><b>' + (c.avertissements || 0) + "</b> " + tUI("aGagner", "à gagner") + "</span>" +
      '<span class="rv-count bad"><b>' + (c.erreurs || 0) + "</b> " + tUI("urgents", "urgents") + "</span>";

    /* Un bon score arrete la lecture : la personne voit 91, se rassure et
       ferme l'onglet sans jamais descendre. Ce bouton dit combien de choses
       restent ouvertes et emmene directement dessus. */
    var aTraiter = (c.erreurs || 0) + (c.avertissements || 0);
    var jump = $("#rv-jump"), jumpTxt = $("#rv-jump-text");
    if (jump) {
      jump.hidden = !aTraiter;
      if (aTraiter && jumpTxt) {
        jumpTxt.textContent = isEN
          ? "See the " + aTraiter + " errors and warnings found"
          : "Voir les " + aTraiter + " erreurs et avertissements relevés";
      }
      jump.onclick = function (ev) {
        ev.preventDefault();
        var cible = $("#rv-cats");
        if (cible) cible.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      };
    }

    renderAnalyzedAt($("#rv-analyzed"), data);

    /* Rapport partiel (pare-feu anti-robot) : on l'annonce clairement et on ne
       vend pas un rapport complet que le moteur ne pourra pas produire. */
    var partBox = $("#rv-partiel");
    if (partBox) {
      var partNote = $("#rv-partiel-note");
      var partTitle = partBox.querySelector("b");
      var allowLink = function () {
        var lnk = document.createElement("a");
        lnk.href = "methodologie.html#autoriser-seoplusbot";
        lnk.className = "roast-partiel-link";
        lnk.textContent = isEN ? "How to allow SEOPlusBot, in one minute" : "Comment autoriser SEOPlusBot, en une minute";
        partNote.appendChild(document.createTextNode(" "));
        partNote.appendChild(lnk);
      };
      if (data.partiel) {
        partNote.textContent = isEN
          ? "This website's firewall refused our robots access to its pages. That is not a flaw and it costs you no points: the score above was recalculated on the only layers measurable without page access (email, domain name, certificates, technical files, performance measured by Google), and nothing was counted against you for what could not be read. Allow our robot (user-agent SEOPlusBot/1.0, IP 148.230.115.190) for the time of the analysis to get the full audit."
          : (data.partielNote || "Ce site bloque les analyses automatiques. Ce n'est pas un défaut et cela ne vous coûte aucun point : le score a été recalculé sur les seules couches mesurables sans accès aux pages. Relancez l'analyse plus tard pour un audit complet.");
        allowLink();
        partBox.hidden = false;
        var badge = document.querySelector(".rv-meta .report-badge");
        if (badge) badge.textContent = tUI("partielBadge", "Audit partiel");
      } else if (data.remesureBloquee) {
        /* La mesure du jour a echoue sur le pare-feu, mais une mesure complete
           recente existe : c'est elle qui est servie, datee. Ce n'est pas un
           audit partiel, c'est un audit complet qui n'est pas d'aujourd'hui. */
        if (partTitle) partTitle.textContent = isEN
          ? "Today's re-measurement was refused by this site's firewall."
          : "La remesure d'aujourd'hui a été refusée par le pare-feu du site.";
        partNote.textContent = isEN
          ? "You are seeing the last complete measurement, taken on " + fmtAnalyzedAt(data.analyzedAt) + ". Nothing was recalculated: this is the full audit exactly as it was measured. Allow our robot to get a fresh one."
          : "Vous voyez la dernière mesure complète, réalisée le " + fmtAnalyzedAt(data.analyzedAt) + ". Rien n'a été recalculé : c'est l'audit complet tel qu'il a été mesuré. Autorisez notre robot pour en obtenir un nouveau.";
        allowLink();
        partBox.hidden = false;
      } else {
        partBox.hidden = true;
      }
    }
    var ctaBox = document.querySelector(".roast-final-cta");
    if (ctaBox) ctaBox.hidden = !!data.partiel;

    // Anneau de score
    var ring = $("#rv-ring-value");
    var circ = 2 * Math.PI * 58;
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ;
    ring.classList.add(statusFromScore(score));
    var num = $("#rv-score");
    setTimeout(function () {
      ring.style.strokeDashoffset = circ * (1 - score / 100);
      if (reducedMotion) { num.textContent = score; return; }
      var start = null;
      requestAnimationFrame(function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / 1400, 1);
        num.textContent = Math.round(score * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      });
    }, reducedMotion ? 0 : 200);

    /* Carte des points (maquette D, 14/08) : chaque chapitre porte son numero
       stable (l'ordre du moteur), une rangee de pastilles, une par
       verification, puis ses constats en echec, NOMMES. C'est le nom qui
       inquiete et donne envie du rapport, bien plus que le flou. Ce qui reste
       verrouille : la valeur mesuree et le correctif. Le flou en dessous ne
       cache pas un texte, il occupe sa place : le serveur n'envoie rien, il
       n'y a donc rien a lire dans l'inspecteur. */
    var LOCK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    var ICO = {
      bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v9M12 18h.01"/></svg>'
    };
    var numeroChap = {};
    (data.categories || []).forEach(function (c, i) { numeroChap[c.label] = i + 1; });
    var cats = (data.categories || []).slice().sort(function (a, b) { return a.score - b.score; });

    var tot = { good: 0, warn: 0, bad: 0, info: 0 };
    $("#rv-cats").innerHTML = cats.map(function (cat) {
      var st = cat.status || statusFromScore(cat.score);
      var det = cat.details || [];
      var n = { good: 0, warn: 0, bad: 0, info: 0 };

      var dots = det.map(function (d) {
        n[d.level] = (n[d.level] || 0) + 1;
        tot[d.level] = (tot[d.level] || 0) + 1;
        var cls = d.level === "good" ? "ok" : d.level === "info" ? "na" : d.level;
        return '<i class="rv-pel ' + cls + '"' + (d.label ? ' title="' + esc(trCheck(d.label)) + '"' : "") + "></i>";
      }).join("");
      var resume = tFmt("dotsResume", "{ok} conformes, {warn} à améliorer, {bad} à corriger",
        { ok: n.good, warn: n.warn, bad: n.bad });

      /* Largeurs variables mais deterministes : des barres toutes identiques se
         lisent comme un gabarit vide, pas comme du contenu masque. */
      var fx = det.filter(function (d) { return d.level === "bad" || d.level === "warn"; })
        .sort(function (a, b) { return (a.level === "bad" ? 0 : 1) - (b.level === "bad" ? 0 : 1); })
        .map(function (d, i) {
          var flou = "";
          for (var k = 0; k < 2 + (i % 2); k++) {
            flou += '<i style="width:' + (46 + ((i * 41 + k * 29) % 48)) + '%"></i>';
          }
          var label = d.label ? trCheck(d.label)
            : (d.level === "bad" ? tUI("fxAnonBad", "Constat critique") : tUI("fxAnonWarn", "Constat à améliorer"));
          return '<div class="rv-fx rv-fx--' + d.level + '">' +
            '<div class="rv-fx-head">' +
              '<span class="rv-fx-ico" aria-hidden="true">' + ICO[d.level] + "</span>" +
              '<span class="rv-fx-label">' + esc(label) + "</span>" +
              '<span class="rv-fx-tag">' + (d.level === "bad" ? tUI("fxBad", "à corriger") : tUI("fxWarn", "à améliorer")) + "</span>" +
            "</div>" +
            '<div class="rv-flou" aria-hidden="true">' + flou + "</div>" +
            (d.level === "bad"
              ? '<div class="rv-cadenas">' + LOCK_SVG + esc(tUI("fxLock", "correctif réservé au rapport complet")) + "</div>"
              : "") +
          "</div>";
        }).join("");

      return '<div class="roast-cat">' +
        '<div class="roast-cat-head">' +
          "<h3>" + (numeroChap[cat.label] ? '<span class="rv-chap-num">' + numeroChap[cat.label] + "</span>" : "") +
            esc(trCat(cat.label)) + "</h3>" +
          '<span class="score-chip ' + st + '">' + (Number(cat.score) || 0) + "/100</span>" +
        "</div>" +
        '<div class="rv-dots" role="img" aria-label="' + esc(resume) + '">' + dots + "</div>" +
        fx +
      "</div>";
    }).join("") + (categorieLocaleAbsente(cats)
      ? '<div class="roast-cat roast-cat--na">' +
          '<div class="roast-cat-head">' +
            "<h3>" + esc(trCat(CAT_CONDITIONNELLE)) + "</h3>" +
            '<span class="score-chip na">' + esc(titreNonApplicable()) + "</span>" +
          "</div>" +
          '<p class="roast-cat-teaser">' + esc(texteNonApplicable()) + "</p>" +
        "</div>"
      : "") +
      '<div class="rv-legende">' +
        '<span><i class="rv-pel ok"></i>' + tot.good + " " + tUI("legOk", "conformes") + "</span>" +
        '<span><i class="rv-pel warn"></i>' + tot.warn + " " + tUI("legWarn", "à améliorer") + "</span>" +
        '<span><i class="rv-pel bad"></i>' + tot.bad + " " + tUI("legBad", "à corriger") + "</span>" +
        (tot.info ? '<span><i class="rv-pel na"></i>' + tot.info + " " + tUI("legInfo", "non notés") + "</span>" : "") +
      "</div>";

    // Serveur
    var s = data.server || {};
    $("#srv-flag").textContent = s.flag || "🌐";
    $("#srv-city").textContent = s.city || "–";
    $("#srv-ip").textContent = s.ip || "–";
    var rows = [];
    if (s.type) rows.push([tUI("srvType", "Type"), s.type]);
    if (s.asn) rows.push([tUI("srvAsn", "Opérateur (ASN)"), s.asn]);
    if (s.tz) rows.push([tUI("srvTz", "Fuseau horaire"), s.tz]);
    $("#srv-list").innerHTML = rows.map(function (r) {
      return "<dt>" + esc(r[0]) + "</dt><dd class='mono'>" + esc(r[1]) + "</dd>";
    }).join("");

    // Carte : place le point via projection équirectangulaire (viewBox 1000x500)
    var srvMap = $("#srv-map"), marker = $("#srv-marker");
    if (srvMap && marker && s.lat != null && s.lon != null && !isNaN(s.lat) && !isNaN(s.lon)) {
      var mx = (Number(s.lon) + 180) / 360 * 1000;
      var my = (90 - Number(s.lat)) / 180 * 500;
      marker.setAttribute("transform", "translate(" + mx.toFixed(1) + "," + my.toFixed(1) + ")");
      srvMap.hidden = false;
    } else if (srvMap) {
      srvMap.hidden = true;
    }

    // Open Graph
    var og = data.og || {};
    $("#og-title").textContent = og.title || "Aucun titre Open Graph";
    $("#og-desc").textContent = og.desc || "Aucune description Open Graph détectée.";
    var img = $("#og-img");
    if (og.hasImage && og.image && /^https?:\/\//i.test(og.image)) {
      img.style.backgroundImage = "url(" + og.image.replace(/["'()\\\s]/g, "") + ")";
      img.classList.add("has-img");
    } else {
      img.classList.add("empty");
      img.textContent = "og:image manquante";
    }
    $("#og-note").textContent = og.note || "";

    // CTA : ouvre l'audit complet deverrouille (le paiement Stripe sera un seam en amont)
    var q = "rapport.html?url=" + encodeURIComponent(data.url || "");
    $("#final-cta").href = q;
  }

  function initRoast() {
    var loading = $("#roast-loading");
    if (!loading) return;

    var params = new URLSearchParams(window.location.search);
    var url = normalizeUrl(params.get("url"));
    var host;
    try { host = new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { window.location.href = BASE + "/"; return; }
    $("#loading-host").textContent = host;
    document.title = (isEN ? "Snapshot of " : "Bilan de ") + host + " | SEOPlus!";

    var steps = $$("#roast-checklist li");
    var fill = $("#roast-progress");
    var minDelay = reducedMotion ? 0 : 2600;
    var stepGap = minDelay / (steps.length + 1);
    var startedAt = Date.now();

    /* V3.2 : la connexion est demandee AVANT l'analyse.
       Auparavant le gate arrivait apres, ce qui obligeait a stocker le rapport
       dans l'onglet pour le retrouver au retour de connexion (Google et le magic
       link rechargent la page). Ce relais etait fragile : deux chargements
       successifs, un ?code= a distinguer, et au moindre accroc la personne
       attendait une seconde analyse complete. En demandant la connexion d'abord,
       le moteur ne part qu'une fois, pour de bon - et tout ce mecanisme de relais
       disparait avec le probleme qu'il compensait. */

    /* V3.1 (06/08) : garde d'idempotence en memoire, a l'echelle d'une analyse.
       L'ancienne version persistait en sessionStorage par onglet+hote (relicat du
       relais de connexion supprime en V3.2), ce qui empechait un nouveau roast du
       meme site dans le meme onglet d'etre archive ou compte en lead. onceFlags
       est remis a zero au debut de chaque runRoast(). */
    var onceFlags = {};
    function once(name) {
      if (onceFlags[name]) return false;
      onceFlags[name] = true;
      return true;
    }

    function runRoast() {
      onceFlags = {};
      var gate = $("#roast-authgate");
      if (gate) gate.hidden = true;
      loading.hidden = false;
      startedAt = Date.now();

      // Animation du loader (indépendante du fetch)
      steps.forEach(function (li, i) {
        setTimeout(function () {
          li.classList.add("active");
          if (i > 0) steps[i - 1].classList.add("done");
          if (fill) fill.style.transform = "scaleX(" + Math.min((i + 1) / (steps.length + 1), 0.92) + ")";
        }, reducedMotion ? 0 : stepGap * i);
      });

      var endpoint = CFG.ROAST_WEBHOOK_URL;
      if (!endpoint) {
        // Mode demo : mock local
        reveal(roastMock(url));
        return;
      }

      fetch(endpoint, {
        method: "POST",
        // text/plain = requete CORS simple, evite le preflight OPTIONS que le webhook n8n ne gere pas
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        /* v: 2 demande le contrat allege du bilan gratuit, ou un constat qui ne
           passe pas n'arrive plus qu'avec sa gravite : ni libelle, ni valeur, ni
           correctif. Le moteur sert l'ancien format aux fronts qui ne le
           demandent pas, pour ne pas afficher des lignes vides le temps que le
           site soit deploye. */
        body: JSON.stringify({ url: url, v: 2 })
      })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var data = null;
          try { data = JSON.parse(t); } catch (e) {}
          if (!data || data.ok === false) throw new Error((data && data.error) || "");
          reveal(data);
        })
        .catch(function (err) {
          fail((err && err.message) || "On n'a pas réussi à analyser ce site. Il est peut-être injoignable ou protégé. Vérifiez l'URL et réessayez.");
        });
    }

    function reveal(data) {
      var wait = Math.max(0, minDelay - (Date.now() - startedAt));
      setTimeout(function () {
        steps.forEach(function (li) { li.classList.add("done"); li.classList.remove("active"); });
        if (fill) fill.style.transform = "scaleX(1)";
        loading.hidden = true;
        // La connexion a ete demandee avant le lancement : on affiche, point.
        getUser(function (user) { show(data, user); });
      }, wait);
    }

    function show(data, user) {
      var gate = $("#roast-authgate");
      if (gate) gate.hidden = true;
      renderRoast(data);
      $("#roast-result").hidden = false;
      window.scrollTo(0, 0);
      if (user && once("lead")) {
        recordLead(user, data.host || "", data.score, data.grade);
        saveReport(user, data, url, "roast");
        promptCompany(user, $("#roast-result"));
      }
      // Opt-in classement public : le score est relu cote serveur depuis le cache.
      // Sous le seuil (minScore), le site n'est jamais liste : message prive motivant a la place.
      if (params.get("classement") === "1" && CFG.CLASSEMENT_OPTIN_URL && once("optin")) {
        fetch(CFG.CLASSEMENT_OPTIN_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ url: url })
        }).then(function (r) { return r.json(); }).then(function (res) {
          var box = $("#rank-feedback");
          if (!box || !res || !res.ok) return;
          if (res.listed) {
            box.innerHTML = 'Votre site apparaît au <a href="classement.html">classement public</a>.';
          } else {
            var gap = Math.max(1, (res.minScore || 60) - Number(res.score));
            box.innerHTML = "<b>Classement public :</b> il vous manque " + gap + " point" + (gap > 1 ? "s" : "") +
              " pour y entrer (seuil " + (res.minScore || 60) + "/100). Votre score reste privé en attendant." +
              " Appliquez le plan d'action de l'audit complet et revenez prendre votre place.";
          }
          box.hidden = false;
        }).catch(function () {});
      }
    }

    function fail(msg) {
      var wait = Math.max(0, minDelay - (Date.now() - startedAt));
      setTimeout(function () {
        loading.hidden = true;
        if (msg) $("#roast-error-msg").textContent = msg;
        $("#roast-error").hidden = false;
      }, wait);
    }

    /* Previsualisation locale, sans connexion ni appel au moteur.
       Supabase ne connait que les adresses de son allowlist : depuis un serveur
       de developpement, la connexion revient sur le site public, et comme le
       "reviens ici" est memorise dans le stockage local de l'origine locale, il
       est perdu en route. La page locale ne pouvait donc jamais s'afficher.
       Double garde : l'hote doit etre local ET le drapeau ?demo=1 explicite. */
    var estLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    if (estLocal && params.get("demo") === "1") {
      loading.hidden = false;
      fetch(BASE + "/assets/demo-exemple.json")
        .then(function (r) { return r.json(); })
        .then(function (d) { reveal(d); })
        .catch(function () { reveal(roastMock(url)); });
      return;
    }

    /* Connexion d'abord, analyse ensuite. Le moteur ne part donc jamais deux
       fois pour la meme demande : au retour de connexion la page recharge, la
       personne est reconnue, et l'analyse demarre une seule et unique fois. */
    getUser(function (user) {
      var gate = $("#roast-authgate");
      if (!user && gate && sbConfigure()) {
        loading.hidden = true;
        gate.innerHTML = authCardHtml(
          isEN ? "Your free diagnosis of " + esc(host) + " is ready to run." : "Votre diagnostic gratuit de " + esc(host) + " est prêt à être lancé.",
          isEN ? "Sign in in 5 seconds (Google or email) and the 161 checks start right away: score out of 100, 16 rated categories and our reading of your site. Free, and the audit stays in your history."
               : "Connectez-vous en 5 secondes (Google ou email) et les 161 vérifications démarrent aussitôt : score sur 100, 16 catégories notées et notre lecture de votre site. Gratuit, et l'audit reste dans votre historique.",
          tUI("diagReady", "Diagnostic gratuit")
        );
        bindAuthCard(gate);
        gate.hidden = false;
        window.scrollTo(0, 0);
        return;
      }
      runRoast();
    });
  }

  /* ---------- /rapport : l'audit complet (offre 10 EUR) ---------- */

  var PLAN_THEMES = [
    /* Exposition en tete : une categorie absente d'ici disparait du plan
       d'action, et c'est la que tombent les trouvailles les plus graves. */
    { title: "Sécurité, conformité et délivrabilité", cats: ["Exposition & fichiers sensibles", "Exposition de la couche d automatisation", "TLS / certificat", "En-tetes de securite HTTP", "Email (SPF / DKIM / DMARC)", "Conformite legale", "Vie privee & traceurs", "Accessibilite et bonnes pratiques"] },
    { title: "Visibilité et référencement", cats: ["Structure & contenu", "SEO on-page", "Ciblage et mots cles", "Fiche etablissement et referencement local", "Boutique en ligne", "Media et contenu", "Presence personnelle", "Service numerique", "Presence et confiance", "Visibilite SEO / IA", "Nom de domaine et DNS", "Performance"] },
    { title: "Présence dans les IA (GEO)", cats: ["Optimisation IA (GEO)"] }
  ];

  var LEVEL_ICON = { good: "✓", warn: "!", bad: "✗", info: "i" };

  var currentReport = null;
  var benchQuotaRefresh = null;

  function animateRing(ringEl, numEl, score) {
    var circ = 2 * Math.PI * 58;
    ringEl.style.strokeDasharray = circ;
    ringEl.style.strokeDashoffset = circ;
    ringEl.classList.add(statusFromScore(score));
    setTimeout(function () {
      ringEl.style.strokeDashoffset = circ * (1 - score / 100);
      if (reducedMotion) { numEl.textContent = score; return; }
      var start = null;
      requestAnimationFrame(function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / 1400, 1);
        numEl.textContent = Math.round(score * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      });
    }, reducedMotion ? 0 : 200);
  }

  /* Cible a 4 semaines : environ 55 % de l'ecart au 100 comble en appliquant le
     plan (35 % quand il ne reste que des signaux a renforcer).

     Deux garde-fous appris d'un cas reel : un site a 97/100 se voyait proposer
     « viser 97 sous 3 mois ». La cause etait double - un plafond a 95 et un
     retour anticipe des 95 - et le resultat n'avait aucun sens comme objectif.
     Desormais la cible est toujours au moins un point au-dessus du score
     actuel, et le plafond de 95 a saute : un site a 96 doit pouvoir viser 98,
     nos propres sites le font. Seul 100/100 se retourne tel quel. */
  function targetScore(score, hasIssues) {
    var s = Math.max(0, Math.min(100, Number(score) || 0));
    if (s >= 100) return 100;
    var part = hasIssues ? 0.55 : 0.35;
    var cible = Math.round(s + (100 - s) * part);
    return Math.min(100, Math.max(s + 1, cible));
  }

  function renderRapport(data) {
    REDESSINER = function () { renderRapport(data); };
    if (!dictAuditPret()) { chargerDictAudit(function () { renderRapport(data); }); return; }
    currentReport = data;
    /* Rapport fraichement genere : le quota de comparaisons repart a 3 */
    try { localStorage.removeItem("seoplus_bench_" + (data.host || "")); } catch (e) {}
    if (benchQuotaRefresh) setTimeout(benchQuotaRefresh, 0);
    var host = data.host || data.url;
    $("#rep-host").textContent = host;

    /* Rapport partiel (pare-feu anti-robot) : on l'annonce aussi ici, un audit
       partiel ouvert en direct ne doit pas se presenter comme complet. */
    var repPart = $("#rep-partiel-wrap");
    if (repPart) {
      var repNote = $("#rep-partiel-note");
      var repTitle = repPart.querySelector("b");
      var repAllowLink = function () {
        var lnk = document.createElement("a");
        lnk.href = "methodologie.html#autoriser-seoplusbot";
        lnk.className = "roast-partiel-link";
        lnk.textContent = isEN ? "How to allow SEOPlusBot, in one minute" : "Comment autoriser SEOPlusBot, en une minute";
        repNote.appendChild(document.createTextNode(" "));
        repNote.appendChild(lnk);
      };
      if (data.partiel) {
        repNote.textContent = isEN
          ? "This site's firewall refused our robots access to its pages. This report only covers the layers measurable without page access: email, domain name, certificates, technical files, performance measured by Google. Allow our robot (user-agent SEOPlusBot/1.0, IP 148.230.115.190) for the time of the analysis to get the full audit."
          : (data.partielNote || "Ce site bloque les analyses automatiques. Rapport limité aux couches mesurables sans accès aux pages : e-mails, nom de domaine, certificats. Relancez l'analyse plus tard pour un audit complet.");
        repAllowLink();
        repPart.hidden = false;
        var repTag = document.querySelector("#rep-hero-tags .rep-tag--orange");
        if (repTag) repTag.textContent = tUI("partielBadge", "Audit partiel");
      } else if (data.remesureBloquee) {
        if (repTitle) repTitle.textContent = isEN
          ? "Today's re-measurement was refused by this site's firewall."
          : "La remesure d'aujourd'hui a été refusée par le pare-feu du site.";
        repNote.textContent = isEN
          ? "This is the last complete measurement, taken on " + fmtAnalyzedAt(data.analyzedAt) + ". Nothing was recalculated: it is the full audit exactly as it was measured. Allow our robot to get a fresh one."
          : "Ceci est la dernière mesure complète, réalisée le " + fmtAnalyzedAt(data.analyzedAt) + ". Rien n'a été recalculé : c'est l'audit complet tel qu'il a été mesuré. Autorisez notre robot pour en obtenir un nouveau.";
        repAllowLink();
        repPart.hidden = false;
      } else {
        repPart.hidden = true;
      }
    }

    /* URL unique du rapport (Markdown), a confier a une IA pour executer le plan */
    var iaBtn = $("#rep-ia-url");
    if (iaBtn && CFG.RAPPORT_IA_URL) {
      iaBtn.hidden = false;
      var iaNote = $("#rep-ia-note");
      if (iaNote) iaNote.hidden = false;
      iaBtn.onclick = function () {
        var link = CFG.RAPPORT_IA_URL + "?url=" + encodeURIComponent(host);
        var flash = function () {
          iaBtn.textContent = tUI("urlCopied", "URL copiée !");
          setTimeout(function () { iaBtn.textContent = tUI("urlBtn", "URL de votre rapport"); }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(flash, flash);
        } else {
          window.prompt("Copiez l'URL de votre rapport :", link);
        }
      };
    }
    var score = Math.max(0, Math.min(100, Number(data.score) || 0));
    $("#rep-punch").textContent = (isEN && data.punch_en) || data.punch || "";
    $("#rep-verdict").textContent = (isEN && data.verdict_en) || data.verdict || "";
    animateRing($("#rep-ring-value"), $("#rep-score"), score);
    renderAnalyzedAt($("#rep-analyzed"), data);

    var c = data.counts || {};

    /* Meme trajectoire que le bilan gratuit, meme calcul de cible : les deux
       ecrans ne doivent jamais annoncer deux objectifs differents. */
    var repCible = targetScore(score, (c.erreurs || 0) > 0 || (c.avertissements || 0) > 0);
    var repNow = $("#rep-traj-now"), repGoal = $("#rep-traj-goal"), repLabel = $("#rep-traj-label");
    if (repNow) repNow.textContent = score;
    if (repGoal) repGoal.textContent = repCible;
    if (repLabel) {
      repLabel.textContent = isEN
        ? (repCible - score) + " points within reach in 4 weeks"
        : (repCible - score) + " points à gagner en 4 semaines";
    }

    $("#rep-counts").innerHTML =
      '<span class="rv-count good"><b>' + (Number(c.conformes) || 0) + "</b> " + tUI("acquis", "acquis") + "</span>" +
      '<span class="rv-count warn"><b>' + (Number(c.avertissements) || 0) + "</b> " + tUI("aGagner", "à gagner") + "</span>" +
      '<span class="rv-count bad"><b>' + (Number(c.erreurs) || 0) + "</b> " + tUI("urgents", "urgents") + "</span>";

    var cats = data.categories || [];

    // Meta d'audit (hero)
    $("#rep-date").textContent = new Date().toLocaleDateString(isEN ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
    /* Reference du rapport : SP-AAAAMMJJ-XXX, deterministe pour un hote et un
       jour de mesure donnes. Elle sert a citer un rapport precis, pas a
       securiser quoi que ce soit. */
    var refEl = $("#rep-ref");
    if (refEl) {
      var dRef = data.analyzedAt ? new Date(data.analyzedAt) : new Date();
      if (isNaN(dRef.getTime())) dRef = new Date();
      var hRef = 0;
      for (var hi = 0; hi < host.length; hi++) hRef = (hRef * 31 + host.charCodeAt(hi)) >>> 0;
      refEl.textContent = "SP-" + dRef.toISOString().slice(0, 10).replace(/-/g, "") +
        "-" + ("00" + (hRef % 46656).toString(36).toUpperCase()).slice(-3);
    }
    var nbChecks = cats.reduce(function (n, cat) { return n + (cat.details ? cat.details.length : 0); }, 0);
    /* Le nombre de CATEGORIES est annonce ici aussi, et il varie : la fiche
       etablissement ne s'affiche que pour les commerces de proximite. Le
       laisser en dur affichait "152 vérifications sur 16 catégories" sur un
       rapport qui n'en portait que 15. */
    $("#rep-nbchecks").textContent = (nbChecks || 160) + " " + tUI("checksWord", "vérifications")
      + (cats.length ? " " + (isEN ? "across " + cats.length + " categories" : "sur " + cats.length + " catégories") : "");
    var scopeEl = $("#rep-scope");
    if (scopeEl) {
      var nbPages = Number(data.scanned) || 1;
      scopeEl.textContent = nbPages > 1
        ? tFmt("scopeMulti", "Page d'accueil + {n} pages clés + signaux du domaine", { n: nbPages - 1 })
        : tUI("scopeSingle", "Page d'accueil + signaux du domaine");
    }

    // Synthese : forces (top 2), faiblesses (bottom 2)
    var ranked = cats.slice().sort(function (a, b) { return b.score - a.score; });
    var execItem = function (cat) {
      return '<li><span class="score-chip ' + (cat.status || statusFromScore(cat.score)) + '">' +
        (Number(cat.score) || 0) + '</span><div><b>' + esc(trCat(cat.label)) + "</b>" +
        (cat.teaser ? "<p>" + esc(trVal(cat.teaser)) + "</p>" : "") + "</div></li>";
    };
    $("#rep-forces").innerHTML = ranked.slice(0, 2).map(execItem).join("");
    $("#rep-faiblesses").innerHTML = ranked.slice(-2).reverse().map(execItem).join("");

    var hasIssues = (Number(c.erreurs) || 0) + (Number(c.avertissements) || 0) > 0;
    var globalCible = targetScore(score, hasIssues);

    // Analyse page par page (pages internes scannées par le moteur)
    var pagesBlock = $("#rep-pages-block");
    if (pagesBlock && data.pages && data.pages.length) {
      var pRows = '<div class="page-row page-row--head"><span>' + tUI("pgPage", "Page") + "</span><span>" + tUI("pgStatus", "Statut") + "</span><span>" + tUI("pgTitle", "Title") + "</span><span>" + tUI("pgDesc", "Meta desc.") + "</span><span>" + tUI("pgContent", "Contenu") + "</span></div>";
      data.pages.forEach(function (p) {
        var path = String(p.url || "").replace(/^https?:\/\/[^/]+/, "") || "/";
        var stOk = !p.err && p.status >= 200 && p.status < 400;
        var wN = Number(p.words) || 0;
        var wcls = wN >= 600 ? "good" : wN >= 300 ? "warn" : "bad";
        var tLen = (p.title || "").length;
        pRows += '<div class="page-row">' +
          '<span class="page-path mono">' + esc(path) + "</span>" +
          '<span class="page-cell ' + (stOk ? "good" : "bad") + '">' + (stOk ? p.status : (p.status || tUI("pgError", "erreur"))) + "</span>" +
          '<span class="page-cell ' + (tLen ? (tLen >= 30 && tLen <= 60 ? "good" : "warn") : "bad") + '">' + (tLen ? tLen + " " + tUI("pgChars", "car.") : tUI("pgAbsent", "absent")) + "</span>" +
          '<span class="page-cell ' + (p.desc ? "good" : "bad") + '">' + (p.desc ? tUI("pgPresent", "présente") : tUI("pgAbsent", "absente")) + "</span>" +
          '<span class="page-cell ' + (stOk ? wcls : "bad") + '">' + (stOk ? wN + " " + tUI("pgWords", "mots") : "-") + "</span>" +
          "</div>";
      });
      $("#rep-pages").innerHTML = pRows;
      pagesBlock.hidden = false;
    }

    // Findings : accordéon filtrable par sévérité
    renderFindings(cats);

    // Executive summary : la posture du decideur en une phrase
    var baseTxt = score >= 85 ? "des fondations solides" : score >= 70 ? "une base saine" : score >= 50 ? "une base exploitable" : "des fondations fragiles";
    var errN = Number(c.erreurs) || 0;
    var warnN = Number(c.avertissements) || 0;
    var weakLabels = ranked.slice(-2).reverse().map(function (cat) { return trCat(cat.label); }).join(isEN ? " and " : " et ");
    var oneliner;
    if (isEN) {
      var baseEn = score >= 85 ? tUI("olGoodBase", baseTxt) : score >= 70 ? tUI("olHealthy", baseTxt) : score >= 50 ? tUI("olUsable", baseTxt) : tUI("olFragile", baseTxt);
      if (!hasIssues) oneliner = tFmt("olNone", "", { host: host, base: baseEn });
      else if (errN > 0) oneliner = tFmt("olErr", "", { host: host, base: baseEn, n: errN, weak: weakLabels, target: globalCible });
      else oneliner = tFmt("olWarn", "", { host: host, base: baseEn, n: warnN, weak: weakLabels, target: globalCible });
    } else if (!hasIssues) {
      oneliner = "L'audit de " + host + " révèle " + baseTxt + " : rien de bloquant, la marge restante se joue sur l'optimisation fine.";
    } else if (errN > 0) {
      oneliner = "L'audit de " + host + " révèle " + baseTxt + ", mais " + errN + (errN > 1 ? " points critiques restent" : " point critique reste") +
        " à corriger, surtout côté " + weakLabels + ". Le plan ci-dessous vise " + globalCible + " sous 4 semaines.";
    } else {
      oneliner = "L'audit de " + host + " révèle " + baseTxt + ", sans erreur bloquante, avec " + warnN +
        (warnN > 1 ? " signaux à renforcer" : " signal à renforcer") + ", surtout côté " + weakLabels + ". Le plan ci-dessous vise " + globalCible + " sous 4 semaines.";
    }
    $("#rep-oneliner").textContent = oneliner;
    var byLabel = {};
    cats.forEach(function (cat) { byLabel[cat.label] = cat; });

    // Plan d'action : timeline en phases (3 thematiques + suivi continu)
    var phasesHtml = PLAN_THEMES.map(function (theme, ti) {
      var items = [];
      theme.cats.forEach(function (label) {
        var cat = byLabel[label];
        if (!cat || !cat.details) return;
        cat.details.forEach(function (d) {
          if (d.level === "good") return;
          items.push({ cat: label, label: d.label, level: d.level, value: d.value, fix: d.fix });
        });
      });
      items.sort(function (a, b) { return (a.level === "bad" ? 0 : 1) - (b.level === "bad" ? 0 : 1); });
      var body = items.length === 0
        ? '<p class="plan-clear">' + tUI("phaseClear", "Rien à corriger ici. Tout est conforme.") + "</p>"
        : items.map(function (it) {
            return '<div class="pitem ' + it.level + '">' +
              '<div class="pitem-text"><div class="pitem-top"><b>' + esc(trCheck(it.label)) + "</b>" +
              '<span class="pitem-badge ' + it.level + '">' + (it.level === "bad" ? tUI("critical", "Critique") : tUI("recommended", "Recommandé")) + "</span></div>" +
              (it.value ? '<span class="plan-val mono">' + esc(trVal(it.value)) + "</span>" : "") +
              (it.fix ? '<p class="plan-fix">' + esc(trFix(it.fix)) + "</p>" : "") +
              learnMore(it.label) +
              '<span class="pitem-cat">' + esc(trCat(it.cat)) + "</span></div>" +
            "</div>";
          }).join("");
      return '<div class="phase">' +
        '<div class="phase-meta"><div class="phase-name">' + tUI("phase", "Phase") + " " + (ti + 1) + "</div>" +
        '<div class="phase-title">' + esc(trCat(theme.title)) + "</div>" +
        '<div class="phase-gain">' + (items.length === 0 ? tUI("phaseConform", "Conforme") : items.length + " " + (items.length > 1 ? tUI("actions", "actions") : tUI("action", "action"))) + "</div></div>" +
        '<div class="phase-items">' + body + "</div></div>";
    }).join("");
    phasesHtml += '<div class="phase">' +
      '<div class="phase-meta"><div class="phase-name">' + tUI("phase", "Phase") + ' 4</div>' +
      '<div class="phase-title">' + tUI("phase4", "Suivi & mesure") + "</div>" +
      '<div class="phase-gain">' + tUI("phaseOngoing", "En continu") + "</div></div>" +
      '<div class="phase-items">' +
        '<div class="pitem"><div class="pitem-text"><b>' + tUI("planGsc", "Connecter Google Search Console") + '</b><p class="plan-fix">' + tUI("planGscFix", "Vérifiez la couverture d'index et les requêtes qui vous amènent du trafic.") + "</p></div></div>" +
        '<div class="pitem"><div class="pitem-text"><b>' + tUI("planAudit", "Re-auditer dans 4 semaines") + '</b><p class="plan-fix">' + tFmt("planAuditFix", "Relancez le même audit pour mesurer la progression vers la cible de {n}/100. Quatre semaines suffisent : la plupart des correctifs se posent en une session, et l’URL de ce rapport permet de vous faire guider par une IA.", { n: globalCible }) + "</p></div></div>" +
      "</div></div>";
    $("#rep-plan").innerHTML = phasesHtml;

    // Detail complet par categorie : une carte par verification, avec ce qu'on
    // mesure, la valeur relevee et le correctif. Le niveau de detail d'un audit
    // d'agence, sans rien cacher du calcul.
    /* Numerotation (maquette B, 14/08) : le numero de chapitre est la position
       dans l'ordre du moteur, stable d'un rapport a l'autre pour un meme
       barème ; la reference chapitre.point permet de citer un constat precis.
       L'affichage, lui, reste trie du pire au meilleur. */
    var numeroChap = {};
    cats.forEach(function (cc, ci) { numeroChap[cc.label] = ci + 1; });
    var sorted = cats.slice().sort(function (a, b) { return a.score - b.score; });

    /* Sommaire numerote : il remplace l'ancienne section "scores par
       dimension", qui montrait la meme information une deuxieme fois, a un
       autre endroit, sous une autre forme. Meme tri que les chapitres. */
    var som = $("#rep-sommaire");
    if (som) {
      som.innerHTML = sorted.map(function (cat) {
        var st = cat.status || statusFromScore(cat.score);
        var v = Number(cat.score) || 0;
        /* Un constat "info" n'est pas note : il ne cree pas de cible. */
        var issues = (cat.details || []).some(function (d) { return d.level === "bad" || d.level === "warn"; });
        var cible = targetScore(cat.score, issues || cat.score < 95);
        var nPts = (cat.details || []).length;
        return '<a class="rep-som-row" href="#chap-' + numeroChap[cat.label] + '">' +
          '<span class="rep-som-num mono">' + numeroChap[cat.label] + "</span>" +
          '<span class="rep-som-name">' + esc(trCat(cat.label)) + "</span>" +
          '<span class="rep-som-bar" aria-hidden="true"><span class="bar-track"><span class="bar-fill ' + st + '" style="width:' + v + '%"></span></span></span>' +
          '<span class="rep-som-cible">' + (cible > v ? tUI("cible", "cible") + " " + cible : "") + "</span>" +
          '<span class="rep-som-pts">' + nPts + " " + (nPts > 1 ? tUI("somPts", "points") : tUI("somPt", "point")) + "</span>" +
          '<span class="score-chip ' + st + '">' + v + "/100</span>" +
        "</a>";
      }).join("") + (categorieLocaleAbsente(sorted)
        ? '<span class="rep-som-row rep-som-row--na">' +
            '<span class="rep-som-num mono">·</span>' +
            '<span class="rep-som-name">' + esc(trCat(CAT_CONDITIONNELLE)) + "</span>" +
            '<span class="rep-som-bar"></span><span class="rep-som-cible"></span><span class="rep-som-pts"></span>' +
            '<span class="score-chip na">' + esc(titreNonApplicable()) + "</span>" +
          "</span>"
        : "");
    }

    var CHIP_TXT = {
      good: tUI("chipGood", "Conforme"),
      warn: tUI("chipWarn", "Avertissement"),
      bad: tUI("chipBad", "Erreur"),
      // Constat sans jugement : ni réussi ni raté, donc jamais compté.
      info: tUI("chipInfo", "Information")
    };
    $("#rep-cats").innerHTML = sorted.map(function (cat) {
      var st = cat.status || statusFromScore(cat.score);
      var details = cat.details || [];
      var chap = numeroChap[cat.label];
      var nOk = details.filter(function (d) { return d.level === "good"; }).length;
      // Les constats "info" ne sont pas notés : les compter au dénominateur
      // afficherait "6/8 conformes" sur une catégorie sans aucun défaut.
      var nScored = details.filter(function (d) { return d.level !== "info"; }).length;
      var body;
      if (details.length) {
        body = '<div class="check-grid">' + details.map(function (d, di) {
          var desc = checkDesc(d.label);
          var ref = chap + "." + (di < 9 ? "0" : "") + (di + 1);
          return '<article class="check-card ' + d.level + '">' +
            '<div class="check-card-head">' +
              '<span class="check-ref mono">' + ref + "</span>" +
              '<span class="rep-check-ico">' + LEVEL_ICON[d.level] + "</span>" +
              "<b>" + esc(trCheck(d.label)) + "</b>" +
              '<span class="check-chip ' + d.level + '">' + CHIP_TXT[d.level] + "</span>" +
            "</div>" +
            (desc ? '<p class="check-what">' + esc(desc) + "</p>" : "") +
            (d.value ? '<p class="check-meas"><b>' + tUI("findingMeasured", "Mesuré :") + '</b> <span class="mono">' + esc(trVal(d.value)) + "</span></p>" : "") +
            (d.fix ? '<p class="rep-check-fix"><b>' + tUI("findingFix", "Correctif :") + "</b> " + esc(trFix(d.fix)) + "</p>" : "") +
            (d.level === "good" || d.level === "info" ? "" : learnMore(d.label)) +
          "</article>";
        }).join("") + "</div>";
      } else {
        body = '<div class="check-grid"><article class="check-card ' + st + '">' +
          '<p class="check-what">' + esc(trVal(cat.teaser || "")) + "</p></article></div>";
      }
      return '<details class="rep-cat" id="chap-' + chap + '">' +
        '<summary class="rep-cat-head"><h3><span class="rep-chap-num mono">' + chap + "</span>" + esc(trCat(cat.label)) + "</h3>" +
        '<span class="rep-cat-right">' +
        (nScored ? '<span class="rep-cat-mini">' + tFmt("catMini", "{ok}/{n} conformes", { ok: nOk, n: nScored }) + "</span>" : "") +
        '<span class="score-chip ' + st + '">' + (Number(cat.score) || 0) + "/100</span>" +
        '<svg class="finding-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></summary>' +
        body +
      "</details>";
    }).join("") + (categorieLocaleAbsente(sorted)
      ? '<details class="rep-cat rep-cat--na">' +
          '<summary class="rep-cat-head"><h3>' + esc(trCat(CAT_CONDITIONNELLE)) + "</h3>" +
          '<span class="rep-cat-right"><span class="score-chip na">' + esc(titreNonApplicable()) + "</span>" +
          '<svg class="finding-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></summary>' +
          '<div class="check-grid"><article class="check-card info">' +
            '<p class="check-what">' + esc(texteNonApplicable()) + "</p>" +
            '<p class="check-meas">' + esc(isEN
              ? "If your business does receive customers at an address, publish it with opening hours and a map: the category will then appear and audit its eight checks."
              : "Si votre activité reçoit bien du public à une adresse, publiez-la avec vos horaires et une carte : la catégorie apparaîtra alors et auditera ses huit vérifications.") + "</p>" +
          "</article></div>" +
        "</details>"
      : "");

    // Wedge : IA-readiness
    var sg = data.signaux || {};
    var iaItems = [
      { ok: !!sg.jsonld, label: tUI("iaJsonld", "Données structurées (JSON-LD)"), hint: tUI("iaJsonldHint", "les IA identifient votre activité") },
      { ok: !!sg.llms, label: tUI("iaLlms", "Fichier llms.txt"), hint: tUI("iaLlmsHint", "guide les crawlers IA vers vos pages clés") },
      { ok: !!sg.sitemap, label: tUI("iaSitemap", "Sitemap XML"), hint: tUI("iaSitemapHint", "liste vos pages à indexer") },
      { ok: (sg.mots || 0) >= 600, label: tUI("iaWords", "Contenu suffisant (600+ mots)"), hint: tUI("iaWordsHint", "de la matière à citer") }
    ];
    $("#rep-ia-list").innerHTML = iaItems.map(function (it) {
      return '<li class="' + (it.ok ? "ok" : "ko") + '"><span>' + (it.ok ? "✓" : "✗") + "</span><div><b>" +
        esc(it.label) + "</b><em>" + esc(it.hint) + "</em></div></li>";
    }).join("");
    var iaOk = iaItems.filter(function (it) { return it.ok; }).length;
    $("#rep-ia-wedge-note").textContent = iaOk >= 3
      ? tUI("iaGood", "Bonne base. ChatGPT, Perplexity et les AI Overviews peuvent vous lire et vous citer.")
      : tUI("iaBad", "Aujourd'hui, les IA passent à côté de vous. Complétez les points manquants pour devenir citable.");

    // Wedge : souverainete / RGPD
    var s = data.server || {};
    var EU = ["FR", "DE", "BE", "NL", "LU", "ES", "IT", "PT", "IE", "AT", "FI", "SE", "DK", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "EE", "LV", "LT", "MT", "CY"];
    var inEu = s.cc && EU.indexOf(s.cc) !== -1;
    $("#rep-sov-lead").textContent = (s.city && s.city !== "Localisation indisponible")
      ? tFmt("sovFrom", "Votre serveur répond depuis {city}.", { city: s.city })
      : tUI("sovUnknown", "Localisation du serveur indisponible.");
    var sov = [];
    if (s.asn) sov.push([tUI("sovHost", "Hébergeur"), s.asn]);
    if (s.ip) sov.push([tUI("sovIp", "Adresse IP"), s.ip]);
    if (s.cc) sov.push([tUI("sovCountry", "Pays"), s.cc + " " + (inEu ? tUI("sovEu", "(UE)") : tUI("sovNonEu", "(hors UE)"))]);
    $("#rep-sov-facts").innerHTML = sov.map(function (r) {
      return "<dt>" + esc(r[0]) + "</dt><dd class='mono'>" + esc(r[1]) + "</dd>";
    }).join("");
    $("#rep-sov-note").textContent = inEu
      ? tUI("sovNoteEu", "Hébergement dans l'Union européenne : vos données restent soumises au RGPD, un argument de confiance à mettre en avant.")
      : (s.cc ? tUI("sovNoteNonEu", "Hébergement hors UE : vérifiez les transferts de données et les clauses RGPD de votre prestataire.") : "");

    // Serveur (carte) + Open Graph
    $("#srv-flag").textContent = s.flag || "🌐";
    $("#srv-city").textContent = s.city || "–";
    $("#srv-ip").textContent = s.ip || "–";
    var rows = [];
    if (s.type) rows.push([tUI("srvType", "Type"), s.type]);
    if (s.asn) rows.push([tUI("srvAsn", "Opérateur (ASN)"), s.asn]);
    if (s.tz) rows.push([tUI("srvTz", "Fuseau horaire"), s.tz]);
    $("#srv-list").innerHTML = rows.map(function (r) {
      return "<dt>" + esc(r[0]) + "</dt><dd class='mono'>" + esc(r[1]) + "</dd>";
    }).join("");
    var srvMap = $("#srv-map"), marker = $("#srv-marker");
    if (srvMap && marker && s.lat != null && s.lon != null && !isNaN(s.lat) && !isNaN(s.lon)) {
      var mx = (Number(s.lon) + 180) / 360 * 1000;
      var my = (90 - Number(s.lat)) / 180 * 500;
      marker.setAttribute("transform", "translate(" + mx.toFixed(1) + "," + my.toFixed(1) + ")");
      srvMap.hidden = false;
    } else if (srvMap) { srvMap.hidden = true; }

    var og = data.og || {};
    $("#og-title").textContent = og.title || tUI("ogNoTitle", "Aucun titre Open Graph");
    $("#og-desc").textContent = og.desc || tUI("ogNoDesc", "Aucune description Open Graph détectée.");
    var img = $("#og-img");
    if (og.hasImage && og.image && /^https?:\/\//i.test(og.image)) { img.style.backgroundImage = "url(" + og.image.replace(/["'()\\\s]/g, "") + ")"; img.classList.add("has-img"); }
    else { img.classList.add("empty"); img.textContent = tUI("ogNoImg", "og:image manquante"); }
    $("#og-note").textContent = isEN && og.note ? (og.hasImage ? tUI("ogNoteOk", og.note) : tUI("ogNoteKo", og.note)) : (og.note || "");

    renderFiles(data);
  }

  /* Findings : tous les checks non conformes, tries par severite, filtrables */
  function renderFindings(cats) {
    var items = [];
    cats.forEach(function (cat) {
      (cat.details || []).forEach(function (d) {
        if (d.level === "good") return;
        items.push({ cat: cat.label, label: d.label, level: d.level, value: d.value, fix: d.fix });
      });
    });
    items.sort(function (a, b) { return (a.level === "bad" ? 0 : 1) - (b.level === "bad" ? 0 : 1); });
    var nBad = items.filter(function (it) { return it.level === "bad"; }).length;
    var nWarn = items.length - nBad;

    var title = $("#rep-findings-title");
    if (title && items.length) title.textContent = isEN ? tFmt("findingsTitle", "", { n: items.length }) : "Les " + items.length + " points d'amélioration";
    var tagF = $("#rep-tag-findings");
    if (tagF) tagF.textContent = isEN ? tFmt("findingsTag", "", { n: items.length }) : items.length + " points d'amélioration";

    $("#rep-findings-tabs").innerHTML = items.length === 0 ? "" :
      '<button class="tab-btn active" type="button" data-sev="all">' + tUI("tabAll", "Tous") + " (" + items.length + ")</button>" +
      '<button class="tab-btn" type="button" data-sev="bad">' + tUI("tabBad", "Critiques") + " (" + nBad + ")</button>" +
      '<button class="tab-btn" type="button" data-sev="warn">' + tUI("tabWarn", "Recommandés") + " (" + nWarn + ")</button>";

    $("#rep-findings").innerHTML = items.length === 0
      ? '<p class="plan-clear">' + tUI("findingsNone", "Rien à signaler : toutes les vérifications sont conformes.") + "</p>"
      : items.map(function (it, i) {
          return '<details class="finding"' + (i === 0 ? " open" : "") + ' data-sev="' + it.level + '">' +
            '<summary class="finding-hd">' +
              '<span class="badge ' + (it.level === "bad" ? "b-critical" : "b-medium") + '">' + (it.level === "bad" ? tUI("critical", "Critique") : tUI("recommended", "Recommandé")) + "</span>" +
              '<span class="finding-title">' + esc(trCheck(it.label)) + "</span>" +
              '<span class="finding-cat">' + esc(trCat(it.cat)) + "</span>" +
              '<svg class="finding-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
            "</summary>" +
            '<div class="finding-body">' +
              (it.value ? '<p class="finding-desc"><b>' + tUI("findingMeasured", "Mesuré :") + '</b> <span class="mono">' + esc(trVal(it.value)) + "</span></p>" : "") +
              (it.fix ? '<div class="finding-fix"><strong>' + tUI("findingFix", "Correctif :") + "</strong> " + esc(trFix(it.fix)) + "</div>" : '<div class="finding-fix">' + tUI("findingFixRef", "Détail dans la catégorie correspondante ci-dessous.") + "</div>") +
              learnMore(it.label) +
            "</div>" +
          "</details>";
        }).join("");

    /* Clarte UX (retour Paul) : 3 premieres actions dans la synthese + compteur du guide */
    var top = $("#rep-top-actions"), topList = $("#rep-top-actions-list");
    if (top && topList) {
      var picks = items.slice(0, 3);
      if (picks.length) {
        top.hidden = false;
        topList.innerHTML = picks.map(function (it) {
          return '<li><div class="ta-txt"><b>' + esc(trCheck(it.label)) + "</b>" +
            '<span class="badge ' + (it.level === "bad" ? "b-critical" : "b-medium") + '">' + (it.level === "bad" ? tUI("critical", "Critique") : tUI("recommended", "Recommandé")) + "</span>" +
            (it.fix ? "<p>" + esc(trFix(it.fix)) + "</p>" : "") + "</div></li>";
        }).join("");
      } else {
        top.hidden = true;
      }
    }
  }

  /* Accordeon exclusif : ouvrir un finding ferme les autres. Sur le clic, pas sur
     l'evenement toggle, pour ne pas casser le depliage global avant impression. */
  document.addEventListener("click", function (e) {
    var sum = e.target && e.target.closest ? e.target.closest("#rep-findings .finding > summary") : null;
    if (!sum || sum.parentElement.open) return;
    $$("#rep-findings .finding[open]").forEach(function (o) {
      if (o !== sum.parentElement) o.removeAttribute("open");
    });
  });

  /* Sommaire -> chapitre : un details ferme ne se laisse pas atteindre par une
     ancre, on l'ouvre avant que le navigateur ne defile. */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest(".rep-som-row[href]") : null;
    if (!a) return;
    var det = document.querySelector(a.getAttribute("href"));
    if (det && det.tagName === "DETAILS") det.open = true;
  });

  /* Filtre severite des findings (delegation, une seule fois) */
  document.addEventListener("click", function (e) {
    var tab = e.target && e.target.closest ? e.target.closest("#rep-findings-tabs .tab-btn") : null;
    if (!tab) return;
    $$("#rep-findings-tabs .tab-btn").forEach(function (b) { b.classList.remove("active"); });
    tab.classList.add("active");
    var sev = tab.getAttribute("data-sev");
    $$("#rep-findings .finding").forEach(function (f) {
      f.style.display = (sev === "all" || f.dataset.sev === sev) ? "" : "none";
    });
  });

  /* ---------- L3 : generateur de fichiers prets a poser ---------- */

  /* Construit un llms.txt reel a partir des pages que l'audit a effectivement
     explorees, plutot qu'un gabarit a trous. Le fichier produit doit passer
     notre propre controle de conformite (titre #, liens Markdown), sinon on
     livrerait au client exactement le defaut qu'on lui reproche. */
  function buildLlmsTxt(data, origin, host, og) {
    var pages = (data.pages || []).filter(function (p) {
      return p && p.url && !p.err && p.status >= 200 && p.status < 400 && !p.noindex;
    });

    /* Le suffixe de marque est repete sur chaque title : dans une liste ou le
       nom du site est deja en H1, il n'apporte rien et mange la ligne. */
    var marque = (og.title || host).split(/[|–-]/)[0].trim().toLowerCase();
    function titreCourt(p) {
      var t = (p.title || p.h1 || "").trim();
      var parts = t.split(/\s+[|–-]\s+/);
      if (parts.length > 1 && parts[parts.length - 1].trim().toLowerCase().indexOf(marque) === 0) {
        t = parts.slice(0, -1).join(" - ").trim();
      }
      if (!t) t = (p.url || "").replace(/^https?:\/\/[^\/]+/, "") || "Page";
      /* Les crochets et parentheses casseraient le lien Markdown. */
      return t.replace(/[\[\]]/g, "").replace(/\s+/g, " ").slice(0, 90);
    }
    function ligne(p) {
      var d = (p.desc || "").replace(/\s+/g, " ").trim();
      if (d.length > 150) d = d.slice(0, 147).replace(/\s+\S*$/, "") + "...";
      return "- [" + titreCourt(p) + "](" + p.url + ")" + (d ? ": " + d : "");
    }

    /* Les pages de contact et les pages legales sortent de la liste principale :
       un agent qui cherche a joindre l'entreprise doit les trouver d'un coup
       d'oeil, et elles n'ont pas leur place parmi les pages de contenu. */
    var CONTACT = /(contact|nous-joindre|nous-ecrire|devis|rendez-vous|\brdv\b|reservation|booking)/i;
    var LEGAL = /(mentions-legales|mentions_legales|confidentialite|privacy|cgv|cgu|conditions-generales|legal|cookies)/i;
    var contact = [], legal = [], principales = [];
    pages.forEach(function (p) {
      var chemin = (p.url || "").replace(/^https?:\/\/[^\/]+/, "");
      if (CONTACT.test(chemin)) contact.push(p);
      else if (LEGAL.test(chemin)) legal.push(p);
      else principales.push(p);
    });
    /* Les pages les plus fournies d'abord : c'est ce qu'une IA a le plus de
       chances de vouloir citer, et la liste est bornee a douze. */
    principales.sort(function (a, b) { return (b.words || 0) - (a.words || 0); });
    principales = principales.slice(0, 12);

    var nom = (og.title || host).split(/\s+[|–-]\s+/)[0].trim() || host;
    var out = ["# " + nom.replace(/[\[\]]/g, "")];
    var resume = (og.desc || "").replace(/\s+/g, " ").trim();
    out.push("", "> " + (resume || "Décrivez ici votre activité en une phrase : ce que vous faites, pour qui, et où."));
    out.push("", "Ce fichier indique aux assistants IA (ChatGPT, Perplexity, Claude, Google AI Overviews) quelles pages de "
      + host + " font autorité et méritent d'être citées.");

    out.push("", "## Pages principales", "- [Accueil](" + origin + "/)"
      + (resume ? ": " + (resume.length > 150 ? resume.slice(0, 147).replace(/\s+\S*$/, "") + "..." : resume) : ""));
    principales.forEach(function (p) { out.push(ligne(p)); });
    if (!principales.length) {
      out.push("- [À compléter](" + origin + "/votre-page): aucune page interne n'a pu être explorée lors de l'audit, ajoutez ici vos pages clés.");
    }

    if (contact.length) {
      out.push("", "## Contact");
      contact.forEach(function (p) { out.push(ligne(p)); });
    }
    if (legal.length) {
      out.push("", "## Informations légales");
      legal.forEach(function (p) { out.push(ligne(p)); });
    }

    out.push("", "<!-- Genere par SEOPlus le " + new Date().toISOString().slice(0, 10)
      + " a partir des " + (principales.length + contact.length + legal.length + 1)
      + " pages explorees. Relisez les descriptions avant de publier : elles viennent de vos meta descriptions. -->");
    return out.join("\n");
  }

  /* Meme principe que le llms.txt : on livre les pages reellement trouvees.
     Un sitemap qui ne contient que l'accueil ne sert a rien, et c'est
     exactement ce qu'on generait jusqu'ici alors que l'audit avait la liste. */
  function buildSitemapXml(data, origin) {
    var jour = new Date().toISOString().slice(0, 10);
    var vues = {};
    var urls = [{ loc: origin + "/", prio: "1.0" }];
    vues[origin + "/"] = 1;
    (data.pages || []).forEach(function (p) {
      if (!p || !p.url || p.err || p.noindex || p.status < 200 || p.status >= 400) return;
      /* & est le seul caractere que l'on rencontre vraiment dans une adresse
         et qui rendrait le XML invalide. */
      var loc = String(p.url).replace(/&/g, "&amp;");
      if (vues[loc]) return;
      vues[loc] = 1;
      urls.push({ loc: loc, prio: "0.7" });
    });
    var out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    urls.forEach(function (u) {
      out.push('  <url>', '    <loc>' + u.loc + '</loc>', '    <lastmod>' + jour + '</lastmod>',
        '    <priority>' + u.prio + '</priority>', '  </url>');
    });
    out.push('</urlset>');
    if (urls.length === 1) {
      out.push('', '<!-- Une seule page listee : l audit n a trouve aucun lien interne exploitable.',
        '     Dupliquez le bloc <url> ci-dessus pour chacune de vos autres pages. -->');
    }
    return out.join("\n");
  }

  function buildFiles(data) {
    var sg = data.signaux || {};
    var host = data.host || "votre-site.fr";
    var origin = "https://" + host;
    var og = data.og || {};
    /* Nettoie pour insertion dans du JSON-LD et des attributs HTML generes (quotes, retours ligne, backslash) */
    var title = (og.title || host).replace(/[\\"]/g, "'").replace(/\s+/g, " ").trim();
    var desc = (og.desc || "").replace(/[\\"]/g, "'").replace(/\s+/g, " ").trim();
    var files = [];

    if (!sg.robots) files.push({
      name: "robots.txt", loc: "à la racine · " + origin + "/robots.txt",
      desc: "Autorise les moteurs à explorer votre site et pointe vers votre sitemap.",
      code: "# robots.txt - genere par SEOPlus! (www.optimizia.xyz/tools/seoplus)\nUser-agent: *\nAllow: /\n\nSitemap: " + origin + "/sitemap.xml"
    });

    if (!sg.sitemap) files.push({
      name: "sitemap.xml", loc: "à la racine · " + origin + "/sitemap.xml",
      desc: "Liste vos pages pour l'indexation, pré-remplie avec les pages trouvées pendant l'audit. Ajoutez celles qui manquent.",
      code: buildSitemapXml(data, origin)
    });

    /* Declenche sur la NON-CONFORMITE, pas sur l'absence. Un llms.txt present
       mais sans titre # ni lien Markdown echoue a l'audit llms-txt de Google :
       son proprietaire est celui qui a le plus besoin du fichier corrige, et
       c'etait justement le seul a qui on ne le donnait pas. */
    if (!sg.llmsConforme) files.push({
      name: "llms.txt", loc: "à la racine · " + origin + "/llms.txt",
      desc: sg.llms
        ? "Votre llms.txt existe mais Google le rejette. Voici une version conforme, construite avec les pages réellement trouvées sur votre site."
        : "Guide les IA (ChatGPT, Perplexity, Claude) vers vos pages. Construit avec les pages réellement trouvées sur votre site, pas un modèle vide.",
      code: buildLlmsTxt(data, origin, host, og)
    });

    if (!sg.org) files.push({
      name: "Données structurées (JSON-LD Organization)", loc: "dans le <head> de vos pages",
      desc: "Permet aux IA et à Google d'identifier votre entreprise : nom, site, réseaux.",
      code: '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "' + title + '",\n  "url": "' + origin + '/",\n  "description": "' + desc + '",\n  "sameAs": ["https://www.linkedin.com/company/votre-page"]\n}\n<\/script>'
    });

    if (!sg.csp || !sg.hsts) files.push({
      name: "En-têtes de sécurité (nginx)", loc: "dans le bloc server de votre configuration nginx",
      desc: "Force le HTTPS, bloque le clickjacking et limite les scripts chargés.",
      code: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\nadd_header X-Frame-Options "SAMEORIGIN" always;\nadd_header X-Content-Type-Options "nosniff" always;\nadd_header Referrer-Policy "strict-origin-when-cross-origin" always;\nadd_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\nadd_header Content-Security-Policy "default-src \'self\'; img-src \'self\' data: https:; style-src \'self\' \'unsafe-inline\'" always;'
    });

    if (!sg.spf) files.push({
      name: "Enregistrement SPF (DNS)", loc: "chez votre registrar · TXT sur la racine du domaine",
      desc: "Empêche l'usurpation de vos e-mails. Adaptez l'include à votre fournisseur d'e-mail.",
      code: "Type   : TXT\nNom    : @   (racine du domaine)\nValeur : v=spf1 include:_spf.google.com ~all"
    });

    if (!sg.dmarc) files.push({
      name: "Politique DMARC (DNS)", loc: "chez votre registrar · TXT sur _dmarc",
      desc: "Complète le SPF : indique aux serveurs quoi faire des e-mails frauduleux.",
      code: "Type   : TXT\nNom    : _dmarc\nValeur : v=DMARC1; p=quarantine; rua=mailto:postmaster@" + host + "; fo=1"
    });

    if (!sg.og) files.push({
      name: "Balises Open Graph", loc: "dans le <head> de vos pages",
      desc: "Contrôle l'aperçu de votre site quand on le partage sur les réseaux sociaux.",
      code: '<meta property="og:title" content="' + title + '">\n<meta property="og:description" content="' + desc + '">\n<meta property="og:type" content="website">\n<meta property="og:url" content="' + origin + '/">\n<meta property="og:image" content="' + origin + '/og-image.jpg">'
    });

    return files;
  }

  /* Badge de confiance : snippet autonome, tout en styles en ligne parce qu'il
     est collé sur le site du client (aucune CSS de notre part ne le suivra).
     Sceau orange, sans score ni compteur : le badge dit l'appartenance, pas la
     note. Un site qui progresse garde le meme badge, il n'a rien a re-coller. */
  function trustBadgeHtml() {
    var line1 = isEN ? "AUDITED BY" : "AUDITÉ PAR";
    return '<a href="https://www.optimizia.xyz/tools/seoplus/?utm_source=badge&amp;utm_medium=referral" target="_blank" rel="noopener" ' +
      'style="display:inline-flex;align-items:center;gap:11px;padding:9px 16px 9px 12px;border-radius:12px;' +
      'background:linear-gradient(135deg,#F97316,#EA580C);box-shadow:0 2px 10px rgba(234,88,12,.28);' +
      'text-decoration:none;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.15">' +
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.18)">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M20 6L9 17l-5-5"/></svg>' +
      '</span>' +
      '<span style="display:inline-flex;flex-direction:column;gap:3px">' +
        '<span style="color:rgba(255,255,255,.82);font-size:9px;font-weight:700;letter-spacing:.13em">' + line1 + '</span>' +
        '<span style="color:#ffffff;font-size:15px;font-weight:800;letter-spacing:-.01em">SEOPlus!</span>' +
      '</span></a>';
  }

  function renderFiles(data) {
    var block = $("#rep-files-block"), host = $("#rep-files");
    if (!block || !host) return;
    var files = buildFiles(data);

    /* Le badge n'est pas un correctif, c'est un acquis : il se merite en ayant
       passe l'audit, pas en ayant des defauts. Il etait pourtant emporte par la
       sortie anticipee ci-dessous, si bien que le seul cas ou le client a tout
       bon etait le seul ou on ne lui donnait pas son badge. */
    var aCorriger = files.length;
    var sub = $("#rep-files-sub");
    if (!aCorriger && sub) {
      sub.textContent = isEN
        ? "Nothing to generate: your robots.txt, sitemap, llms.txt, structured data, security headers and email records are already in place. Here is your badge."
        : "Rien à générer : votre robots.txt, votre sitemap, votre llms.txt, vos données structurées, vos en-têtes de sécurité et vos enregistrements e-mail sont déjà en place. Voici votre badge.";
    }

    var badgeHtml = trustBadgeHtml();
    files.push({
      name: isEN ? "Trust badge" : "Badge de confiance",
      loc: isEN ? "in your footer" : "en pied de page",
      badge: true,
      preview: badgeHtml,
      desc: isEN
        ? "A website that displays its audit inspires confidence. This badge shows your visitors that your online presence is verified and monitored by an independent tool: more credibility when they are about to contact you. Paste it in your footer. Styles are inline, so it looks the same on any website, with no CSS to add."
        : "Un site qui affiche son audit inspire confiance. Ce badge montre à vos visiteurs que votre présence en ligne est vérifiée et suivie par un outil indépendant : plus de sérieux perçu, plus de crédibilité au moment de vous contacter. Collez-le en pied de page. Les styles sont en ligne, il s'affiche donc à l'identique sur n'importe quel site, sans CSS à ajouter.",
      code: badgeHtml
    });
    host.innerHTML = files.map(function (f, i) {
      var id = "filecode-" + i;
      return '<div class="file-card' + (f.badge ? " file-card--badge" : "") + '">' +
        '<div class="file-head"><div class="file-id"><b>' + esc(f.name) + "</b>" +
        '<span class="file-loc">' + esc(f.loc) + "</span></div>" +
        '<button class="file-copy" type="button" data-copy="' + id + '">Copier</button></div>' +
        '<p class="file-desc">' + esc(f.desc) + "</p>" +
        /* f.preview est du HTML que l'on construit nous-memes (badge), pas une
           donnee du site audite : il est rendu tel quel, jamais echappe. */
        (f.preview ? '<div class="file-preview"><span class="file-preview-tag">' + tUI("preview", "Aperçu") + "</span>" + f.preview + "</div>" : "") +
        '<div class="code-wrap"><div class="code-header">' +
          '<span class="code-dot code-dot--r"></span><span class="code-dot code-dot--y"></span><span class="code-dot code-dot--g"></span>' +
          '<span class="code-name">' + esc(f.name) + "</span></div>" +
        '<pre class="file-code" id="' + id + '"><code>' + esc(f.code) + "</code></pre></div>" +
      "</div>";
    }).join("");
    block.hidden = false;
  }

  /* Copie presse-papier (delegation, une seule fois) */
  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".file-copy") : null;
    if (!btn) return;
    var pre = document.getElementById(btn.getAttribute("data-copy"));
    if (!pre) return;
    var text = pre.textContent;
    var flash = function () {
      var old = btn.getAttribute("data-label") || "Copier";
      btn.setAttribute("data-label", old);
      btn.textContent = "Copié";
      btn.classList.add("copied");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copied"); }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash, flash);
    } else {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      document.body.removeChild(ta); flash();
    }
  });

  /* Copie du lien de l'article (bouton de partage, delegation) */
  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".share-copy") : null;
    if (!btn) return;
    var url = btn.getAttribute("data-url") || (location.origin + location.pathname);
    var done = function () {
      var old = btn.textContent;
      btn.textContent = "Lien copié";
      btn.classList.add("copied");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copied"); }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, done);
    } else { done(); }
  });

  /* ---------- L4 : benchmark concurrent ---------- */

  function fetchAnalysis(url) {
    var endpoint = CFG.ROAST_WEBHOOK_URL;
    if (!endpoint) return Promise.resolve(roastMock(url));
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ url: url })
    })
      /* On lit le corps meme sur un statut d'erreur : depuis la V3.1 le moteur
         repond 400/422 AVEC un message lisible ("ce domaine ne repond pas...").
         Rejeter sur !r.ok afficherait "HTTP 422" a la place de l'explication. */
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) {}
        if (!d || d.ok === false) throw new Error((d && d.error) || "");
        return d;
      });
  }

  /* Chargement de la comparaison. Une comparaison prend une vingtaine de
     secondes : sans rien a l'ecran, la personne croit que c'est casse et
     relance. La barre suit une courbe qui ralentit et plafonne a 92 % - elle
     bouge en permanence sans jamais promettre une fin qu'on ne maitrise pas,
     et le 100 % n'arrive qu'a la reponse reelle du moteur. */
  function benchProgress(hostLabel) {
    var box = $("#bench-loading"), fill = $("#bench-progress");
    var steps = $$("#bench-checklist li");
    var hostEl = $("#bench-loading-host");
    if (!box) return { finish: function () {}, abort: function () {} };
    if (hostEl) hostEl.textContent = hostLabel;
    steps.forEach(function (li) { li.classList.remove("active", "done"); });
    if (fill) fill.style.transform = "scaleX(.04)";
    box.hidden = false;

    var t0 = Date.now(), timer = null;
    var TAU = 9000, CAP = 0.92, STEP_MS = 3600;
    function tick() {
      var t = Date.now() - t0;
      if (fill) fill.style.transform = "scaleX(" + (CAP * (1 - Math.exp(-t / TAU))).toFixed(3) + ")";
      var idx = Math.min(steps.length - 1, Math.floor(t / STEP_MS));
      steps.forEach(function (li, i) {
        li.classList.toggle("active", i === idx);
        li.classList.toggle("done", i < idx);
      });
    }
    if (reducedMotion) {
      steps.forEach(function (li) { li.classList.add("active"); });
      if (fill) fill.style.transform = "scaleX(.5)";
    } else {
      tick();
      timer = setInterval(tick, 200);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    return {
      finish: function () {
        stop();
        steps.forEach(function (li) { li.classList.add("done"); li.classList.remove("active"); });
        if (fill) fill.style.transform = "scaleX(1)";
        setTimeout(function () { box.hidden = true; }, reducedMotion ? 0 : 500);
      },
      abort: function () { stop(); box.hidden = true; }
    };
  }

  /* Compare deux audits constat par constat, et pas seulement score par score.

     Ce que le concurrent nous renvoie est AMPUTE, comme tout bilan gratuit :
     ses constats qui passent gardent leur libelle et leur valeur mesuree, ceux
     qui echouent ne gardent que leur gravite. C'est exactement ce qu'il faut
     pour la comparaison la plus utile, « ce qu'il reussit et que vous ratez » :
     les deux libelles sont connus, le rapprochement est certain.

     Le sens inverse demande une precaution. Un de vos constats au vert absent
     de ses constats au vert signifie soit qu'il le rate, soit que la
     verification n'a pas tourne chez lui (categorie locale, mesure Google
     indisponible, site sans page interne). On ne conclut donc que si la
     categorie compte le meme nombre de constats des deux cotes : dans ce cas
     le meme jeu a tourne, et l'absence vaut echec. */
  function benchDiff(you, them) {
    var tByLabel = {};
    (them.categories || []).forEach(function (c) { tByLabel[c.label] = c; });
    var ilGagne = [], vousGagnez = [];

    (you.categories || []).forEach(function (c) {
      var t = tByLabel[c.label];
      if (!t) return;
      var vousDet = c.details || [], luiDet = t.details || [];
      var luiOk = {};
      luiDet.forEach(function (d) { if (d.label && (d.level === "good" || d.level === "info")) luiOk[d.label] = d; });
      var memeJeu = luiDet.length === vousDet.length;

      vousDet.forEach(function (d) {
        if (!d.label) return;
        if ((d.level === "bad" || d.level === "warn") && luiOk[d.label]) {
          ilGagne.push({ cat: c.label, label: d.label, level: d.level, saValeur: luiOk[d.label].value || "", votreValeur: d.value || "", fix: d.fix || "" });
        } else if (d.level === "good" && memeJeu && !luiOk[d.label]) {
          vousGagnez.push({ cat: c.label, label: d.label, votreValeur: d.value || "" });
        }
      });
    });

    var poids = { bad: 0, warn: 1 };
    ilGagne.sort(function (a, b) { return poids[a.level] - poids[b.level]; });
    return { ilGagne: ilGagne, vousGagnez: vousGagnez };
  }

  function renderBench(you, them) {
    var box = $("#bench-result");
    if (!box) return;
    var yScore = Math.round(Number(you.score) || 0);
    var tScore = Math.round(Number(them.score) || 0);
    var tByLabel = {};
    (them.categories || []).forEach(function (c) { tByLabel[c.label] = c; });
    var wins = 0, losses = 0;

    function rates(cat) {
      return (cat.details || []).filter(function (d) { return d.level === "bad" || d.level === "warn"; }).length;
    }

    var rows = (you.categories || []).map(function (c) {
      var t = tByLabel[c.label];
      var ys = Number(c.score) || 0, ts = t ? (Number(t.score) || 0) : null;
      var win = ts == null ? "" : (ys > ts ? "you" : ys < ts ? "them" : "tie");
      if (win === "you") wins++; else if (win === "them") losses++;
      /* Le score seul cache le volume : 60/100 sur deux constats rates n'est
         pas la meme situation que 60/100 sur neuf. On affiche les deux. */
      var yn = rates(c), tn = t ? rates(t) : null;
      var detail = tn == null
        ? (isEN ? "not measured on their site" : "non mesurée chez lui")
        : (isEN ? (yn + " vs " + tn + " findings to fix") : (yn + " contre " + tn + " constats à corriger"));
      return '<div class="bench-row">' +
        '<span class="bench-cat">' + esc(c.label) + '<em class="bench-cat-note">' + esc(detail) + "</em></span>" +
        '<span class="bench-val ' + (win === "you" ? "win" : win === "them" ? "lose" : "") + '">' + ys + "</span>" +
        '<span class="bench-val ' + (win === "them" ? "win" : win === "you" ? "lose" : "") + '">' + (ts == null ? "–" : ts) + "</span>" +
      "</div>";
    }).join("");

    var ecart = Math.abs(yScore - tScore);
    var gapTxt = yScore === tScore
      ? (isEN ? "Neck and neck" : "Au coude à coude")
      : (isEN
          ? (ecart + " point" + (ecart > 1 ? "s" : "") + (yScore > tScore ? " ahead" : " behind"))
          : (ecart + " point" + (ecart > 1 ? "s" : "") + (yScore > tScore ? " d'avance" : " de retard")));

    var d = benchDiff(you, them);
    function bloc(titre, intro, items, rendu) {
      if (!items.length) return "";
      var MAX = 8;
      var reste = items.length - MAX;
      return '<div class="bench-diff">' +
        '<h4 class="bench-diff-h">' + esc(titre) + " <span>" + items.length + "</span></h4>" +
        '<p class="bench-diff-sub">' + esc(intro) + "</p>" +
        '<ul class="bench-diff-list">' + items.slice(0, MAX).map(rendu).join("") + "</ul>" +
        (reste > 0 ? '<p class="bench-diff-more">' + esc(isEN
          ? ("and " + reste + " more, listed category by category above.")
          : ("et " + reste + " autre" + (reste > 1 ? "s" : "") + ", détaillés catégorie par catégorie plus haut.")) + "</p>" : "") +
      "</div>";
    }

    var blocLui = bloc(
      isEN ? "What they get right and you do not" : "Ce qu'il réussit et que vous ratez",
      isEN
        ? "Each line is a check they pass and you fail. This is the shortest path to closing the gap."
        : "Chaque ligne est un constat qu'il valide et que vous ratez. C'est le chemin le plus court pour combler l'écart.",
      d.ilGagne,
      function (it) {
        return '<li class="bench-diff-item bench-diff-item--' + it.level + '">' +
          '<span class="bench-diff-cat">' + esc(it.cat) + "</span>" +
          "<b>" + esc(it.label) + "</b>" +
          '<span class="bench-diff-vs">' +
            (isEN ? "them: " : "lui : ") + esc(it.saValeur || (isEN ? "compliant" : "conforme")) +
            (it.votreValeur ? " · " + (isEN ? "you: " : "vous : ") + esc(it.votreValeur) : "") +
          "</span>" +
          (it.fix ? '<span class="bench-diff-fix">' + esc(it.fix) + "</span>" : "") +
        "</li>";
      });

    var blocVous = bloc(
      isEN ? "What you have and they do not" : "Ce que vous avez et qu'il n'a pas",
      isEN
        ? "Advantages you already hold over this competitor. Worth saying out loud on your site."
        : "Des avantages que vous avez déjà sur ce concurrent. Ils méritent d'être dits sur votre site.",
      d.vousGagnez,
      function (it) {
        return '<li class="bench-diff-item bench-diff-item--good">' +
          '<span class="bench-diff-cat">' + esc(it.cat) + "</span>" +
          "<b>" + esc(it.label) + "</b>" +
          (it.votreValeur ? '<span class="bench-diff-vs">' + esc(it.votreValeur) + "</span>" : "") +
        "</li>";
      });

    var summary = yScore > tScore
      ? "Vous devancez ce concurrent (" + yScore + " contre " + tScore + "). Vous gagnez sur " + wins + " catégorie" + (wins > 1 ? "s" : "") + "."
      : yScore < tScore
        ? "Ce concurrent vous devance (" + tScore + " contre " + yScore + "). Vous êtes derrière sur " + losses + " catégorie" + (losses > 1 ? "s" : "") + ". Le plan d'action ci-dessus est votre chemin pour repasser devant."
        : "Vous êtes au coude à coude (" + yScore + " partout).";

    box.innerHTML =
      '<div class="bench-head">' +
        '<div class="bench-col you"><span>' + (isEN ? "You" : "Vous") + '</span><b>' + yScore + '</b><em class="mono">' + esc(you.host || "") + "</em></div>" +
        '<div class="bench-vs"><span class="bench-vs-word">vs</span><span class="bench-gap">' + esc(gapTxt) + "</span></div>" +
        '<div class="bench-col them"><span>' + (isEN ? "Competitor" : "Concurrent") + '</span><b>' + tScore + '</b><em class="mono">' + esc(them.host || "") + "</em></div>" +
      "</div>" +
      '<div class="bench-rows"><div class="bench-row bench-row--head"><span class="bench-cat">' + (isEN ? "Category" : "Catégorie") + '</span><span class="bench-val">' + (isEN ? "You" : "Vous") + '</span><span class="bench-val">' + (isEN ? "Them" : "Lui") + "</span></div>" + rows + "</div>" +
      blocLui + blocVous +
      '<p class="bench-summary">' + esc(summary) + "</p>" +
      '<div class="bench-verdict" id="bench-verdict" hidden></div>';
    box.hidden = false;
  }

  /* Verdict redige par l'IA sur la comparaison. Non bloquant : la bench-summary reste si l'appel echoue. */
  function fetchBenchVerdict(you, them) {
    var endpoint = CFG.BENCH_VERDICT_URL;
    var box = $("#bench-verdict");
    if (!endpoint || !box) return;
    box.hidden = false;
    box.innerHTML = '<p class="bench-verdict-loading">Rédaction du verdict...</p>';
    function condense(r) {
      var og = r.og || {}, s = r.server || {};
      return {
        host: r.host || "", score: r.score, grade: r.grade,
        title: og.title || "", desc: og.desc || "",
        city: s.city || "", cc: s.cc || "",
        perf: (r.cwv && r.cwv.perfScore != null) ? r.cwv.perfScore : null,
        categories: (r.categories || []).map(function (c) { return { label: c.label, score: c.score }; })
      };
    }
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ you: condense(you), them: condense(them) })
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (!d || !d.verdict) throw new Error("vide");
        box.innerHTML = '<p class="eyebrow">Le verdict</p><p>' + esc(d.verdict) + "</p>";
        var sum = $("#bench-result .bench-summary");
        if (sum) sum.hidden = true;
      })
      .catch(function () { box.hidden = true; box.innerHTML = ""; });
  }

  function initBench() {
    var form = $("#bench-form");
    if (!form) return;

    /* 3 comparaisons incluses par rapport (compte par host audite, memorise en localStorage). */
    var BENCH_MAX = 3;
    function benchKey() { return "seoplus_bench_" + ((currentReport && currentReport.host) || ""); }
    function benchUsed() { try { return Number(localStorage.getItem(benchKey())) || 0; } catch (e) { return 0; } }
    function benchBump() { try { localStorage.setItem(benchKey(), String(benchUsed() + 1)); } catch (e) {} }
    function refreshQuota() {
      var q = $("#bench-quota");
      if (!q || !currentReport) return;
      var left = Math.max(0, BENCH_MAX - benchUsed());
      q.hidden = false;
      q.textContent = left > 0
        ? "Il vous reste " + left + " comparaison" + (left > 1 ? "s" : "") + " sur les " + BENCH_MAX + " incluses avec ce rapport."
        : "Vous avez utilisé vos " + BENCH_MAX + " comparaisons incluses avec ce rapport.";
      if (left === 0) { $("#bench-url").disabled = true; $("#bench-btn").disabled = true; }
    }
    benchQuotaRefresh = refreshQuota;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var berr = $("#bench-error"), bb = $("#bench-btn");
      var burl = normalizeUrl($("#bench-url").value);
      try { new URL(burl); } catch (er) { berr.textContent = "URL invalide. Vérifiez et réessayez."; berr.hidden = false; return; }
      if (!currentReport) { berr.textContent = "Patientez la fin de votre audit avant de comparer."; berr.hidden = false; return; }
      if (benchUsed() >= BENCH_MAX) { refreshQuota(); berr.textContent = "Limite atteinte : " + BENCH_MAX + " comparaisons incluses avec ce rapport."; berr.hidden = false; return; }
      berr.hidden = true;
      bb.disabled = true;
      var oldT = bb.textContent;
      bb.textContent = "Analyse en cours...";
      $("#bench-result").hidden = true;
      var benchHost = burl;
      try { benchHost = new URL(burl).hostname.replace(/^www\./, ""); } catch (er) {}
      var prog = benchProgress(benchHost);
      fetchAnalysis(burl)
        .then(function (them) {
          benchBump();
          prog.finish();
          bb.disabled = false; bb.textContent = oldT;
          refreshQuota();
          renderBench(currentReport, them);
          fetchBenchVerdict(currentReport, them);
          $("#bench-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
        })
        .catch(function (err) {
          prog.abort();
          bb.disabled = false; bb.textContent = oldT;
          /* Le moteur explique lui-meme pourquoi il refuse (domaine inexistant,
             serveur muet, quota). Son message est plus utile que le notre. */
          berr.textContent = (err && err.message) || "Impossible d'analyser ce concurrent. Il est peut-être injoignable.";
          berr.hidden = false;
        });
    });
  }

  function initReport() {
    var loading = $("#roast-loading");
    if (!loading) return;

    var savedTitle = null;
    function reportSlug() {
      return (($("#rep-host") && $("#rep-host").textContent) || "site").trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "site";
    }
    /* "Telecharger le PDF" ouvre l'impression navigateur : la boite de dialogue
       propose "Enregistrer en PDF" avec un nom de fichier propre (via document.title). */
    function printReport() {
      savedTitle = document.title;
      document.title = "Audit-SEOPlus-" + reportSlug();
      window.print();
    }
    var pdfBtn = $("#rep-pdf");
    if (pdfBtn) pdfBtn.addEventListener("click", printReport);
    // Impression navigateur (Ctrl+P) : tout deplier, puis restaurer l'etat d'avant
    var openSnapshot = null;
    window.addEventListener("beforeprint", function () {
      openSnapshot = $$("#rep-result details").filter(function (d) { return d.open; });
      $$("#rep-result details").forEach(function (d) { d.setAttribute("open", ""); });
    });
    window.addEventListener("afterprint", function () {
      if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; }
      if (openSnapshot) {
        $$("#rep-result details").forEach(function (d) {
          if (openSnapshot.indexOf(d) === -1) d.removeAttribute("open");
        });
        openSnapshot = null;
      }
    });

    var params = new URLSearchParams(window.location.search);

    /* Rapport archive : ?rid= recharge un audit depuis l'historique Supabase
       (page Mon compte), sans relancer le moteur ni repasser par le webhook. */
    var rid = params.get("rid");
    if (rid) {
      $("#loading-host").textContent = "votre rapport";
      getUser(function (user) {
        var gate = $("#rep-authgate");
        if (!user && gate && sbConfigure()) {
          loading.hidden = true;
          gate.innerHTML = authCardHtml(
            isEN ? "Retrieve your saved report." : "Retrouvez votre rapport sauvegardé.",
            isEN ? "Sign in with the account used during the audit to reopen this report from your history." : "Connectez-vous avec le compte utilisé lors de l'audit pour rouvrir ce rapport depuis votre historique."
          );
          bindAuthCard(gate);
          gate.hidden = false;
          return;
        }
        var client = sbClient();
        if (!client || !user) { window.location.href = BASE + "/"; return; }
        function ridFail(msg) {
          loading.hidden = true;
          $("#roast-error-msg").textContent = msg;
          $("#roast-error").hidden = false;
        }
        client.from("reports").select("host,payload,created_at,kind").eq("id", rid).single().then(function (res) {
          if (res.error || !res.data || !res.data.payload) {
            ridFail("Rapport introuvable dans votre historique. Il a peut-être été supprimé, ou appartient à un autre compte.");
            return;
          }
          /* Un diagnostic gratuit archive ne donne pas acces au rapport complet. */
          if (res.data.kind && res.data.kind !== "complet") {
            ridFail(isEN
              ? "This entry is a free diagnosis: it only includes the score. Run the full audit to get the complete report."
              : "Cette entrée est un diagnostic gratuit : elle ne contient que le score. Lancez l'audit complet pour obtenir le rapport détaillé.");
            return;
          }
          var data = res.data.payload;
          loading.hidden = true;
          document.title = (isEN ? "Full audit of " : "Audit complet de ") + (data.host || res.data.host) + " | SEOPlus!";
          renderRapport(data);
          /* Rapport fige : les mesures datent du jour de l'audit, pas d'aujourd'hui.
             renderRapport ecrit la date du jour, on la corrige ici. */
          var auditedAt = new Date(res.data.created_at);
          var auditedTxt = auditedAt.toLocaleDateString(isEN ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
          $("#rep-date").textContent = auditedTxt;
          var arch = $("#rep-archive-note");
          if (arch) {
            arch.textContent = isEN
              ? "Archived report. These measurements are the ones taken on " + auditedTxt + ", they are not refreshed. Run a new audit to measure your progress."
              : "Rapport archivé. Ces mesures sont celles du " + auditedTxt + ", elles ne sont pas rafraîchies. Relancez un audit pour mesurer vos progrès.";
            arch.hidden = false;
          }
          $("#rep-result").hidden = false;
          window.scrollTo(0, 0);
          var cwvBlock = $("#rep-cwv-block");
          if (data.cwv && data.cwv.ok) { if (cwvBlock) cwvBlock.hidden = false; renderCWV(data.cwv); }
          else if (cwvBlock) cwvBlock.hidden = true;
        }, function () {
          ridFail("Impossible de charger ce rapport pour le moment. Réessayez dans un instant.");
        });
      });
      return;
    }

    /* Seam Stripe : lien vide = rapport ouvert (demo). Lien renseigne = paywall,
       deverrouille au retour Stripe (?paid={CHECKOUT_SESSION_ID}) et memorise par host. */
    var stripeLink = CFG.STRIPE_LINK_COMPLET;
    var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
    if (stripeLink && params.get("paid")) {
      var pendingHost = store.get("seoplus_pending");
      if (pendingHost) {
        store.set("seoplus_paid_" + pendingHost, params.get("paid"));
        store.del("seoplus_pending");
        if (!params.get("url")) { window.location.replace(BASE + "/rapport.html?url=" + encodeURIComponent(pendingHost)); return; }
      }
    }

    var url = normalizeUrl(params.get("url"));
    var host;
    try { host = new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { window.location.href = BASE + "/"; return; }
    $("#loading-host").textContent = host;
    document.title = (isEN ? "Full audit of " : "Audit complet de ") + host + " | SEOPlus!";

    if (stripeLink && !params.get("demo") && !store.get("seoplus_paid_" + host)) {
      loading.hidden = true;
      $("#pay-host").textContent = host;
      var payCta = $("#pay-cta");
      payCta.href = stripeLink + (stripeLink.indexOf("?") > -1 ? "&" : "?") + "client_reference_id=" + encodeURIComponent(host);
      payCta.addEventListener("click", function () { store.set("seoplus_pending", host); });
      $("#rep-paywall").hidden = false;
      return;
    }

    /* Exemple de rapport : on sert un audit fige de www.exemple.com, un site
       invente (assets/demo-exemple.json, produit par 09 Deploiement/(C)
       generer-demo-exemple.js), sans gate ni webhook. La personne atterrit
       direct sur le rapport, aucun workflow relance.
       L'exemple servait notre propre audit jusqu'au 15/08 : montrer nos erreurs
       comme argument de vente coutait plus qu'il ne rapportait. */
    if (params.get("demo")) {
      loading.hidden = true;
      /* Le bandeau dit que le site est invente. Sans ca, un lecteur peut prendre
         exemple.com pour un client reel dont on publierait les defauts. */
      var badge = document.querySelector(".rep-hero-badge");
      if (badge) {
        badge.lastChild.textContent = isEN
          ? " Sample report : exemple.com is a fictional website"
          : " Exemple de rapport : exemple.com est un site fictif";
      }
      fetch(BASE + "/assets/demo-exemple.json")
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          renderRapport(data);
          $("#rep-result").hidden = false;
          window.scrollTo(0, 0);
          var cwvBlock = $("#rep-cwv-block");
          if (data.cwv && data.cwv.ok) { if (cwvBlock) cwvBlock.hidden = false; renderCWV(data.cwv); }
          else if (cwvBlock) { cwvBlock.hidden = true; }
        })
        .catch(function () { fail("Exemple de rapport momentanément indisponible."); });
      return;
    }

    var steps = $$("#roast-checklist li");
    var fill = $("#roast-progress");
    var minDelay = reducedMotion ? 0 : 2600;
    var stepGap = minDelay / (steps.length + 1);
    var startedAt;

    /* Ni cache d'onglet, ni cache moteur : l'audit complet et le roast gratuit
       lancent desormais exactement la meme mesure. C'est ce qui garantit qu'ils
       ne peuvent plus afficher deux scores differents pour le meme site. */

    /* Gate auth avant generation : Google comme magic link rechargent la page,
       on revient ici connecte et l'audit demarre directement. */
    getUser(function (user) {
      var gate = $("#rep-authgate");
      if (!user && gate && sbConfigure()) {
        loading.hidden = true;
        gate.innerHTML = authCardHtml(
          isEN ? tFmt("rapportGateTitle", "", { host: esc(host) }) : "Votre audit complet de " + esc(host) + " est prêt à être généré.",
          isEN ? "Sign in to open it: every check with its fix, the 4-phase action plan, your generated files and 3 competitor comparisons. <s>€9.90</s> free during launch." : "Connectez-vous pour l'ouvrir : chaque vérification avec son correctif, le plan d'action en 4 phases, vos fichiers générés et 3 comparaisons concurrents. <s>9,90 €</s> offert pendant le lancement."
        );
        bindAuthCard(gate);
        gate.hidden = false;
        return;
      }
      runAudit();
    });

    function runAudit() {
      startedAt = Date.now();

      steps.forEach(function (li, i) {
        setTimeout(function () {
          li.classList.add("active");
          if (i > 0) steps[i - 1].classList.add("done");
          if (fill) fill.style.transform = "scaleX(" + Math.min((i + 1) / (steps.length + 1), 0.92) + ")";
        }, reducedMotion ? 0 : stepGap * i);
      });

      var endpoint = CFG.ROAST_WEBHOOK_URL;
      if (!endpoint) { reveal(roastMock(url)); return; }

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        /* `complet` decide de ce que le moteur renvoie : sans lui, la reponse
           arrive sans les correctifs. Le serveur ne remesure PLUS le site a ce
           moment-la : il reprend la mesure faite par le bilan gratuit quelques
           instants plus tot (fenetre de 30 min). C'est ce qui garantit que les
           deux ecrans affichent le meme score, et c'est pour ca que la reponse
           revient en une fraction de seconde au lieu de trente.
           Attention, ce drapeau est de la plomberie, pas une serrure :
           n'importe qui peut l'envoyer. Le jour ou l'audit complet devient
           payant, il faut le remplacer par une preuve d'acces verifiee cote
           serveur (jeton de session controle aupres de Supabase), sinon le
           rapport reste gratuit pour qui sait lire. */
        body: JSON.stringify({ url: url, complet: true, v: 2 })
      })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var data = null;
          try { data = JSON.parse(t); } catch (e) {}
          if (!data || data.ok === false) throw new Error((data && data.error) || "");
          /* Mesure reprise du bilan gratuit : rien ne tourne, inutile de faire
             patienter devant une barre de progression qui simule un travail
             deja fait. Le rapport reste archive normalement, c'est bien le
             rapport complet que la personne vient d'ouvrir. */
          reveal(data, data.repris === true);
        })
        .catch(function (err) { fail((err && err.message) || "On n'a pas réussi à analyser ce site. Il est peut-être injoignable ou protégé. Vérifiez l'URL et réessayez."); });
    }

    function reveal(data, instantane) {
      var wait = instantane ? 0 : Math.max(0, minDelay - (Date.now() - startedAt));
      setTimeout(function () {
        steps.forEach(function (li) { li.classList.add("done"); li.classList.remove("active"); });
        if (fill) fill.style.transform = "scaleX(1)";
        loading.hidden = true;
        getUser(function (user) {
          if (user) {
            recordLead(user, data.host || host, data.score, data.grade);
            saveReport(user, data, url, "complet");
            promptCompany(user, $("#rep-result"));
          }
          renderRapport(data);
          $("#rep-result").hidden = false;
          window.scrollTo(0, 0);
          // CWV : desormais mesures par le moteur d'audit lui-meme (payload.cwv).
          // Repli sur l'appel PSI separe pour les payloads en cache d'avant l'integration.
          if (data.cwv && data.cwv.ok) {
            var cwvBlock = $("#rep-cwv-block");
            if (cwvBlock) cwvBlock.hidden = false;
            renderCWV(data.cwv);
          } else {
            loadCWV(url);
          }
        });
      }, wait);
    }

    function loadCWV(auditUrl) {
      var block = $("#rep-cwv-block");
      if (!block || !CFG.PSI_URL || !auditUrl) return;
      block.hidden = false;
      fetch(CFG.PSI_URL + "?url=" + encodeURIComponent(auditUrl))
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) {
          if (!d || d.ok === false) { block.hidden = true; return; }
          renderCWV(d);
        })
        .catch(function () { block.hidden = true; });
    }

    function renderCWV(d) {
      var grid = $("#rep-cwv-grid");
      var note = $("#rep-cwv-note");
      if (!grid) return;
      var ratingLabel = isEN
        ? { good: "Good", warn: "Watch", bad: "Fix" }
        : { good: "Bon", warn: "À surveiller", bad: "À corriger" };
      var isProxy = d.inp && d.inp.proxy;
      var metrics = isEN ? [
        { key: "lcp", label: "Loading (LCP)", desc: "Main content display", ideal: "≤ 2.5 s" },
        { key: "inp", label: isProxy ? "Responsiveness (estimated INP)" : "Responsiveness (INP)", desc: "Response delay to interactions", ideal: "≤ 200 ms" },
        { key: "cls", label: "Visual stability (CLS)", desc: "Layout shifts while loading", ideal: "≤ 0.10" }
      ] : [
        { key: "lcp", label: "Chargement (LCP)", desc: "Affichage du contenu principal", ideal: "≤ 2,5 s" },
        { key: "inp", label: isProxy ? "Réactivité (INP estimé)" : "Réactivité (INP)", desc: "Délai de réponse aux interactions", ideal: "≤ 200 ms" },
        { key: "cls", label: "Stabilité visuelle (CLS)", desc: "Décalages de mise en page au chargement", ideal: "≤ 0,10" }
      ];
      /* Trois metriques sur quatre venaient de la mesure TERRAIN (vos vrais
         visiteurs Chrome sur 28 jours) tandis que le score de performance vient
         TOUJOURS d'un passage en laboratoire, sur un mobile bride simule. Les
         quatre etaient affichees cote a cote sans le dire, ce qui produisait
         des tableaux incomprehensibles : chargement au vert, stabilite au vert,
         et un score a 47 en rouge juste a cote. Chaque carte porte donc
         desormais sa source. */
      var terrain = d.source === "field";
      var tagTerrain = isEN ? "field" : "terrain";
      var tagLabo = isEN ? "lab" : "labo";

      var html = "";
      metrics.forEach(function (m) {
        var v = d[m.key];
        /* Une metrique absente devient une carte qui dit pourquoi, au lieu de
           disparaitre. Une grille a trois cases sans explication se lit comme
           un bug, et c'est exactement ce qui a ete remonte. */
        if (!v || v.value == null) {
          html += '<div class="cwv-card cwv-na">' +
            '<span class="cwv-metric">' + esc(m.label) + '</span>' +
            '<b class="cwv-value cwv-value--na">' + (isEN ? "Not measured" : "Non mesuré") + '</b>' +
            '<span class="cwv-rating">' + (isEN ? "No data" : "Sans donnée") + '</span>' +
            '<span class="cwv-desc">' + esc(terrain
              ? (isEN
                  ? "Google has not collected enough Chrome visits on your site to publish this one. The other three are there."
                  : "Google n'a pas recueilli assez de visites Chrome sur votre site pour publier celle-ci. Les trois autres y sont.")
              : (isEN
                  ? "This metric was not returned by the lab run."
                  : "Cette mesure n'a pas été renvoyée par le passage en laboratoire.")) + '</span>' +
            '<span class="cwv-ideal">' + (isEN ? "Target " : "Cible ") + esc(m.ideal) + '</span>' +
            '</div>';
          return;
        }
        var rating = v.rating || "warn";
        html += '<div class="cwv-card cwv-' + rating + '">' +
          '<span class="cwv-src">' + esc(v.proxy ? tagLabo : (terrain ? tagTerrain : tagLabo)) + '</span>' +
          '<span class="cwv-metric">' + esc(m.label) + '</span>' +
          '<b class="cwv-value">' + esc(v.value) + (v.unit ? '<small> ' + esc(v.unit) + '</small>' : '') + '</b>' +
          '<span class="cwv-rating">' + ratingLabel[rating] + '</span>' +
          '<span class="cwv-desc">' + esc(m.desc) + '</span>' +
          '<span class="cwv-ideal">' + (isEN ? "Target " : "Cible ") + esc(m.ideal) + '</span>' +
          '</div>';
      });
      if (typeof d.perfScore === "number") {
        var pr = d.perfScore >= 90 ? "good" : d.perfScore >= 50 ? "warn" : "bad";
        html += '<div class="cwv-card cwv-' + pr + '">' +
          '<span class="cwv-src">' + esc(tagLabo) + '</span>' +
          '<span class="cwv-metric">' + (isEN ? "Performance score" : "Score performance") + '</span>' +
          '<b class="cwv-value">' + d.perfScore + '<small> /100</small></b>' +
          '<span class="cwv-rating">' + ratingLabel[pr] + '</span>' +
          '<span class="cwv-desc">' + (isEN
            ? "Lighthouse lab run on a throttled mobile. It weighs more than the three vitals above, in particular main-thread blocking, which is why it can be low while they are green."
            : "Passage Lighthouse en laboratoire, sur un mobile bridé. Il pèse plus que les trois mesures ci-dessus, en particulier le blocage du fil principal : c'est pourquoi il peut être bas alors qu'elles sont au vert.") + '</span>' +
          '</div>';
      }
      grid.innerHTML = html || '<div class="cwv-loading">' + (isEN ? "Performance measurement unavailable for this site." : "Mesure de performance indisponible pour ce site.") + '</div>';
      if (note) {
        note.hidden = false;
        /* Deux sources dans la meme grille, il faut le dire ici aussi : la note
           precedente annoncait « donnees terrain » pour l'ensemble alors que le
           score de performance vient toujours du laboratoire. */
        var noteTxt;
        if (isEN) {
          noteTxt = terrain
            ? "Field data: the three vitals above are real measurements collected by Google (CrUX) from your Chrome visitors over the last 28 days."
            : "Lab data (Lighthouse): not enough Chrome traffic yet for field measurements, so the page was run once on a throttled mobile. Responsiveness is estimated via total main-thread blocking.";
          if (typeof d.perfScore === "number") {
            noteTxt += terrain
              ? " The performance score, however, always comes from a lab run: it is not measured on your visitors, and it can be low while your field vitals are green. It follows Google Lighthouse's official scale: 90-100 good, 50-89 watch, 0-49 fix."
              : " The performance score follows Google Lighthouse's official scale: 90-100 good, 50-89 watch, 0-49 fix.";
          }
        } else {
          noteTxt = terrain
            ? "Données terrain : les trois mesures ci-dessus sont réelles, collectées par Google (CrUX) sur vos visiteurs Chrome des 28 derniers jours."
            : "Données de laboratoire (Lighthouse) : trafic Chrome encore insuffisant pour des mesures terrain, la page a donc été chargée une fois sur un mobile bridé. La réactivité est estimée via le blocage total du fil principal.";
          if (typeof d.perfScore === "number") {
            noteTxt += terrain
              ? " Le score performance, lui, vient toujours du laboratoire : il n'est pas mesuré sur vos visiteurs, et il peut être bas alors que vos mesures terrain sont au vert. Il suit le barème officiel de Google Lighthouse : 90-100 bon, 50-89 à surveiller, 0-49 à corriger."
              : " Le score performance suit le barème officiel de Google Lighthouse : 90-100 bon, 50-89 à surveiller, 0-49 à corriger.";
          }
        }
        note.textContent = noteTxt;
      }
    }

    function fail(msg) {
      var wait = Math.max(0, minDelay - (Date.now() - startedAt));
      setTimeout(function () {
        loading.hidden = true;
        if (msg) $("#roast-error-msg").textContent = msg;
        $("#roast-error").hidden = false;
      }, wait);
    }

  }

  /* ---------- Outil gratuit : generateur llms.txt ---------- */

  function initLlms() {
    var form = $("#llms-form");
    var output = $("#llms-output");
    if (!form || !output) return;

    function val(id) { return ($(id).value || "").trim(); }
    function cleanHost(raw) {
      return raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    }

    function build() {
      var name = val("#llms-name") || (isEN ? "Company name" : "Nom de l'entreprise");
      var host = cleanHost(val("#llms-url")) || (isEN ? "yoursite.com" : "votresite.fr");
      var desc = val("#llms-desc");
      var offers = val("#llms-offers").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var pages = val("#llms-pages").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var contact = val("#llms-contact");

      /* La redaction suit la langue du site : un visiteur EN livre un llms.txt EN. */
      var lines = ["# " + name, ""];
      if (desc) lines.push("> " + desc.replace(/\s*\n\s*/g, " "), "");
      lines.push((isEN ? "Website: https://" : "Site : https://") + host, "");
      if (offers.length) {
        lines.push(isEN ? "## Offers and services" : "## Offres et services", "");
        offers.forEach(function (o) { lines.push("- " + o); });
        lines.push("");
      }
      if (pages.length) {
        lines.push(isEN ? "## Key pages" : "## Pages clés", "");
        pages.forEach(function (p) {
          /* Google (audit llms-txt de Lighthouse 13) exige de vrais liens
             Markdown : une ligne "- /chemin : texte" ne compte pas. */
          var m = p.match(/^(\S+)\s*:\s*(.+)$/);
          var path = m ? m[1] : p.split(" ")[0];
          var label = m ? m[2] : "";
          var urlP = path.indexOf("/") === 0 ? "https://" + host + path
                   : /^https?:\/\//i.test(path) ? path : "";
          if (urlP) lines.push("- [" + (label || path) + "](" + urlP + ")");
          else lines.push("- " + p);
        });
        lines.push("");
      }
      lines.push("## Contact", "");
      if (contact) lines.push((isEN ? "- Email: " : "- Email : ") + contact);
      lines.push((isEN ? "- Website: " : "- Site : ") + "[https://" + host + "](https://" + host + ")");
      lines.push("");
      lines.push(isEN
        ? "If a piece of information is not listed here, assume it is unavailable rather than inferring it."
        : "Si une information n'est pas listée ici, considérez qu'elle n'est pas disponible plutôt que de l'inférer.");
      lines.push("");
      lines.push(isEN
        ? "<!-- Generated with SEOPlus! - free llms.txt generator: https://www.optimizia.xyz/tools/seoplus/ -->"
        : "<!-- Généré avec SEOPlus! - générateur llms.txt gratuit : https://www.optimizia.xyz/tools/seoplus/ -->");

      output.textContent = lines.join("\n");
      var hint = $("#llms-hint-url");
      if (hint) hint.textContent = host + "/llms.txt";
    }

    form.addEventListener("input", build);
    build();

    $("#llms-copy").addEventListener("click", function () {
      var btn = this;
      navigator.clipboard.writeText(output.textContent).then(function () {
        btn.textContent = tUI("copied", "Copié !");
        setTimeout(function () { btn.textContent = tUI("copy", "Copier"); }, 1600);
      });
    });

    $("#llms-download").addEventListener("click", function () {
      var blob = new Blob([output.textContent], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "llms.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });
  }

  /* ---------- /classement : top 20 public opt-in ---------- */

  function initClassement() {
    var loading = $("#rank-loading");
    if (!loading) return;

    function fail() {
      loading.hidden = true;
      if (aUnSnapshot($("#rank-elite")) || aUnSnapshot($("#rank-table"))) return;
      $("#rank-empty").hidden = false;
    }

    if (!CFG.CLASSEMENT_URL) { fail(); return; }

    fetch(CFG.CLASSEMENT_URL)
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var data = null;
        try { data = JSON.parse(t); } catch (e) {}
        if (!data || data.ok === false) throw new Error();
        loading.hidden = true;
        if (!data.sites || !data.sites.length) { fail(); return; }

        renderRanking(data.sites, $("#rank-elite"), $("#rank-table"), $("#rank-elite-head"));

        var cnt = $("#rank-count");
        if (cnt) {
          var n = data.sites.length;
          cnt.textContent = isEN
            ? n + (n > 1 ? " websites ranked" : " website ranked")
            : n + (n > 1 ? " sites classés" : " site classé");
          cnt.hidden = false;
        }

        if (data.updated) {
          var up = $("#rank-updated");
          /* Meme regle que le compteur juste au-dessus : l'hydratation repasse
             APRES la traduction statique, ce qu'elle ecrit doit suivre la
             langue courante (ligne restee en francais dans la page anglaise,
             panne signalee par RBE le 16/08). */
          up.textContent = (isEN ? "Last update: " : "Dernière mise à jour : ") + new Date(data.updated).toLocaleDateString("fr-FR");
          up.hidden = false;
        }
      })
      .catch(fail);
  }

  /* ---------- Newsletter : bande d'inscription au-dessus du footer ---------- */

  function initNewsletter() {
    var footer = $("footer.footer");
    if (!footer || !CFG.NEWSLETTER_URL) return;
    var box = $(".container", footer);
    if (!box) return;
    var band = document.createElement("div");
    band.className = "nl-foot";
    band.innerHTML = '<div class="nl-foot-text"><b>' + tUI("nlTitle", "Des tips SEO, zéro spam") + '<span class="nl-cursor" aria-hidden="true">_</span></b>' +
      "<span>" + tUI("nlSub", "Un conseil actionnable chaque lundi matin, désinscription en un clic.") + ' <a href="politique-confidentialite.html">' + tUI("authPrivacy", "Confidentialité") + "</a></span></div>" +
      '<form class="nl-form">' +
      '<input type="email" name="email" required placeholder="' + tUI("emailPlaceholder", "votre@email.fr") + '" autocomplete="email" aria-label="Email">' +
      '<button type="submit" class="btn btn-primary">' + tUI("nlBtn", "S'inscrire") + "</button>" +
      '<p class="nl-status" hidden></p></form>';
    box.insertBefore(band, box.firstElementChild);
    var form = $(".nl-form", band);

    /* Memoire locale de l'inscription. Le bandeau vit dans le pied de page,
       donc sur les 56 pages du site ; sans cette memoire, seuls les visiteurs
       CONNECTES voyaient l'etat "deja inscrit", et un lecteur du blog non
       connecte se voyait proposer de s'inscrire a chaque article. */
    var NL_KEY = "seoplus_nl_inscrit";
    function nlMemo(email) {
      try { localStorage.setItem(NL_KEY, email || "1"); } catch (e) {}
    }
    function nlMemoLu() {
      try { return localStorage.getItem(NL_KEY); } catch (e) { return null; }
    }
    function dejaInscrit(email) {
      nlMemo(email);
      form.innerHTML = '<p class="nl-ok nl-done">' +
        tUI("nlSubscribed", "Vous êtes inscrit aux tips SEO.") + "</p>";
    }

    // Etat connu de ce navigateur : affiche immediatement, sans attendre le reseau.
    if (nlMemoLu()) dejaInscrit(nlMemoLu());

    getUser(function (user) {
      if (!user || !user.email) return;
      if (!form.email.value) form.email.value = user.email;
      /* check:true interroge la liste sans rien y ecrire : afficher un bouton
         "S'inscrire" a quelqu'un de deja inscrit lui fait croire que rien n'a
         marche la premiere fois. */
      fetch(CFG.NEWSLETTER_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ email: user.email, check: true })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          /* Le serveur reste la source de verite : il confirme (et memorise)
             ou il infirme, auquel cas on efface une memoire locale devenue
             fausse - desinscription depuis un email, par exemple. */
          if (!d || !d.ok) return;
          if (d.already) dejaInscrit(user.email);
          else { try { localStorage.removeItem(NL_KEY); } catch (e) {} }
        })
        .catch(function () {});
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (form.email.value || "").trim();
      if (!email) return;
      var btn = $("button", form);
      var status = $(".nl-status", band);
      btn.disabled = true;
      fetch(CFG.NEWSLETTER_URL, {
        method: "POST",
        // text/plain = requete CORS simple, pas de preflight sur le webhook n8n
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ email: email, source: page || "site" })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) throw new Error((d && d.error) || "");
          /* Le webhook dit si l'adresse etait deja dans la liste. Annoncer une
             inscription a quelqu'un qui est deja inscrit fait douter du reste. */
          nlMemo(email);
          form.innerHTML = '<p class="nl-ok">' + (d.already
            ? tUI("nlAlready", "Vous êtes déjà inscrit avec cette adresse. Rien à faire : le prochain conseil arrive lundi matin.")
            : tUI("nlOk", "Bien reçu. Rendez-vous lundi matin dans votre boîte mail.")) + "</p>";
        })
        .catch(function (err) {
          btn.disabled = false;
          status.textContent = (err && err.message) || tUI("nlErr", "Inscription impossible pour le moment. Réessayez dans un instant.");
          status.hidden = false;
        });
    });
  }

  /* ---------- /blog : filtre par thème ---------- */

  function initBlog() {
    var grid = $(".blog-grid");
    var chips = $$(".blog-filter .chip");
    if (!grid || !chips.length) return;
    var cards = $$(".blog-card", grid);
    chips.forEach(function (chip) {
      /* Compteur rempli au rendu : il ne peut pas se desynchroniser des cartes
         quand on publie un article. */
      var n = chip.querySelector(".chip-n");
      if (n) {
        var t = chip.dataset.theme;
        n.textContent = t === "all" ? cards.length : cards.filter(function (c) { return c.dataset.theme === t; }).length;
      }
      chip.addEventListener("click", function () {
        chips.forEach(function (b) { b.classList.remove("active"); });
        chip.classList.add("active");
        var t = chip.dataset.theme;
        $$(".blog-card", grid).forEach(function (card) {
          card.style.display = (t === "all" || card.dataset.theme === t) ? "" : "none";
        });
      });
    });
  }

  /* ---------- Article : sommaire qui suit la lecture ---------- */

  function initPostToc() {
    var links = $$(".post-toc a");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var byId = {};
    var targets = [];
    links.forEach(function (a) {
      var id = (a.getAttribute("href") || "").slice(1);
      var el = id && document.getElementById(id);
      if (!el) return;
      byId[id] = a;
      targets.push(el);
    });
    if (!targets.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("active"); });
        byId[e.target.id].classList.add("active");
      });
    }, { rootMargin: "-88px 0px -68% 0px" });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- /compte : profil + historique des rapports ---------- */

  function initTestimonial(user) {
    var form = $("#tm-form");
    var tmList = $("#tm-list");
    if (!form || !tmList) return;

    var meta = user.user_metadata || {};
    var nameInput = $("#tm-name");
    if (nameInput && !nameInput.value) nameInput.value = meta.full_name || meta.name || "";
    var companyInput = $("#tm-company");
    var lastHost = null;

    sbClient().from("reports").select("host").order("created_at", { ascending: false }).limit(1)
      .then(function (res) { if (!res.error && res.data && res.data[0]) lastHost = res.data[0].host; }, function () {});

    if (companyInput && !companyInput.value) {
      sbClient().from("profiles").select("company").eq("user_id", user.id).maybeSingle()
        .then(function (res) { if (!res.error && res.data && res.data.company) companyInput.value = res.data.company; }, function () {});
    }

    var STATUS_LABEL = {
      pending: tUI("tmPending", "En attente de validation"),
      approved: tUI("tmApproved", "Publié"),
      rejected: tUI("tmRejected", "Non retenu")
    };

    function loadMine() {
      sbClient().from("testimonials")
        .select("id,rating,message,status,created_at")
        .order("created_at", { ascending: false })
        .limit(10)
        .then(function (res) {
          if (res.error || !res.data || !res.data.length) { tmList.innerHTML = ""; return; }
          tmList.innerHTML = res.data.map(function (t) {
            var date = new Date(t.created_at).toLocaleDateString(isEN ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
            return '<div class="fb-item" data-tm="' + esc(t.id) + '"><div class="fb-item-head">' +
              '<span class="fb-badge fb-badge--' + esc(t.status) + '">' + esc(STATUS_LABEL[t.status] || t.status) + "</span>" +
              '<span class="tm-score">' + esc(t.rating) + "/5</span>" +
              "<span>" + esc(date) + "</span>" +
              '<button type="button" class="compte-del" data-tmdel>' + tUI("tmWithdraw", "Retirer") + "</button></div>" +
              "<p>" + esc(t.message) + "</p></div>";
          }).join("");
          $$("[data-tmdel]", tmList).forEach(function (b) {
            b.addEventListener("click", function () {
              if (b.dataset.confirm !== "1") {
                b.dataset.confirm = "1";
                b.textContent = tUI("tmConfirm", "Confirmer le retrait ?");
                return;
              }
              var id = b.closest("[data-tm]").dataset.tm;
              sbClient().from("testimonials").delete().eq("id", id).then(loadMine, loadMine);
            });
          });
        }, function () {});
    }
    loadMine();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = $(".tm-status", form);
      var msg = ($("#tm-msg").value || "").trim();
      var consent = $("#tm-consent");
      function fail(txt) {
        status.textContent = txt;
        status.classList.add("bad");
        status.hidden = false;
      }
      if (msg.length < 10) {
        fail(tUI("tmTooShort", "Votre témoignage est un peu court : dites en quelques phrases ce que l'audit vous a apporté."));
        return;
      }
      if (!consent || !consent.checked) {
        fail(tUI("tmNoConsent", "Cochez l'autorisation de publication : sans elle, on ne peut pas publier votre témoignage."));
        return;
      }
      var btn = $("button[type='submit']", form);
      btn.disabled = true;
      sbClient().from("testimonials").insert({
        user_id: user.id,
        email: user.email,
        name: ((nameInput && nameInput.value) || meta.full_name || meta.name || "").trim() || null,
        company: ((companyInput && companyInput.value) || "").trim() || null,
        host: lastHost,
        rating: Number((form.querySelector("input[name='tmrate']:checked") || {}).value || 5),
        message: msg,
        consent_publish: true,
        status: "pending"
      }).then(function (res) {
        btn.disabled = false;
        if (res.error) {
          fail(tUI("tmErr", "Envoi impossible pour le moment. Réessayez dans un instant."));
          return;
        }
        $("#tm-msg").value = "";
        consent.checked = false;
        status.textContent = tUI("tmOk", "Merci ! Votre témoignage nous est bien parvenu. On vous relit avant publication.");
        status.classList.remove("bad");
        status.hidden = false;
        setTimeout(function () { status.hidden = true; }, 5000);
        loadMine();
      }, function () { btn.disabled = false; });
    });
  }

  /* Depuis le 05/08 le formulaire de temoignage vit sur la home, la ou il est vu.
     Il exige un compte : la RLS force l'insert en status 'pending' et le lie a
     auth.uid(), donc un visiteur anonyme voit une invitation a se connecter. */
  function initTestimonialHome() {
    loadPublishedTestimonials();
    var form = $("#tm-form");
    var gate = $("#tm-authgate");
    if (!form) return;
    getUser(function (user) {
      if (user) { form.hidden = false; initTestimonial(user); return; }
      if (!gate || !sbConfigure()) return;
      gate.innerHTML = authCardHtml(
        isEN ? "Sign in to leave your testimonial." : "Connectez-vous pour laisser votre témoignage.",
        isEN ? "We read it before publishing, and you can withdraw it at any time."
             : "On le relit avant publication, et vous pouvez le retirer à tout moment.",
        tUI("tmBadge", "Votre avis")
      );
      bindAuthCard(gate);
      gate.hidden = false;
    });
  }

  /* Vitrine publique. Lecture anonyme autorisee uniquement sur les temoignages
     valides ET consentis (politique testimonials_select_approved). 'approved' et
     non 'published' : la contrainte SQL n'autorise que pending/approved/rejected,
     et un filtre sur une valeur impossible aurait laisse la vitrine vide a vie.
     Tant qu'aucun
     n'est publie la section reste muette : mieux qu'un bloc vide sur la home. */
  /* Seule lecture anonyme du site, donc le seul endroit qui aurait force le SDK
     sur la page d'accueil. La vitrine est sous la ligne de flottaison : on
     l'alimente quand elle approche de l'ecran, pas au chargement. Le repli sur
     minuteur couvre les navigateurs sans IntersectionObserver, et evite qu'une
     vitrine reste vide si l'observateur ne se declenche jamais. */
  function loadPublishedTestimonials() {
    var box = $("#tm-showcase");
    if (!box || !sbConfigure()) return;
    var parti = false;
    function go() {
      if (parti) return;
      parti = true;
      avecSupabase(function (client) { if (client) remplirVitrine(box, client); });
    }
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); }
      }, { rootMargin: "400px" });
      io.observe(box);
      window.addEventListener("load", function () { setTimeout(go, 4000); }, { once: true });
    } else {
      go();
    }
  }

  function remplirVitrine(box, client) {
    client.from("testimonials")
      .select("name,company,rating,message,created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return;
        box.innerHTML = res.data.map(function (t) {
          var n = Math.max(0, Math.min(5, Number(t.rating) || 0));
          var stars = "";
          for (var i = 0; i < 5; i++) stars += i < n ? "\u2605" : "\u2606";
          var who = esc(t.name || (isEN ? "Anonymous" : "Anonyme"));
          if (t.company) who += ' <span>' + esc(t.company) + "</span>";
          return '<figure class="tm-card"><div class="tm-card-stars" aria-label="' + n + '/5">' + stars + "</div>" +
            "<blockquote><p>" + esc(t.message) + "</p></blockquote>" +
            "<figcaption>" + who + "</figcaption></figure>";
        }).join("");
        box.hidden = false;
      }, function () {});
  }

  /* Un diagnostic gratuit devient du bruit des qu'un audit complet du meme site
     existe : il ne dit rien de plus et il double la ligne. On ne masque que si le
     complet est POSTERIEUR, sinon on cacherait un diagnostic relance apres coup
     pour verifier une correction - qui lui a du sens. */
  function dedupeReports(rows) {
    var lastFull = {};
    rows.forEach(function (r) {
      if (r.kind !== "complet") return;
      var t = +new Date(r.created_at);
      if (!lastFull[r.host] || t > lastFull[r.host]) lastFull[r.host] = t;
    });
    return rows.filter(function (r) {
      if (r.kind === "complet") return true;
      return !(lastFull[r.host] && lastFull[r.host] > +new Date(r.created_at));
    });
  }

  function initCompte() {
    var main = $("#compte-main");
    if (!main) return;
    var gate = $("#compte-gate");
    var list = $("#compte-list");

    getUser(function (user) {
      if (!user) {
        if (!sbConfigure() || !gate) { window.location.href = BASE + "/"; return; }
        gate.innerHTML = authCardHtml(
          isEN ? "Retrieve your reports." : "Retrouvez vos rapports.",
          isEN ? "Sign in to access your audit history and reopen any report at any time." : "Connectez-vous pour accéder à votre historique d'audits et rouvrir chaque rapport à tout moment."
        );
        bindAuthCard(gate);
        gate.hidden = false;
        return;
      }
      main.hidden = false;
      var meta = user.user_metadata || {};
      $("#compte-name").textContent = meta.full_name || meta.name || user.email;
      $("#compte-email").textContent = user.email;
      $("#compte-logout").addEventListener("click", function () {
        this.textContent = "Déconnexion...";
        var done = function () { window.location.href = BASE + "/"; };
        sbClient().auth.signOut().then(done, done);
      });

      // Societe (table profiles) : lecture + enregistrement depuis le compte
      var companyInput = $("#compte-company");
      if (companyInput) {
        sbClient().from("profiles").select("company").eq("user_id", user.id).maybeSingle().then(function (res) {
          if (!res.error && res.data && res.data.company) companyInput.value = res.data.company;
        }, function () {});
        $("#compte-company-save").addEventListener("click", function () {
          var btn = this;
          sbClient().from("profiles").upsert({
            user_id: user.id,
            company: (companyInput.value || "").trim() || null,
            updated_at: new Date().toISOString()
          }).then(function (res) {
            btn.textContent = res.error ? (isEN ? "Try again" : "Réessayer") : (isEN ? "Saved!" : "Enregistré !");
            if (!res.error) { try { localStorage.setItem("seoplus_company_done", "1"); } catch (e) {} }
            setTimeout(function () { btn.textContent = tUI("companySave", "Enregistrer"); }, 2000);
          }, function () {});
        });
      }

      initFeedback(user);
      initFounderFeedback(user);

      sbClient().from("reports")
        .select("id,host,score,grade,kind,created_at")
        .order("created_at", { ascending: false })
        .limit(100)
        .then(function (res) {
          if (res.error) {
            list.innerHTML = '<p class="compte-empty">Impossible de charger votre historique pour le moment. Rechargez la page.</p>';
            return;
          }
          renderList(dedupeReports(res.data || []));
        }, function () {
          list.innerHTML = '<p class="compte-empty">Impossible de charger votre historique pour le moment. Rechargez la page.</p>';
        });
    });

    /* Retour Fondateur : les 5 questions ne s'affichent que pour qui a pris une
       place. Elles vivent sur la ligne founders plutot que dans feedback, une
       colonne par question : c'est ce qui permet de lire les 30 reponses a la
       meme question cote a cote, la matiere premiere du barometre. */
    function initFounderFeedback(user) {
      var block = $("#fondateur"), form = $("#fd-form");
      if (!block || !form || !user) return;
      var navLink = $("#compte-nav-fondateur");
      var status = $(".fd-status", form);

      sbClient().from("founders").select("id,host,feedback_at").limit(1).then(function (res) {
        if (res.error || !res.data || !res.data.length) return;
        var row = res.data[0];
        block.hidden = false;
        if (navLink) navLink.hidden = false;
        if (row.feedback_at) {
          form.innerHTML = '<p class="compte-empty">' + (isEN
            ? "Feedback received, thank you. We come back to you at the 60-day re-audit."
            : "Retour bien reçu, merci. On revient vers vous au re-audit des 60 jours.") + "</p>";
          return;
        }
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var btn = $("button[type=submit]", form);
          var vals = {};
          var missing = false;
          ["q_objectif", "q_incompris", "q_applique", "q_abandonne", "q_manque"].forEach(function (k) {
            var v = (form[k].value || "").trim();
            if (!v) missing = true;
            vals[k] = v;
          });
          if (missing) {
            status.textContent = isEN ? "The five answers are needed, even short ones." : "Les cinq réponses sont nécessaires, même courtes.";
            status.classList.add("bad");
            status.hidden = false;
            return;
          }
          btn.disabled = true;
          vals.feedback_at = new Date().toISOString();
          sbClient().from("founders").update(vals).eq("id", row.id).then(function (r2) {
            if (r2.error) {
              btn.disabled = false;
              status.textContent = isEN ? "Sending failed. Try again." : "L'envoi n'a pas abouti. Réessayez.";
              status.classList.add("bad");
              status.hidden = false;
              return;
            }
            form.innerHTML = '<p class="compte-empty">' + (isEN
              ? "Feedback received, thank you. We come back to you at the 60-day re-audit."
              : "Retour bien reçu, merci. On revient vers vous au re-audit des 60 jours.") + "</p>";
          }, function () {
            btn.disabled = false;
            status.textContent = isEN ? "Sending failed. Try again." : "L'envoi n'a pas abouti. Réessayez.";
            status.hidden = false;
          });
        });
      }, function () {});
    }

    /* Retours produit : idee, bug ou avis, reserves aux comptes connectes
       (table feedback, RLS par user : chacun ne voit que ses propres retours). */
    function initFeedback(user) {
      var form = $("#fb-form");
      var fbList = $("#fb-list");
      if (!form || !fbList) return;

      var CAT_LABEL = {
        idee: tUI("fbIdea", "Idée"),
        bug: tUI("fbBug", "Bug"),
        autre: tUI("fbOther", "Autre")
      };

      function loadMine() {
        sbClient().from("feedback")
          .select("category,message,created_at,image_path")
          .order("created_at", { ascending: false })
          .limit(20)
          .then(function (res) {
            if (res.error || !res.data || !res.data.length) { fbList.innerHTML = ""; return; }
            fbList.innerHTML = res.data.map(function (f) {
              var date = new Date(f.created_at).toLocaleDateString(isEN ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
              return '<div class="fb-item"><div class="fb-item-head">' +
                '<span class="fb-badge fb-badge--' + esc(f.category) + '">' + esc(CAT_LABEL[f.category] || f.category) + "</span>" +
                "<span>" + esc(date) + "</span></div>" +
                "<p>" + esc(f.message) + "</p>" +
                (f.image_path
                  ? '<a class="fb-shot" data-path="' + esc(f.image_path) + '" target="_blank" rel="noopener"><img alt="' + (isEN ? "Screenshot attached to this feedback" : "Capture jointe à ce retour") + '" loading="lazy"></a>'
                  : "") +
                "</div>";
            }).join("");

            /* Le bucket est prive : une URL directe renverrait 400. On demande
               des URLs signees d'une heure, en un seul appel pour toute la liste. */
            var shots = $$(".fb-shot", fbList);
            if (!shots.length) return;
            sbClient().storage.from("feedback")
              .createSignedUrls(shots.map(function (a) { return a.getAttribute("data-path"); }), 3600)
              .then(function (r) {
                (r && r.data ? r.data : []).forEach(function (row, i) {
                  if (!row || !row.signedUrl || !shots[i]) return;
                  shots[i].href = row.signedUrl;
                  var im = $("img", shots[i]);
                  if (im) im.src = row.signedUrl;
                });
              }, function () {});
          }, function () {});
      }
      loadMine();

      /* ---- Piece jointe ---- */
      var MAX_MB = 5, MAX_DIM = 1800;
      var pendingImage = null;
      var fileInput = $("#fb-image"), preview = $("#fb-preview");
      var fbStatus = $(".fb-status", form);

      function showStatus(txt, bad) {
        if (!fbStatus) return;
        fbStatus.textContent = txt;
        fbStatus.classList.toggle("bad", !!bad);
        fbStatus.hidden = false;
      }
      function clearImage() {
        pendingImage = null;
        if (fileInput) fileInput.value = "";
        if (preview) preview.hidden = true;
      }

      /* Une capture d'ecran pese souvent 2 a 4 Mo alors qu'au-dela de 1800 px
         elle n'apporte plus rien de lisible. On la reduit avant l'envoi.
         Qualite 0.9 : une capture est surtout du texte, et plus bas le JPEG le
         rend baveux - or c'est justement ce texte qu'on veut pouvoir lire. */
      function shrink(file, cb) {
        if (!window.HTMLCanvasElement || file.type === "image/gif") { cb(file); return; }
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
          if (scale === 1 && file.size < 900000) { URL.revokeObjectURL(url); cb(file); return; }
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (blob) {
            URL.revokeObjectURL(url);
            cb(blob && blob.size < file.size ? blob : file);
          }, "image/jpeg", 0.9);
        };
        img.onerror = function () { URL.revokeObjectURL(url); cb(file); };
        img.src = url;
      }

      if (fileInput) {
        fileInput.addEventListener("change", function () {
          var f = fileInput.files && fileInput.files[0];
          if (!f) { clearImage(); return; }
          if (!/^image\//.test(f.type)) {
            showStatus(isEN ? "Images only (PNG, JPG, WebP)." : "Images uniquement (PNG, JPG, WebP).", true);
            clearImage(); return;
          }
          if (f.size > MAX_MB * 1024 * 1024) {
            showStatus(isEN ? "This image is over 5 MB. Pick a lighter one." : "Cette image dépasse 5 Mo. Choisissez-en une plus légère.", true);
            clearImage(); return;
          }
          if (fbStatus) fbStatus.hidden = true;
          shrink(f, function (blob) {
            pendingImage = blob;
            pendingImage._name = f.name;
            if (preview) {
              var im = $("#fb-preview-img");
              if (im) im.src = URL.createObjectURL(f);
              var nm = $("#fb-preview-name");
              if (nm) nm.textContent = f.name + " · " + Math.max(1, Math.round(blob.size / 1024)) + " Ko";
              preview.hidden = false;
            }
          });
        });
      }
      var clearBtn = $("#fb-image-clear");
      if (clearBtn) clearBtn.addEventListener("click", clearImage);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var msg = ($("#fb-msg").value || "").trim();
        if (msg.length < 3) return;
        var cat = (form.querySelector("input[name='fbcat']:checked") || {}).value || "idee";
        var btn = $("button[type='submit']", form);
        var status = $(".fb-status", form);
        var oldLabel = btn.textContent;
        btn.disabled = true;
        var meta = user.user_metadata || {};

        function insertRow(imagePath, imageFailed) {
          sbClient().from("feedback").insert({
            user_id: user.id,
            email: user.email,
            name: meta.full_name || meta.name || null,
            category: cat,
            message: msg,
            image_path: imagePath || null
          }).then(function (res) {
            btn.disabled = false;
            btn.textContent = oldLabel;
            if (res.error) {
              showStatus(tUI("fbErr", "Envoi impossible pour le moment. Réessayez dans un instant."), true);
              return;
            }
            $("#fb-msg").value = "";
            clearImage();
            /* L'echec d'une piece jointe ne doit pas emporter le message : il
               part quand meme, et on le dit plutot que de laisser croire que
               la capture est arrivee. */
            showStatus(imageFailed
              ? (isEN ? "Feedback received, but the screenshot could not be uploaded." : "Retour bien reçu, mais la capture n'a pas pu être envoyée.")
              : tUI("fbOk", "Merci ! Votre retour est bien arrivé, on lit tout."), !!imageFailed);
            setTimeout(function () { if (status) status.hidden = true; }, 5000);
            loadMine();
          }, function () { btn.disabled = false; btn.textContent = oldLabel; });
        }

        if (!pendingImage) { insertRow(null, false); return; }

        btn.textContent = isEN ? "Uploading..." : "Envoi de la capture...";
        var type = pendingImage.type || "image/jpeg";
        var ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/gif" ? "gif" : "jpg";
        // Prefixe = user id : c'est ce segment que la policy RLS du bucket controle.
        var path = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
        sbClient().storage.from("feedback")
          .upload(path, pendingImage, { contentType: type, upsert: false })
          .then(function (up) {
            if (up && up.error) { insertRow(null, true); return; }
            insertRow(path, false);
          }, function () { insertRow(null, true); });
      });
    }

    /* Temoignages : avis destines a etre publies, distincts des retours produit.
       Consentement explicite obligatoire (case jamais pre-cochee), moderation
       cote equipe : l'insert est force en status 'pending' par la RLS. */


    /* Les 3 plus recents suffisent a l'usage courant : on revient sur son
       dernier audit, rarement sur le dixieme. Le reste part dans une modale
       plutot que d'etirer la page - un historique qui s'allonge indefiniment
       repousse tout le contenu utile de la page compte vers le bas. */
    var REPORTS_SHOWN = 3;
    var allReports = [];

    function reportRowHtml(r) {
        var d = new Date(r.created_at);
        var date = d.toLocaleDateString(isEN ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
        var time = d.toLocaleTimeString(isEN ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
        var cls = r.score >= 75 ? "good" : r.score >= 50 ? "warn" : "bad";
        var full = r.kind === "complet";
        /* Diagnostic gratuit : le payload ne donne pas droit au rapport complet
           (non paye). On garde le score et on propose de passer a l'audit. */
        var actions = full
          ? '<a class="btn btn-primary" href="rapport.html?rid=' + encodeURIComponent(r.id) + '">' + tUI("compteView", "Revoir le rapport") + "</a>" +
            (CFG.RAPPORT_IA_URL ? '<button type="button" class="compte-ghost" data-ia>' + tUI("compteIa", "URL pour votre IA") + "</button>" : "")
          : '<a class="compte-ghost" href="rapport.html?url=' + encodeURIComponent(r.host) + '">' + tUI("compteUpgrade", "Passer à l'audit complet") + "</a>";
        return '<article class="compte-row" data-id="' + esc(r.id) + '" data-host="' + esc(r.host) + '">' +
          '<div class="compte-row-score ' + cls + '"><b>' + (r.score == null ? "–" : esc(r.score)) + '</b><span>' + esc(r.grade || "") + "</span></div>" +
          '<div class="compte-row-main"><b>' + esc(r.host) +
            '<span class="compte-kind' + (full ? " compte-kind--full" : "") + '">' + (full ? tUI("compteKindFull", "Audit complet") : tUI("compteKindRoast", "Diagnostic")) + "</span></b>" +
            "<span>" + (isEN ? "Audit of " + esc(date) + " at " + esc(time) : "Audit du " + esc(date) + " à " + esc(time)) + "</span></div>" +
          '<div class="compte-row-actions">' + actions +
            '<button type="button" class="compte-del" data-del>' + tUI("compteDelete", "Supprimer") + "</button>" +
          "</div></article>";
    }

    function renderList(rows) {
      if (rows) allReports = rows;
      rows = allReports;
      if (!rows.length) {
        list.innerHTML = isEN
          ? '<p class="compte-empty">No report yet. <a href="index.html#analyser">Run your first audit</a>: it will show up here automatically.</p>'
          : '<p class="compte-empty">Aucun rapport pour l\'instant. <a href="index.html#analyser">Lancez votre premier audit</a> : il apparaîtra ici automatiquement.</p>';
        return;
      }
      list.innerHTML = rows.slice(0, REPORTS_SHOWN).map(reportRowHtml).join("");
      bindRowActions(list);

      var reste = rows.length - REPORTS_SHOWN;
      if (reste > 0) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "compte-showall";
        b.textContent = isEN
          ? "See all my audits (" + rows.length + ")"
          : "Voir tous mes audits (" + rows.length + ")";
        b.addEventListener("click", openHistory);
        list.appendChild(b);
      }
    }

    /* Historique complet en modale. Le contenu est reconstruit a chaque
       ouverture : apres une suppression, rouvrir doit montrer l'etat reel. */
    var histBox = null;
    function closeHistory() {
      if (!histBox) return;
      histBox.remove();
      histBox = null;
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onHistKey);
    }
    function onHistKey(e) { if (e.key === "Escape") closeHistory(); }
    function openHistory() {
      closeHistory();
      histBox = document.createElement("div");
      histBox.className = "modal-overlay";
      histBox.innerHTML =
        '<div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="hist-title">' +
          '<div class="modal-head">' +
            '<h2 id="hist-title">' + (isEN ? "All my audits" : "Tous mes audits") + '</h2>' +
            '<button type="button" class="modal-close" aria-label="' + (isEN ? "Close" : "Fermer") + '">&times;</button>' +
          '</div>' +
          '<p class="modal-sub">' + allReports.length +
            (isEN ? (allReports.length > 1 ? " audits, newest first." : " audit.")
                  : (allReports.length > 1 ? " audits, du plus récent au plus ancien." : " audit.")) + '</p>' +
          '<div class="modal-body compte-list" id="hist-list"></div>' +
        '</div>';
      var body = $("#hist-list", histBox);
      body.innerHTML = allReports.map(reportRowHtml).join("");
      bindRowActions(body);
      $(".modal-close", histBox).addEventListener("click", closeHistory);
      histBox.addEventListener("click", function (e) { if (e.target === histBox) closeHistory(); });
      document.addEventListener("keydown", onHistKey);
      document.body.appendChild(histBox);
      document.body.style.overflow = "hidden";
      var c = $(".modal-close", histBox);
      if (c) c.focus();
    }

    /* Les memes actions valent dans la page et dans la modale : une seule
       fonction, appelee sur le conteneur concerne. */
    function bindRowActions(list) {
      $$("[data-ia]", list).forEach(function (b) {
        b.addEventListener("click", function () {
          var link = CFG.RAPPORT_IA_URL + "?url=" + encodeURIComponent(b.closest(".compte-row").dataset.host);
          var flash = function () {
            b.textContent = tUI("urlCopied", "URL copiée !");
            setTimeout(function () { b.textContent = tUI("compteIa", "URL pour votre IA"); }, 2000);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(flash, flash);
          else window.prompt("Copiez l'URL de votre rapport :", link);
        });
      });
      /* Suppression en deux clics : le premier arme, le second confirme. */
      $$("[data-del]", list).forEach(function (b) {
        b.addEventListener("click", function () {
          var row = b.closest(".compte-row");
          if (!b.dataset.armed) {
            b.dataset.armed = "1";
            b.textContent = tUI("compteConfirm", "Confirmer la suppression ?");
            setTimeout(function () { delete b.dataset.armed; b.textContent = tUI("compteDelete", "Supprimer"); }, 4000);
            return;
          }
          sbClient().from("reports").delete().eq("id", row.dataset.id).then(function (res) {
            if (res.error) return;
            allReports = allReports.filter(function (x) { return x.id !== row.dataset.id; });
            renderList(null);
            // La modale ouverte doit refleter la suppression, pas la masquer.
            if (histBox) { if (allReports.length) openHistory(); else closeHistory(); }
          });
        });
      });
    }
  }

  /* ---------- Boot ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    /* Tout le chemin de bascule, pas seulement la traduction des textes : le
       chargement direct en anglais laissait les liens internes sans ?lang=en
       et le lien Blog sur le listing francais, quand un clic sur la pilule
       reglait les deux. Meme rendu quel que soit le chemin d'entree. */
    basculerLangue(LANG);
    initLangToggle();
    handleAuthReturn();
    initAccountLink();
    initMobileNav();
    initNewsletter();
    /* Sur une page d'audit en anglais, la traduction des constats sera
       necessaire dans une trentaine de secondes : on la met en route tout de
       suite, en parallele de l'analyse. Le garde de rendu reste la ceinture. */
    if (isEN && (page === "roast" || page === "bilan" || page === "rapport")) chargerDictAudit();
    if (page === "home") { initHome(); initTestimonialHome(); }
    if (page === "roast" || page === "bilan") initRoast();
    if (page === "rapport") { initReport(); initBench(); }
    if (page === "llms") initLlms();
    if (page === "classement") initClassement();
    if (page === "compte") initCompte();
    if (page === "blog") initBlog();
    if (page === "post") initPostToc();
  });
})();

/* Le tracker vivait ici, en copie inline. Il en existait donc DEUX sur chaque
   page depuis que la V6.0 a ajoute /assets/oia-tracker.js : deux IIFE, meme
   webhook, aucun garde-fou, donc chaque visite comptee deux fois. La copie
   inline est retiree le 19/08 ; l'implementation partagee (identique a celle
   de l'agence et de romainben.cloud) est le fichier a part, charge par la
   balise <script data-site="seoplus"> de chaque page. */
