-- minddy — MIN-276 : chercher dans le CONTENU des pages, pas seulement le titre.
--
-- L'index posé par 20261126090000 portait sur `to_tsvector('simple', title)` —
-- le titre seul —, et personne ne le lisait. Un wiki qu'on ne fouille pas
-- redevient un dossier de fichiers vers la trentième page.
--
-- Le corps est du JSON ProseMirror. Postgres sait en extraire du texte
-- (`jsonb_path_query`), mais pas le TEXTE D'UNE PAGE : il ramasserait les urls,
-- les langages de coloration, les ids de bloc, et perdrait l'ordre de lecture
-- des nœuds imbriqués. D'où une colonne DÉRIVÉE, `search_text` : la projection
-- markdown du corps, exactement celle que lisent les agents
-- (lib/server/pages-projection.ts), calculée en TypeScript et écrite par le seul
-- chemin d'écriture serveur (lib/server/pages.ts).
--
-- Elle sert deux surfaces d'un coup, et c'est ce qui la justifie plutôt qu'un
-- simple `tsvector` : l'index POUR Postgres, et l'EXTRAIT que la recherche rend
-- à l'humain comme à l'agent (`ts_headline` ne peut travailler que sur du
-- texte).
--
-- `search_tsv` est GÉNÉRÉE : elle ne peut pas se désynchroniser de `search_text`
-- ni du titre, quoi qu'écrive l'appelant. Le titre y pèse 'A' et le corps 'B' —
-- une page trouvée par son titre passe devant une page qui cite le mot en
-- passant. Configuration `simple`, comme l'index qu'elle remplace et pour la
-- même raison : le corpus est bilingue FR/EN dans un même projet, et choisir
-- 'french' ou 'english' désavantagerait l'autre moitié.
--
-- Ce que la migration NE fait pas : remplir `search_text` des pages existantes.
-- La projection demande un DOM (jsdom) — il n'y a pas de tiptap en SQL. C'est
-- un script Node de rattrapage, passé une fois puis supprimé.
--
-- Idempotent — safe à re-run.

alter table public.pages
  add column if not exists search_text text not null default '';

alter table public.pages
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(search_text, '')), 'B')
  ) stored;

-- Partiel : une page corbeillée ne se cherche pas (la corbeille se parcourt,
-- elle ne se fouille pas), et l'index ne porte donc que les lignes vivantes.
create index if not exists idx_pages_search
  on public.pages using gin (search_tsv)
  where deleted_at is null;

-- Remplacé par le précédent, qui contient le titre en poids 'A'.
drop index if exists public.idx_pages_title_search;

/*
 * La recherche elle-même, côté base.
 *
 * En fonction et non en `select` de PostgREST parce que les deux choses qui
 * font la qualité du résultat n'ont pas de traduction dans son langage de
 * requête : `ts_rank_cd` pour l'ordre, et `ts_headline` pour l'extrait — la
 * phrase qui dit à l'utilisateur POURQUOI cette page sort.
 *
 * SECURITY INVOKER (le défaut), volontairement : appelée au client de session
 * elle est filtrée par `pages_select` (donc par `can_access_project`), ce qui
 * donne la recherche cross-projet sans jamais énumérer les projets côté
 * serveur. Appelée au client service (le MCP, Numo), la RLS ne s'applique pas —
 * et c'est `p_project_id` plus le contrôle d'accès de lib/server/pages.ts qui
 * bornent la lecture, comme pour les six autres gestes.
 *
 * `websearch_to_tsquery` et non `plainto_tsquery` : les guillemets et le `-`
 * que les gens tapent déjà dans une barre de recherche y ont un sens, et une
 * requête bancale y rend une requête vide plutôt qu'une erreur.
 */
create or replace function public.search_pages(
  p_query text,
  p_project_id uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  project_id uuid,
  parent_id uuid,
  title text,
  icon text,
  updated_at timestamptz,
  excerpt text,
  rank real
)
language sql
stable
as $$
  with q as (select websearch_to_tsquery('simple', coalesce(p_query, '')) as tsq)
  select
    p.id,
    p.project_id,
    p.parent_id,
    p.title,
    p.icon,
    p.updated_at,
    -- Sans balise de surlignage : l'extrait est lu dans une ligne de palette et
    -- dans un résultat d'outil, deux surfaces qui ne rendent pas de HTML.
    ts_headline(
      'simple',
      p.search_text,
      q.tsq,
      'StartSel="", StopSel="", MaxWords=22, MinWords=8, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "'
    ) as excerpt,
    ts_rank_cd(p.search_tsv, q.tsq) as rank
  from public.pages p, q
  where p.deleted_at is null
    and (p_project_id is null or p.project_id = p_project_id)
    and p.search_tsv @@ q.tsq
  order by rank desc, p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- Sans ce grant, l'appel au client de session lèverait — et c'est justement le
-- chemin de la recherche cross-projet (cf. 20260704120000, même piège sur
-- `can_access_project`).
grant execute on function public.search_pages(text, uuid, int) to authenticated;
grant execute on function public.search_pages(text, uuid, int) to service_role;
