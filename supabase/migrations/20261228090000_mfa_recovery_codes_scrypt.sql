-- MIN-347 — les codes de récupération 2FA n'étaient qu'un sha256 nu.
--
-- La migration d'origine (MIN-132) l'assumait : « les codes tirent ~50 bits
-- d'entropie, donc sha256 nu suffit ». Le compte était optimiste — deux groupes
-- de quatre caractères en base32 font 40 bits — et l'argument ne tenait de toute
-- façon pas : une empreinte sha256 non salée se balaie hors ligne à plusieurs
-- milliards d'essais par seconde, et sans sel les dix codes d'un compte tombent
-- dans le MÊME balayage. Or ce sont les codes qui CONTOURNENT le second facteur.
--
-- Désormais : 60 bits par code, et scrypt salé par code
-- (`scrypt$<N>$<sel>$<empreinte>`, cf. lib/server/mfa.ts).
--
-- Un rehash ne rattrape pas l'entropie manquante : les anciennes lignes ne sont
-- pas converties, elles sont EFFACÉES. Personne ne se retrouve enfermé dehors —
-- un code n'est pas un moyen de connexion, c'est la sortie de secours du second
-- facteur, et le facteur lui-même (TOTP) reste intact. Les réglages du compte
-- affichent alors « 0 code restant » et proposent d'en refrapper une série.
--
-- Au moment d'écrire cette migration, la table est vide en production : rien
-- n'est effacé, et aucun compte n'est à prévenir.
--
-- Idempotent — safe to re-run.

delete from public.mfa_recovery_codes
  where code_hash not like 'scrypt$%';

comment on table public.mfa_recovery_codes is
  'Codes de récupération 2FA (MIN-132, durcis en MIN-347). Empreinte scrypt salée par code : scrypt$<N>$<sel hex>$<empreinte hex>. Service role only (RLS sans policy). Un code consommé désactive la 2FA du compte.';
