/* Fige le classement public dans le HTML de leaderboard.html et index.html.

   POURQUOI. Les deux pages recevaient leur classement uniquement par fetch au
   chargement. GPTBot, ClaudeBot et PerplexityBot n'executent pas JavaScript :
   ils voyaient « Chargement du classement… » et rien d'autre. Le contenu de
   preuve du site, celui qui montre de vrais sites avec de vrais scores, etait
   invisible exactement pour les moteurs que le produit pretend adresser.
   Effet de bord : le remplacement du bloc de chargement par les lignes du
   classement etait aussi une source de decalage de mise en page.

   COMMENT. Le balisage produit ici est identique, balise pour balise, a celui
   de rankRowsHtml() et eliteCardsHtml() dans app.js. C'est la condition pour que
   l'hydratation par-dessus ne deplace pas un pixel. Si ces fonctions changent,
   ce script doit changer avec elles : le test de fin de fichier compare les deux
   et refuse d'ecrire en cas de derive.

   QUAND. Chaque nuit, par .github/workflows/snapshot-classement.yml : si la
   photo a change, le workflow ouvre une pull request fusionnee automatiquement
   apres les verifications requises. Jusqu'au 26/09 le script vivait dans le
   coffre et se lancait a la main : il a ecrit un mois durant dans une copie
   archivee sans que personne le voie.

   Usage (depuis la racine du depot) :
     node scripts/generer-snapshot-classement.js          simulation
     node scripts/generer-snapshot-classement.js --go     ecriture
*/
const fs = require('fs');
const path = require('path');

const GO = process.argv.includes('--go');
const SITE = path.join(__dirname, '..', 'site', 'tools', 'seoplus');
const URL_CLASSEMENT = 'https://n8n.romainben.cloud/webhook/seoplus-classement';
const ELITE_MIN = 90;               // doit valoir ELITE_MIN dans app.js
const TOP_HOME = 5;                 // doit valoir le slice(0, 5) de initHome

/* Les marqueurs portent le nom du conteneur. Des marqueurs identiques partout
   rendraient la recherche ambigue des la deuxieme injection dans une meme page :
   on retomberait sur ceux du bloc precedent. */
const DEB = id => '<!-- snapshot:' + id + ':debut -->';
const FIN = id => '<!-- snapshot:' + id + ':fin -->';

/* Meme echappement que esc() dans app.js. */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const borne = s => Math.max(0, Math.min(100, Math.round(Number(s) || 0)));

function rankRowsHtml(sites) {
  /* Les pages publiques sont ecrites en anglais depuis le 29/08 : la photo est
     anglaise, la traduction se fait au rendu. */
  let html = '<div class="rank-row rank-row--head"><span>Rank</span><span>Site</span><span>Score</span></div>';
  sites.forEach(s => {
    const score = borne(s.score);
    const cls = score >= 70 ? 'good' : score >= 50 ? 'warn' : 'bad';
    html += '<div class="rank-row' + (s.rank === 1 ? ' rank-row--first' : '') + '">' +
      '<span class="rank-pos mono">' + Number(s.rank) + '</span>' +
      '<span class="rank-host">' + esc(s.host) + '</span>' +
      '<span class="rank-score mono ' + cls + '">' + score + '<small>/100</small></span>' +
      '</div>';
  });
  return html;
}

function eliteCardsHtml(sites) {
  return sites.map(s => '<article class="elite-card">' +
    '<span class="elite-rank mono">#' + Number(s.rank) + '</span>' +
    '<span class="elite-tag">Elite</span>' +
    '<h3 class="elite-host">' + esc(s.host) + '</h3>' +
    '<p class="elite-score mono"><b>' + borne(s.score) + '</b><span>/100</span></p>' +
    '</article>').join('');
}

/* Garde-fou anti-derive : on relit app.js et on verifie que les classes qu'on
   ecrit y existent encore. Un balisage qui aurait diverge produirait un saut
   visuel a l'hydratation, silencieux et penible a diagnostiquer. */
