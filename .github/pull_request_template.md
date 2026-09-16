## Résumé

<!-- Qu'est-ce que cette pull request change, et pourquoi ? -->

## Type de changement

- [ ] Contenu ou pages du site
- [ ] Serveur nginx, en-têtes, redirections
- [ ] Dépendances (image nginx, GitHub Actions)
- [ ] Documentation
- [ ] CI ou outillage

## Checklist

- [ ] La CI `image` passe : l'image se construit, `nginx -t` est valide, les pages, redirections, en-têtes et compression sont vérifiés
- [ ] Aucun secret ni fichier de configuration local n'est commité
- [ ] Un bloc `location` qui pose un `add_header` répète les en-têtes de sécurité (piège nginx)
- [ ] Le merge sur `main` déploie en production via Coolify : le changement est prêt à partir tel quel
