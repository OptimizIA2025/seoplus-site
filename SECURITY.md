# Politique de sécurité

## Versions maintenues

Seule la branche `main` est maintenue : c'est l'image déployée en production par Coolify.

| Composant | Chemin | Maintenu |
| --- | --- | --- |
| Site servi | `site/` | Oui |
| Serveur nginx | `Dockerfile`, `nginx.conf`, `redirections-301.conf` | Oui |
| Vérification de l'image | `scripts/verifier-image.sh` | Oui |
| Workflows GitHub Actions et configuration Dependabot | `.github/` | Oui |

## Signaler une vulnérabilité

Si vous découvrez une faille de sécurité, ne la divulguez pas dans une issue publique.

Signalez-la en privé via le signalement de vulnérabilité de GitHub : [signaler une vulnérabilité](https://github.com/OptimizIA2025/seoplus-site/security/advisories/new), ou par email à [romainben31@gmail.com](mailto:romainben31@gmail.com), en indiquant :

* une courte description de la vulnérabilité ;
* l'URL ou le fichier concerné ;
* les étapes pour la reproduire ;
* les captures, en-têtes de réponse ou extraits utiles.

## Périmètre

Cette politique couvre le paquet de SEOPlus! servi sur `www.optimizia.xyz/tools/seoplus/` (et les redirections de l'ancien hôte `seoplus.optimizia.xyz`) : les pages et scripts servis au visiteur, la configuration nginx (en-têtes de sécurité, redirections, cache, compression) et les workflows du dépôt.

Le site est statique : aucun code côté serveur, aucun cookie posé par nginx. Les en-têtes de sécurité (Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) sont versionnés dans la configuration nginx et vérifiés par la CI sur chaque image construite.

## Mesures en place

* **CI sur chaque pull request et chaque push sur `main`** : l'image est construite, `nginx -t` est exécuté, puis un conteneur est lancé et vérifié (pages en 200, redirections, en-têtes de sécurité, compression). Rien ne se déploie sans ce feu vert.
* **CodeQL** : analyse du JavaScript et des workflows GitHub Actions.
* **Dependabot** : montées de version de l'image nginx et des GitHub Actions, fusionnées automatiquement (patch et mineures) une fois la CI passée, plus les mises à jour de sécurité.
* **Dependency review** : bloque une pull request qui introduit une dépendance vulnérable.
* **Secret scanning** avec protection au push.
* **Moindre privilège** : les workflows n'ont qu'un accès en lecture au dépôt, sauf celui d'auto-merge de Dependabot, qui doit écrire sur les pull requests.

## Réponse

Les signalements sont examinés dès que possible. Selon la gravité, la correction est poussée directement sur `main` (déploiement immédiat) ou passe par une pull request.
