-- minddy — MIN-279 : une page sait enfin QUI la cite.
--
-- Le lien ne marchait que dans un sens. Un ticket cite une page — la ressource
-- de genre `page` de MIN-275 est une vraie clé étrangère, et son index
-- `idx_attachments_page` avait été posé en disant tout haut à quoi il servirait
-- « un jour ». Mais une MENTION, elle, n'est interrogeable par rien : le
-- contrat des mentions de minddy est que ce qui est stocké est du TEXTE
-- (« @Titre »), re-scanné à la relecture, jamais un nœud persisté. Il n'y a donc
-- aucune ligne à lire pour savoir qui cite quoi.
--
-- D'où cette table DÉRIVÉE, exactement au même titre que `pages.search_text`
-- (MIN-276) : elle n'est la vérité de rien — la vérité reste le texte de la
-- source —, elle en est la projection interrogeable, réécrite à chaque écriture
-- de cette source par `lib/server/page-links.ts`.
--
-- ── Ce qui est réécrit, et comment ───────────────────────────────────────────
--
-- EN ENTIER, pour une source donnée : `delete` de ses lignes, puis `insert` de
-- celles que le texte porte encore. Un diff incrémental de mentions est un piège
-- classique — il laisse des liens fantômes dès qu'une écriture échoue à
-- mi-chemin, et un rétrolien fantôme ne se voit jamais depuis la source qui l'a
-- créé. C'est `(source_kind, source_id)` que cette réécriture attaque, d'où son
-- index : la clé primaire commence par `page_id` et ne la sert pas.
--
-- ── Ce que la table ne fait PAS ──────────────────────────────────────────────
--
-- `source_id` ne porte pas de clé étrangère : la source est polymorphe (ticket,
-- objectif, page), et trois colonnes nullables plus un CHECK
-- « exactement-un-parent » ne rendraient rien de plus qu'un `source_kind` déjà
-- contraint. La contrepartie est assumée : une source PURGÉE laisse sa ligne
-- derrière elle. La lecture (`/backlinks`) résout chaque source en titre et
-- laisse tomber celles qui ne résolvent plus — un rétrolien vers un ticket
-- effacé ne s'affiche donc pas, il coûte juste une ligne morte que la prochaine
-- écriture de cette source n'aura même pas à nettoyer.
--
-- La CIBLE, elle, cascade : purger une page emporte ses rétroliens, comme elle
-- emporte ses versions et ses ressources. La corbeille ne s'en mêle pas (elle
-- n'est qu'un `deleted_at`) : une page corbeillée garde ses citations, et elle
-- reste citée — inerte le temps qu'elle revienne, comme la pilule de ressource
-- le fait déjà depuis MIN-275.
--
-- Idempotent — safe à re-run.

create table if not exists public.page_links (
  -- La page CITÉE. `cascade` : une page purgée pour de bon n'est plus citée par
  -- personne.
  page_id     uuid not null references public.pages(id) on delete cascade,
  -- QUI cite. Le troisième genre, 'page', est ce qui fait du wiki un réseau
  -- plutôt qu'un dossier de fichiers.
  source_kind text not null check (source_kind in ('issue', 'objective', 'page')),
  source_id   uuid not null,
  -- Celui de la CIBLE. Redondant avec `pages.project_id`, et voulu : la policy
  -- de lecture s'écrit alors sans jointure, comme celle des versions.
  project_id  uuid not null references public.projects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Une source ne cite une page qu'une fois : dix « @Spec » dans un même ticket
  -- sont un seul rétrolien. C'est la clé primaire qui le dit, pas l'appelant.
  primary key (page_id, source_kind, source_id)
);

-- La lecture d'un rétrolien attaque `page_id` : le préfixe de la clé primaire
-- la sert déjà, il n'y a pas d'index de plus à poser de ce côté.
--
-- La RÉÉCRITURE, elle, attaque la source, que la clé primaire ne préfixe pas —
-- et c'est le chemin le plus fréquent des deux (une frappe dans une description,
-- une sauvegarde d'éditeur), là où la lecture n'arrive qu'à l'ouverture d'une
-- page.
create index if not exists idx_page_links_source
  on public.page_links(source_kind, source_id);

alter table public.page_links enable row level security;

-- Lecture seule au client de session, sur le projet de la CIBLE. Elle n'exclut
-- pas les pages corbeillées, comme `page_versions_select` : « qui citait cette
-- page ? » est justement une question qu'on se pose après l'avoir jetée.
--
-- Aucune policy d'écriture, volontairement : la table est dérivée, et elle est
-- écrite par le seul chemin serveur (lib/server/page-links.ts), au client
-- service. Un client qui pourrait y écrire pourrait faire dire à une page
-- n'importe quoi sur qui la cite.
drop policy if exists page_links_select on public.page_links;
create policy page_links_select on public.page_links for select to authenticated
  using (public.can_access_project(project_id));

-- Temps réel : la table porte `project_id`, donc le diffuseur générique suffit
-- (20260713090000). C'est lui qui fait qu'un ticket qui vient de citer la page
-- apparaît en « Cité par » sans rechargement, chez celui qui la lit.
drop trigger if exists page_links_broadcast on public.page_links;
create trigger page_links_broadcast
  after insert or update or delete on public.page_links
  for each row execute function public.broadcast_project_scoped();
