-- minddy — « Vues enregistrées » (palette de commandes)
--
-- Une vue enregistrée = un ÉCRAN, pas un filtre de board. On est quelque part
-- dans l'app, on ouvre ⌘K, on l'enregistre sous un nom, et on la retrouve dans
-- la palette depuis n'importe quel appareil. `href` porte la route ET sa query
-- (l'onglet, la vue de board, l'objectif ouvert, la conversation…) — tout ce
-- qui, dans l'app, se dit dans l'adresse.
--
-- À ne pas confondre avec `public.views` (chantier 5), qui est le jeu de
-- filtres/tri/affichage d'un kanban : celle-ci ne connaît que des adresses, et
-- elle est STRICTEMENT personnelle (pas de partage, pas de vue système).
--
-- Idempotent — safe to re-run.

create table if not exists public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  -- Adresse interne à l'app : commence par « / », jamais « // » (une adresse
  -- protocol-relative sortirait du site). La contrainte est le dernier rempart ;
  -- lib/saved-view-href.ts valide déjà côté serveur.
  href       text not null check (href like '/%' and href not like '//%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La seule lecture qui existe : « mes vues, la plus récente d'abord ».
create index if not exists idx_saved_views_user
  on public.saved_views(user_id, created_at desc);

-- Un nom = une vue, par compte. Réenregistrer sous un nom déjà pris met à jour
-- l'adresse (upsert côté serveur) plutôt que d'empiler deux lignes homonymes
-- qu'on ne saurait plus distinguer dans la palette. Index sur les COLONNES
-- telles quelles (et pas sur `lower(name)`) : c'est la cible d'un ON CONFLICT
-- passé par PostgREST, qui ne sait nommer que des colonnes.
create unique index if not exists idx_saved_views_user_name
  on public.saved_views(user_id, name);

alter table public.saved_views enable row level security;

-- Strictement personnel : personne d'autre ne voit ni ne touche.
drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views for select
  using (user_id = auth.uid());

drop policy if exists saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views for insert
  with check (user_id = auth.uid());

drop policy if exists saved_views_update on public.saved_views;
create policy saved_views_update on public.saved_views for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists saved_views_delete on public.saved_views;
create policy saved_views_delete on public.saved_views for delete
  using (user_id = auth.uid());

drop trigger if exists saved_views_set_updated_at on public.saved_views;
create trigger saved_views_set_updated_at
  before update on public.saved_views
  for each row execute function public.set_updated_at();
