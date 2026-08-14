-- minddy — MIN-346 : une page qui bouge se voit tout de suite, dans l'autre fenêtre.
--
-- La table `pages` (MIN-266) n'a JAMAIS rien diffusé. Ses quatre satellites,
-- eux, l'ont fait au fil des lots : l'activité (20261203090000), les rétroliens
-- (20261204090000), les commentaires (20261207090000). Le résultat était un
-- angle mort exact : le fil d'une page arrivait en direct, mais la page elle-même
-- — sa création, son titre, son déplacement dans l'arbre, sa mise à la corbeille
-- — n'arrivait jamais.
--
-- Et rien d'autre ne rattrapait ce silence. L'arbre de la barre secondaire est
-- servi par un cache PERSISTÉ sur le disque, avec un `staleTime` de cinq minutes
-- et `refetchOnWindowFocus: false` (lib/query-provider.tsx) : une fenêtre ouverte
-- sur l'onglet Pages ne redemandait la liste ni au retour au premier plan, ni à
-- la navigation. Une page créée sur la web app n'existait donc pas pour l'app de
-- bureau — et réciproquement — jusqu'à un rechargement complet.
--
-- ── CE QUI EST DIFFUSÉ, ET CE QUI NE L'EST PAS ──────────────────────────────
--
-- Le corps est HORS de la charge utile. Trois colonnes le portent — `content`
-- (JSON ProseMirror, jusqu'à 1 Mo), `search_text` (sa projection en texte plat)
-- et `search_tsv` (le vecteur dérivé) —, et l'enregistrement automatique écrit
-- la page une fois par seconde de frappe (MIN-271). Diffuser la ligne entière,
-- ce serait pousser le document à tous les membres du projet à chaque seconde
-- où quelqu'un tape. `realtime.broadcast_changes` n'accepte que des records
-- entiers : d'où l'émission MANUELLE par `realtime.send`, comme
-- `broadcast_pull_request_row` (20260929090000), avec les trois colonnes
-- retranchées du jsonb.
--
-- Ce qui reste est exactement `LIST_COLUMNS` (lib/server/pages.ts) : ce que la
-- liste rend déjà, et donc ce que le cache `["pages", projectId]` sait lire.
--
-- L'UPDATE est FILTRÉ sur les colonnes VISIBLES, pour la même raison. Une frappe
-- dans le document ne bouge que `content`, `version`, `updated_at`, `updated_by`
-- — rien de ce que l'arbre affiche : elle ne doit réveiller personne. Ce qui
-- déclenche, c'est ce qui change l'arbre ou la corbeille.
--
-- Idempotent — safe à re-run.

create or replace function public.broadcast_page_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := null;
  old_rec jsonb := null;
begin
  -- Le corps et ses deux dérivées sortent de la charge utile. `-` sur un jsonb
  -- est sans effet si la clé n'existe pas : la fonction survit à une colonne
  -- qu'on renommerait ou retirerait un jour.
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new) - 'content' - 'search_text' - 'search_tsv';
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old) - 'content' - 'search_text' - 'search_tsv';
  end if;

  perform realtime.send(
    jsonb_build_object(
      'operation', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', rec,
      'old_record', old_rec
    ),
    tg_op,
    'project:' || coalesce(new.project_id, old.project_id),
    true
  );
  return null;
exception when others then
  -- Une diffusion ratée ne fait JAMAIS tomber l'écriture : le direct est le
  -- confort, écrire la page est le chemin normal.
  return null;
end;
$$;

-- INSERT : la page apparaît dans l'arbre de tous les membres. Y compris une page
-- neuve encore vide — elle est un BROUILLON tant qu'on n'y a rien écrit
-- (lib/pages-draft.ts), et la quitter sans rien taper la DÉTRUIT, ce qui émet le
-- DELETE ci-dessous et la retire de leur arbre. Un « Sans titre » qui passe est
-- le prix d'une page qui apparaît à la seconde où elle est créée ; l'inverse —
-- attendre le premier mot — laisserait la sous-page qu'un coéquipier vient
-- d'ouvrir invisible pendant tout le temps qu'il la rédige.
drop trigger if exists pages_broadcast_insert on public.pages;
create trigger pages_broadcast_insert
  after insert on public.pages
  for each row execute function public.broadcast_page_row();

-- UPDATE **FILTRÉ** : voir l'en-tête. Ces huit colonnes sont ce que l'arbre et
-- la corbeille montrent — titre, icône, place dans la fratrie, épinglage,
-- suppression — plus `parent_block_removed`, qui décide si le bloc sous-page se
-- réécrit dans le parent (MIN-272) et voyage dans la même liste.
drop trigger if exists pages_broadcast_update on public.pages;
create trigger pages_broadcast_update
  after update on public.pages
  for each row
  when (old.title is distinct from new.title
     or old.icon is distinct from new.icon
     or old.parent_id is distinct from new.parent_id
     or old.position is distinct from new.position
     or old.favorite is distinct from new.favorite
     or old.deleted_at is distinct from new.deleted_at
     or old.deleted_root_id is distinct from new.deleted_root_id
     or old.parent_block_removed is distinct from new.parent_block_removed)
  execute function public.broadcast_page_row();

-- DELETE : le brouillon abandonné (`?discard=1`) et la purge de la corbeille.
-- La mise à la corbeille, elle, est un UPDATE de `deleted_at` — déjà couverte.
drop trigger if exists pages_broadcast_delete on public.pages;
create trigger pages_broadcast_delete
  after delete on public.pages
  for each row execute function public.broadcast_page_row();
