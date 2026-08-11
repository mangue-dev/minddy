-- minddy — MIN-277 : QUI a écrit une page, et comment revenir en arrière.
--
-- Deux choses, et elles ne se séparent pas : l'AUTEUR de la dernière écriture
-- (`pages.updated_by`, `pages.updated_kind`) et l'HISTORIQUE des états
-- précédents (`page_versions`).
--
-- Pourquoi la nature du geste est une COLONNE, et pas une déduction : six outils
-- d'écriture sont ouverts à Numo, au MCP et à l'agent de code, et tous écrivent
-- sous l'id d'un compte humain (celui qui tient la clé, ou le propriétaire du
-- projet). Sans `updated_kind`, une page réécrite par l'agent s'afficherait
-- « modifiée par Clément » — exactement l'inverse de la règle d'identité de
-- minddy : geste humain = nom de l'humain, geste automatisé = nom de minddy.
--
-- Ce que `page_versions` stocke : un SNAPSHOT du document entier (`content`
-- jsonb), jamais un diff. Un doc ProseMirror est un arbre — un diff y est un
-- objet compliqué à produire, à stocker et à rejouer, là où un snapshot est la
-- colonne qu'on a déjà. La v1 avait tranché contre le CRDT pour la même raison.
--
-- Et il stocke l'état d'AVANT chaque écriture, pas d'après. C'est ce qui fait
-- que l'historique protège dès la première écriture qui suit cette migration :
-- l'état courant vit dans `pages` (avec son auteur), et la table ne porte que ce
-- que les écritures ont recouvert. Snapshoter l'état d'après aurait laissé
-- perdre, sans recours, le seul état qui compte le jour de l'incident — celui
-- que l'agent vient d'écraser.
--
-- La rétention est celle de la corbeille : 30 jours (lib/server/retention.ts).
-- Un second délai serait une seconde chose à retenir, pour rien.
--
-- Idempotent — safe à re-run.

alter table public.pages
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- 'human' par défaut, y compris sur les lignes existantes : avant MIN-273 il n'y
-- avait pas d'autre chemin, et une page dont on ne sait rien n'a pas à porter le
-- soupçon d'avoir été écrite par une machine.
alter table public.pages
  add column if not exists updated_kind text not null default 'human';

do $$
begin
  alter table public.pages
    add constraint pages_updated_kind_ck check (updated_kind in ('human', 'agent'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.page_versions (
  id          uuid primary key default gen_random_uuid(),
  -- `cascade` : une page purgée pour de bon emporte ses versions. C'est le seul
  -- endroit où l'historique disparaît vraiment, et il doit disparaître — sinon
  -- la purge de la corbeille laisserait derrière elle le corps entier des pages
  -- qu'elle prétend détruire.
  page_id     uuid not null references public.pages(id) on delete cascade,
  -- Redondant avec `pages.project_id`, et c'est voulu : la policy de lecture
  -- s'écrit alors sans jointure, comme celle des pages.
  project_id  uuid not null references public.projects(id) on delete cascade,
  -- La `version` de `pages` que cet état PORTAIT (le compteur d'écritures du
  -- corps, MIN-271). Elle donne son numéro à la ligne dans l'historique.
  version     integer not null,
  title       text not null default '',
  icon        text,
  content     jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  -- L'auteur de cet ÉTAT — pas celui de l'écriture qui l'a recouvert.
  author_id   uuid references auth.users(id) on delete set null,
  author_kind text not null default 'human'
    check (author_kind in ('human', 'agent')),
  created_at  timestamptz not null default now()
);

-- L'unique lecture : l'historique d'une page, du plus récent au plus ancien.
create index if not exists idx_page_versions_page
  on public.page_versions(page_id, version desc);

-- La purge de rétention balaie par date, toutes pages confondues.
create index if not exists idx_page_versions_created
  on public.page_versions(created_at);

alter table public.page_versions enable row level security;

-- Lecture seule au client de session, et calquée sur `pages_select` À UNE
-- DIFFÉRENCE PRÈS : elle n'exclut PAS les pages corbeillées. C'est justement là
-- qu'on va chercher — restaurer une page puis remonter à sa version d'avant est
-- le geste d'après un incident, pas un cas tordu.
--
-- Aucune policy d'écriture, volontairement : les versions sont posées par le
-- noyau serveur au client service (lib/server/pages.ts), qui refait le contrôle
-- d'accès. Une ligne d'historique que le client pourrait écrire ou effacer ne
-- serait plus un filet.
drop policy if exists page_versions_select on public.page_versions;
create policy page_versions_select on public.page_versions for select to authenticated
  using (public.can_access_project(project_id));
