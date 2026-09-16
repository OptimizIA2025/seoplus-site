# seoplus-site

[![CI](https://github.com/OptimizIA2025/seoplus-site/actions/workflows/ci.yml/badge.svg)](https://github.com/OptimizIA2025/seoplus-site/actions/workflows/ci.yml)
[![CodeQL](https://github.com/OptimizIA2025/seoplus-site/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/OptimizIA2025/seoplus-site/actions/workflows/github-code-scanning/codeql)
[![Site](https://img.shields.io/badge/site-SEOPlus-2ea44f)](https://www.optimizia.xyz/tools/seoplus/)

Canal de livraison de **SEOPlus!**, servi sur
`https://www.optimizia.xyz/tools/seoplus/`.

Ce dépôt ne contient pas le projet : il contient ce qui part en production.
Le projet, ses générateurs et ses notes vivent dans le vault Obsidian, sous
`OptimizIA.xyz/05 Projets/SEOPlus/`.

## Contenu

| Chemin | Rôle |
| --- | --- |
| `site/` | Le paquet servi, copie exacte de `09 Deploiement/_a-envoyer`. |
| `nginx.conf` | En-têtes de sécurité, compression, cache, page 404. |
| `Dockerfile` | Image nginx + le paquet. |

`site/` a deux étages, parce qu'un seul conteneur sert deux hôtes :

```text
site/
├─ 98 redirections .html + robots.txt + sitemap.xml   <- seoplus.optimizia.xyz
└─ tools/seoplus/   le site                          <- www.optimizia.xyz/tools/seoplus/
```

## Publier

Depuis le vault, dans `09 Deploiement` :

```powershell
.\(C) publier.ps1 -m "ce que tu as change"
```

Le script reconstruit le paquet depuis `07 Site`, le recopie ici à
l'identique, commit et pousse. Coolify reconstruit l'image et redéploie.

Ne pas éditer `site/` à la main : la prochaine publication l'écrase. La source
est `07 Site` dans le vault.

## Ce qui n'est pas dans ce dépôt

Le moteur d'audit. Il vit dans n8n (`n8n.romainben.cloud`), pas ici. Ce dépôt
ne contient que le front, qui est déjà public puisqu'il est servi à chaque
visiteur.

## Automatisation

- **CI** (`.github/workflows/ci.yml`) : à chaque push sur `main` et à chaque pull request, l'image est construite, `nginx -t` est exécuté, puis un conteneur est lancé et vérifié par `scripts/verifier-image.sh` (pages en 200, redirections, en-têtes de sécurité, compression). Le résultat est dans le résumé du job. Un second job vérifie les documents Markdown (markdownlint, lychee).
- **Dependabot** : montées de version de l'image nginx et des GitHub Actions, chaque semaine. Les mises à jour patch et mineures sont fusionnées automatiquement une fois la CI passée, ce qui déploie l'image mise à jour ; les majeures attendent une relecture.
- **Ruleset sur `main`** : pas de suppression ni de force push, pull request et vérifications requises pour tout le monde sauf les administrateurs, qui gardent le push direct (le mode de publication normal du site).
- **CodeQL**, **dependency review**, secret scanning avec protection au push. Voir [SECURITY.md](SECURITY.md) et [CONTRIBUTING.md](CONTRIBUTING.md).
