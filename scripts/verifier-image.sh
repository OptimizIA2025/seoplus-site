#!/usr/bin/env bash
# Vérifie l'image construite par la CI (ou en local) : pages servies,
# redirections, en-têtes de sécurité et compression.
#
# Usage : docker build -t site . && docker run -d --name site -p 8080:80 site
#         bash scripts/verifier-image.sh
set -u

BASE="${BASE:-http://localhost:8080}"
erreurs=0

verifier() {
    local hote="$1" chemin="$2" attendu="$3"
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $hote" "$BASE$chemin")
    if [ "$code" = "$attendu" ]; then
        echo "OK   $attendu  $hote$chemin"
    else
        echo "ECHEC attendu $attendu, obtenu $code  $hote$chemin"
        erreurs=$((erreurs + 1))
    fi
}

verifier_entete() {
    local hote="$1" chemin="$2" entete="$3"
    if curl -s -o /dev/null -D - -H "Host: $hote" "$BASE$chemin" | grep -qi "^$entete:"; then
        echo "OK   en-tête $entete  $hote$chemin"
    else
        echo "ECHEC en-tête $entete absent  $hote$chemin"
        erreurs=$((erreurs + 1))
    fi
}

verifier_gzip() {
    local hote="$1" chemin="$2"
    if curl -s -o /dev/null -D - -H "Host: $hote" -H "Accept-Encoding: gzip" "$BASE$chemin" | grep -qi "^Content-Encoding: gzip"; then
        echo "OK   gzip  $hote$chemin"
    else
        echo "ECHEC pas de compression gzip  $hote$chemin"
        erreurs=$((erreurs + 1))
    fi
}

# Pages, fichiers et redirections
verifier "www.optimizia.xyz" "/tools/seoplus/" 200
verifier "www.optimizia.xyz" "/tools/seoplus/methodology.html" 200
verifier "www.optimizia.xyz" "/tools/seoplus/mentions-legales.html" 200
verifier "seoplus.optimizia.xyz" "/robots.txt" 200
verifier "www.optimizia.xyz" "/tools/seoplus/page-inexistante.html" 404
verifier "www.optimizia.xyz" "/tools/seoplus/autorite-confiance/combien-temps-seo/" 301

# En-têtes de sécurité
verifier_entete "www.optimizia.xyz" "/tools/seoplus/" "X-Content-Type-Options"
verifier_entete "www.optimizia.xyz" "/tools/seoplus/" "Content-Security-Policy"
verifier_entete "www.optimizia.xyz" "/tools/seoplus/" "Strict-Transport-Security"

# Compression
verifier_gzip "www.optimizia.xyz" "/tools/seoplus/"

if [ "$erreurs" -gt 0 ]; then
    echo "$erreurs vérification(s) en échec"
    exit 1
fi
echo "Image vérifiée : pages, redirections, en-têtes et compression."
