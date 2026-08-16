# seoplus-site

Canal de livraison de **SEOPlus!**, servi sur
`https://www.optimizia.xyz/outils/seo-plus/`.

Ce dépôt ne contient pas le projet : il contient ce qui part en production.
Le projet, ses générateurs et ses notes vivent dans le vault Obsidian, sous
`OptimizIA.xyz/05 Projets/SEOPlus/`.

## Contenu

| Chemin | Rôle |
|---|---|
| `site/` | Le paquet servi, copie exacte de `09 Deploiement/_a-envoyer`. |
| `nginx.conf` | En-têtes de sécurité, compression, cache, page 404. |
| `Dockerfile` | Image nginx + le paquet. |

`site/` a deux étages, parce qu'un seul conteneur sert deux hôtes :

```
site/
├─ 98 redirections .html + robots.txt + sitemap.xml   <- seoplus.optimizia.xyz
└─ outils/seo-plus/   le site                          <- www.optimizia.xyz/outils/seo-plus/
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
