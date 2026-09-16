# SEOPlus! - image de service statique.
#
# Pourquoi un Dockerfile plutot que l'image nginx nue avec un volume :
# la configuration du serveur (en-tetes de securite, compression) a ete tapee
# A LA MAIN dans le conteneur le 04/08/2026, depuis un shell root ouvert par
# Coolify. Elle n'etait versionnee nulle part. C'est la raison de
# l'avertissement "ne redemarre pas ce conteneur" present dans toutes les
# notes du projet : une recreation la perdait en silence.
#
# Ici, elle est dans le depot. Le conteneur redevient jetable.

FROM nginx:1.31-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
# Vraies 301 de l'ancien hote seoplus.optimizia.xyz, generees depuis
# carte-urls.json par "(C) generer-bloc-301-nginx.js" (via publier.ps1).
COPY redirections-301.conf /etc/nginx/conf.d/redirections-301.conf
COPY site/ /usr/share/nginx/html/

EXPOSE 80
