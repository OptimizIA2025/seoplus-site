// SEOPlus! - Configuration environnement
window.SEOPLUS_CONFIG = {
  STRIPE_LINK_COMPLET: "",     // Payment Link Stripe - Audit Complet 9,90 EUR (seam paiement, pas encore branche)
  ROAST_WEBHOOK_URL: "https://n8n.romainben.cloud/webhook/seoplus-bilan",  // Bilan gratuit. L'ancien chemin seoplus-roast reste actif en alias. Vide = mode demo (mock local)
  CLASSEMENT_URL: "https://n8n.romainben.cloud/webhook/seoplus-classement",             // GET top 20 opt-in
  CLASSEMENT_OPTIN_URL: "https://n8n.romainben.cloud/webhook/seoplus-classement-optin", // POST {url} apres roast si case cochee
  STATS_URL: "https://n8n.romainben.cloud/webhook/seoplus-stats",                       // GET compteur public d'audits
  PSI_URL: "https://n8n.romainben.cloud/webhook/seoplus-psi",                           // GET Core Web Vitals reels (PageSpeed), rapport payant
  BENCH_VERDICT_URL: "https://n8n.romainben.cloud/webhook/seoplus-bench-verdict",       // POST {you, them} -> verdict IA ecrit sur la comparaison concurrent
  RAPPORT_IA_URL: "https://n8n.romainben.cloud/webhook/seoplus-rapport-ia",             // GET ?url= -> rapport complet en Markdown, a confier a une IA
  NEWSLETTER_URL: "https://n8n.romainben.cloud/webhook/seoplus-newsletter",             // POST {email, source} -> inscription tips SEO hebdo
  SUPABASE_URL: "https://pudsotzpdmwrlgoevxqg.supabase.co",                             // Auth (Google + magic link) + table leads. Vide = pas de gate
  SUPABASE_ANON_KEY: "sb_publishable_77u6_AknjdFdCYUTUL9ikQ_fbwk3UTg"                   // Cle publishable (publique par design, RLS cote serveur)
};