function verifierCoherence() {
  const app = fs.readFileSync(path.join(SITE, 'assets', 'app.js'), 'utf8');
  const attendus = ['rank-row--head', 'rank-row--first', 'rank-pos mono', 'rank-host',
    'rank-score mono', 'elite-card', 'elite-rank mono', 'elite-tag',
    'elite-host', 'elite-score mono'];
  const manquants = attendus.filter(c => !app.includes(c));
  if (manquants.length) {
    throw new Error('Le balisage de app.js a change, ce script est perime. Introuvables : ' + manquants.join(', '));
  }
  /* La note lettre a ete retiree du classement le 15/08, en meme temps que des
     rapports. Si elle revient dans app.js, ce script ecrirait un balisage muet. */
  const revenus = ['rank-grade', 'elite-grade'].filter(c => app.includes(c));
  if (revenus.length) {
    throw new Error('La note lettre est revenue dans app.js, ce script ne l ecrit plus : ' + revenus.join(', '));
  }
  const m = app.match(/var ELITE_MIN = (\d+)/);
  if (m && Number(m[1]) !== ELITE_MIN) {
    throw new Error('ELITE_MIN vaut ' + m[1] + ' dans app.js et ' + ELITE_MIN + ' ici.');
  }
}

const echapRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Ajoute ou retire l'attribut hidden d'un conteneur, sans jamais toucher a son
   contenu. Le titre du cercle Elite porte un h2 et un paragraphe rediges a la
   main : lui appliquer un remplacement de contenu les effacerait. */
function basculerHidden(html, id, visible) {
  const re = new RegExp('<(?:div|p|section|ul)[^>]*id="' + echapRe(id) + '"[^>]*>');
  const m = html.match(re);
  if (!m) throw new Error('conteneur #' + id + ' introuvable');
  let balise = m[0];
  const aHidden = /\shidden(?=[\s>])/.test(balise);
  if (visible && aHidden) balise = balise.replace(/\s+hidden(?=[\s>])/, '');
  else if (!visible && !aHidden) balise = balise.replace(/>$/, ' hidden>');
  return html.replace(re, balise);
}

/* Ecrit le contenu d'un conteneur.

   Deux passes possibles et c'est tout l'enjeu : a la premiere, le conteneur est
   vide et on injecte entre nos marqueurs ; aux suivantes, il contient des
   dizaines de <div> imbriques. Chercher son </div> fermant a la regex
   attraperait le premier venu, donc celui d'une ligne de classement, et
   couperait le fichier en deux. On remplace donc STRICTEMENT ce qui est entre
   les marqueurs des qu'ils existent. */
function poserContenu(html, id, contenu) {
  const ouvre = new RegExp('<(?:div|p|section|ul)[^>]*id="' + echapRe(id) + '"[^>]*>');
  if (!ouvre.test(html)) throw new Error('conteneur #' + id + ' introuvable');

  const deb = DEB(id), fin = FIN(id);
  const rendu = contenu ? deb + contenu + fin : '';
  const j = html.indexOf(deb);

  if (j !== -1) {
    const k = html.indexOf(fin, j);
    if (k === -1) throw new Error('marqueur de fin manquant dans #' + id);
    html = html.slice(0, j) + rendu + html.slice(k + fin.length);
  } else if (contenu) {
    /* Premier passage sur un conteneur qui porte deja un texte simple (compteur,
       date) : on le remplace au lieu d'ajouter a cote, sinon il apparaitrait deux fois. */
    const feuille = new RegExp('(<(div|p)[^>]*id="' + echapRe(id) + '"[^>]*>)[^<]*(</\\2>)');
    if (feuille.test(html)) html = html.replace(feuille, (m, a, t, b) => a + rendu + b);
    else html = html.replace(ouvre, m => m + rendu);
  }
  return basculerHidden(html, id, !!contenu);
}

/* Met a jour l'ItemList dans le graphe JSON-LD de la page, sans toucher au
   reste du graphe (CollectionPage et fil d'Ariane sont rediges a la main).
   Chaque entree porte le nom du site et son rang ; le score n'est PAS declare
   en "ratingValue" : ce n'est pas un avis, et un balisage d'avis auto-attribue
   est exactement le genre de chose que Google sanctionne. */
