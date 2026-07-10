-- minddy — MIN-36 (suivi) : valeur CNAME recommandée par Vercel, par domaine.
-- Depuis l'expansion d'IP Vercel (2025), la cible CNAME recommandée est propre
-- à chaque domaine (ex. eabed98d78b4b3b2.vercel-dns-016.com) — l'ancienne
-- cname.vercel-dns.com marche toujours mais Vercel affiche « DNS Change
-- Recommended ». On la lit sur GET /v6/domains/{domain}/config (champ
-- recommendedCNAME, rank 1) et on la persiste ici pour que les instructions
-- DNS soient justes sans appel Vercel à chaque affichage. NULL → repli sur la
-- cible générique.
-- Idempotent — safe to re-run.

alter table public.custom_domains
  add column if not exists cname_target text;
