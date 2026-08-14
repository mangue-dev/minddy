-- MIN-342 — relais d'e-mail ouvert sur le board public.
--
-- `requestOtpAction` accepte l'adresse du destinataire d'un anonyme : le seul
-- frein était un compteur EN MÉMOIRE, qui repart à zéro à chaque déploiement et
-- ne voit qu'une instance sur N. On rend le compteur persistant en rangeant
-- l'origine de la demande avec le code qu'elle a produit.
--
-- Un HASH, pas l'IP : la table sert à compter, pas à identifier. Le sel est
-- global (SESSION_SECRET côté applicatif), donc la colonne seule ne permet pas
-- de retrouver une IP par force brute sur l'espace v4.
alter table public.feedback_otp_codes
  add column if not exists ip_hash text;

-- Le compteur lit « les demandes de cette origine depuis <date> » : c'est cet
-- index-là qui le rend gratuit.
create index if not exists feedback_otp_ip_hash
  on public.feedback_otp_codes (ip_hash, created_at desc);

-- Et le pendant par destinataire, toutes cibles confondues — le levier du
-- relais ouvert n'est pas un board, c'est une adresse arrosée via N boards.
create index if not exists feedback_otp_email_created
  on public.feedback_otp_codes (email, created_at desc);
