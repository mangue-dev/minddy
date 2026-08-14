-- minddy — MIN-344 : une clé BYOK ne lève un plafond qu'une fois VALIDÉE
--
-- Déclarer une clé suffisait à passer en usage illimité : `checkAgentQuota`
-- ne regardait que l'EXISTENCE d'une ligne `user_ai_keys`. Une chaîne bidon
-- levait donc le budget mensuel — et avec lui le seul frein au compute de la
-- microVM, que minddy paye quoi qu'il arrive.
--
-- La colonne porte l'instant où le fournisseur a reconnu la clé (probe
-- authentifié, cf. lib/server/agent/byok-validate.ts). `null` = jamais
-- confirmée : la ligne existe, elle ne lève rien.
--
-- Les lignes DÉJÀ en base restent à `null` à dessein : on ne peut pas certifier
-- après coup une clé qu'on n'a jamais présentée au fournisseur. Elles sont
-- validées paresseusement au premier usage (`getUserByok`), qui pose la date
-- lui-même quand la clé répond. Idempotent — safe to re-run.

alter table public.user_ai_keys
  add column if not exists validated_at timestamptz;

comment on column public.user_ai_keys.validated_at is
  'Instant où le fournisseur a reconnu la clé (MIN-344). null = non validée : la clé ne lève aucun plafond.';

-- Lisible par le propriétaire, comme le reste de la ligne (la liste de colonnes
-- de 20260926090000 est explicite : une colonne neuve n'y entre pas toute seule,
-- et l'écran des réglages doit pouvoir dire « clé confirmée »).
grant select (validated_at) on public.user_ai_keys to authenticated;
