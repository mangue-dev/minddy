-- minddy — l'avatar devient une marque générée, et rien d'autre.
--
-- Avant : une photo uploadée dans le bucket `avatars`, dont l'URL vivait dans
-- `user_metadata.avatar_url`, avec un repli en initiales. Après : chaque compte
-- porte un SEED opaque, et son avatar se dessine à partir de ce seed
-- (lib/avatar.ts). Plus de fichier, plus d'upload, plus d'initiales.
--
-- Le seed vit dans SA PROPRE table, pas dans le compte :
--   - ce n'est ni un réglage ni une donnée de profil — l'utilisateur ne le
--     choisit pas, il ne peut que le retirer au sort (POST /api/me/avatar) ;
--   - `user_metadata` est écrivable par le client, donc n'importe qui aurait pu
--     se poser le seed d'un autre et porter sa marque.

create table if not exists public.user_avatars (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Opaque et sans structure : seul son hash compte (boring-avatars).
  seed text not null default gen_random_uuid()::text,
  updated_at timestamptz not null default now()
);

-- RLS active et AUCUNE policy : la table n'est lisible que par la clé de
-- service, qui la contourne. Les seeds arrivent au navigateur par les routes
-- qui résolvent déjà les identités (membres d'un projet, board, partage) — donc
-- seulement pour les personnes que l'appelant a le droit de voir.
alter table public.user_avatars enable row level security;

-- Les comptes existants prennent leur seed maintenant, pour qu'aucun ne dépende
-- de la création paresseuse au premier affichage.
insert into public.user_avatars (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ── Retrait des photos de profil ────────────────────────────────────────────
-- Décision produit : il n'y a plus d'avatar personnalisé du tout. On retire donc
-- les fichiers, le bucket, ses policies, et les clés qui les référençaient
-- (`avatar_url` posée par l'app, `picture` posée par les fournisseurs OAuth) —
-- sinon `toNamed` continuerait de servir une URL morte.

-- Filtré avec `->>` plutôt qu'avec l'opérateur d'existence `?`, que certains
-- clients confondraient avec un paramètre de requête.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'avatar_url' - 'picture'
where raw_user_meta_data ->> 'avatar_url' is not null
   or raw_user_meta_data ->> 'picture' is not null;

drop policy if exists "avatars public read" on storage.objects;
drop policy if exists "avatars insert own" on storage.objects;
drop policy if exists "avatars update own" on storage.objects;
drop policy if exists "avatars delete own" on storage.objects;

-- Les FICHIERS et le BUCKET ne se suppriment pas ici : Supabase interdit
-- l'écriture directe dans `storage.objects` / `storage.buckets`
-- (« Direct deletion from storage tables is not allowed »), il faut passer par
-- l'API Storage. C'est le rôle de `scripts/drop-avatars-bucket.mjs`, à lancer
-- une fois après cette migration.