function majItemList(html, sites, updated) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
  const m = html.match(re);
  if (!m) throw new Error('aucun bloc JSON-LD dans la page du classement');
  const j = JSON.parse(m[1]);
  const g = j['@graph'] || [j];

  const liste = {
    '@type': 'ItemList',
    name: 'Websites audited by SEOPlus!, ranked by score',
    numberOfItems: sites.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: sites.map(s => ({
      '@type': 'ListItem',
      position: Number(s.rank),
      name: String(s.host),
      url: 'https://' + String(s.host)
    }))
  };
  if (updated) liste.dateModified = new Date(Number(updated)).toISOString().slice(0, 10);

  const i = g.findIndex(x => x['@type'] === 'ItemList');
  if (i > -1) g[i] = liste; else g.push(liste);

  const rendu = '<script type="application/ld+json">\n  ' +
    JSON.stringify(j, null, 2).split('\n').map((l, k) => k ? '  ' + l : l).join('\n') +
    '\n  </script>';
  return html.replace(re, rendu);
}

(async () => {
  verifierCoherence();

  const r = await fetch(URL_CLASSEMENT);
  const data = await r.json();
  if (!data || !data.sites || !data.sites.length) throw new Error('classement vide ou illisible, rien n a ete ecrit');

  /* Compteur d'analyses de la page d'accueil : le chiffre est ECRIT dans le
     HTML depuis le 16/08 (avant, un « 0 » cache attendait le webhook et les
     crawlers ne voyaient rien). Comme toute photo il vieillit : on le remet a
     jour ici, au meme rythme que le classement. Non bloquant si le webhook des
     stats ne repond pas. */
  /* Un balisage disparu est une derive a signaler (le workflow de nuit echoue) ;
     un webhook muet ne l'est pas. */
  const pIdx = path.join(SITE, 'index.html');
  const motifCompteur = /(id="stat-audits"><b>)\d+(<\/b>)/;
  if (!motifCompteur.test(fs.readFileSync(pIdx, 'utf8'))) throw new Error('compteur d analyses introuvable dans index.html (#stat-audits)');
  try {
    const rs = await fetch('https://n8n.romainben.cloud/webhook/seoplus-stats');
    const st = await rs.json();
    const audits = Number(st && st.audits) || 0;
    if (audits) {
      const hIdx = fs.readFileSync(pIdx, 'utf8');
      const neuf = hIdx.replace(motifCompteur, '$1' + audits + '$2');
      if (neuf === hIdx) console.log('compteur d analyses : deja a jour (' + audits + ')');
      else if (GO) { fs.writeFileSync(pIdx, neuf, 'utf8'); console.log('compteur d analyses : ' + audits); }
      else console.log('[simu] compteur d analyses : ' + audits);
    }
  } catch (e) { console.log('compteur d analyses : webhook stats muet, chiffre en place conserve'); }
  const sites = data.sites;
  console.log('classement lu : ' + sites.length + ' sites, mis a jour le ' + new Date(Number(data.updated) || Date.now()).toLocaleString('fr-FR'));

  const cibles = [
    { f: 'leaderboard.html', sites: sites, elite: '#rank-elite', head: '#rank-elite-head', table: '#rank-table', load: 'rank-loading', compteur: 'rank-count', date: 'rank-updated', itemList: true },
    { f: 'index.html', sites: sites.slice(0, TOP_HOME), elite: '#home-rank-elite', head: '#home-rank-elite-head', table: '#home-rank-table', load: 'home-rank-loading' }
  ];

  cibles.forEach(c => {
    const p = path.join(SITE, c.f);
    let h = fs.readFileSync(p, 'utf8');
    const avant = h;

    const elite = c.sites.filter(s => Number(s.score) >= ELITE_MIN);
    const reste = c.sites.filter(s => Number(s.score) < ELITE_MIN);

    h = poserContenu(h, c.elite.slice(1), elite.length ? eliteCardsHtml(elite) : '');
    h = poserContenu(h, c.table.slice(1), reste.length ? rankRowsHtml(reste) : '');

    /* Le nombre de sites et la date de mesure font partie du contenu de preuve :
       sans eux la page ne dit pas de quand elle parle. Memes formulations que
       app.js pour que l'hydratation ne reecrive pas un texte different. */
    /* Memes formulations et meme format de date que app.js en anglais (LOCALE en-GB). */
    const n = c.sites.length;
    const quand = data.updated ? new Date(Number(data.updated)) : null;
    if (c.compteur) h = poserContenu(h, c.compteur, n + (n > 1 ? ' websites ranked' : ' website ranked'));
    if (c.date && quand) h = poserContenu(h, c.date, 'Last update: ' + quand.toLocaleDateString('en-GB'));

    /* La traduction se fait par correspondance EXACTE du texte anglais
       (applyPageMap, dictionnaires i18n-{fr,es,de}-pages.js) : un texte qui
       embarque une date ou un compte change a chaque snapshot et sa cle meurt en
       silence, la ligne resterait en anglais dans la page traduite (panne
       signalee par RBE le 16/08). Les deux paires volatiles sont donc
       entretenues ICI, au moment ou le texte change. */
    if (c.compteur || (c.date && quand)) {
      const TRAD = {
        fr: { un: 'site classé', plus: 'sites classés', maj: 'Dernière mise à jour : ', loc: 'fr-FR' },
        es: { un: 'sitio clasificado', plus: 'sitios clasificados', maj: 'Última actualización: ', loc: 'es-ES' },
        de: { un: 'Website eingestuft', plus: 'Websites eingestuft', maj: 'Letzte Aktualisierung: ', loc: 'de-DE' }
      };
      Object.keys(TRAD).forEach(l => {
        const t = TRAD[l];
        const pI18n = path.join(SITE, 'assets', 'i18n-' + l + '-pages.js');
        let dict = fs.readFileSync(pI18n, 'utf8');
        const avantDict = dict;
        if (c.compteur) {
          dict = dict.replace(/"\d+ websites? ranked": "[^"]*"/,
            JSON.stringify(n + (n > 1 ? ' websites ranked' : ' website ranked')) + ': ' +
            JSON.stringify(n + ' ' + (n > 1 ? t.plus : t.un)));
        }
        if (c.date && quand) {
          dict = dict.replace(/"Last update: \d[^"]*": "[^"]*"/,
            JSON.stringify('Last update: ' + quand.toLocaleDateString('en-GB')) + ': ' +
            JSON.stringify(t.maj + quand.toLocaleDateString(t.loc)));
        }
        if (dict !== avantDict) {
          if (GO) fs.writeFileSync(pI18n, dict, 'utf8');
          console.log('  ' + (GO ? '' : '[simu] ') + 'i18n-' + l + '-pages.js : paires volatiles (compteur, date) realignees');
        }
      });
    }

    /* ItemList du classement. Il n'a de sens que depuis que la liste est
       reellement dans le HTML : un balisage qui decrit un contenu absent de la
       page est une infraction aux regles de Google, pas une optimisation.
       Il est genere ici et jamais ecrit en dur, les scores changeant a chaque
       audit. */
    if (c.itemList) {
      h = majItemList(h, c.sites, data.updated);
    }
    /* Le titre du cercle Elite porte un texte redige : on ne fait que le montrer
       ou le cacher selon qu il y a des cartes sous lui. */
    h = basculerHidden(h, c.head.slice(1), elite.length > 0);

    /* Le bloc de chargement n a plus lieu d etre : la donnee est deja la. Il
       reste dans le DOM mais masque, pour que le JS continue a le manipuler
       sans test supplementaire. */
    h = basculerHidden(h, c.load, false);

    if (h === avant) { console.log('  ' + c.f + ' : deja a jour'); return; }
    if (GO) fs.writeFileSync(p, h);
    console.log('  ' + (GO ? 'ecrit ' : '[simu] ') + c.f + ' : ' + elite.length + ' carte(s) Elite, ' + reste.length + ' ligne(s)');
  });

  console.log('\n' + (GO ? 'Snapshot pose.' : 'Simulation. Relancer avec --go pour ecrire.'));
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1); });
