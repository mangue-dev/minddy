-- minddy — MIN-275 : une PAGE du wiki comme ressource d'un ticket.
--
-- Troisième genre de ressource après le fichier et le lien (MIN-184). Ce n'est
-- pas un lien déguisé : écrire « /projects/…/pages/… » dans `url` donnerait une
-- ressource qui s'ouvre dans un onglet externe et qui survit à la purge de la
-- page. Une clé étrangère dit ce que c'est, et laisse la base tenir la
-- cohérence.
--
-- `on delete cascade`, et la corbeille ne s'en mêle pas : mettre une page à la
-- corbeille n'est qu'un `deleted_at` (MIN-266), donc la ressource RESTE — la
-- policy `pages_select` exclut les corbeillées, la jointure des routes rend
-- null, et la pilule se rend inerte le temps que la page revienne. Seule la
-- PURGE efface vraiment la ligne `pages`, et c'est là que la cascade emporte la
-- ressource avec elle. Aucune des quatre chaînes de ménage n'a rien à apprendre.
--
-- Le titre affiché est résolu à la lecture (jointure) ; `file_name` en garde une
-- photo, pour les surfaces sans jointure (export RGPD, amorce de l'agent).
-- Idempotent.

alter table public.attachments
  add column if not exists page_id uuid references public.pages(id) on delete cascade;

-- Les trois formes d'une ressource, exclusives les unes des autres.
alter table public.attachments drop constraint if exists attachments_kind_ck;
alter table public.attachments add constraint attachments_kind_ck check (
  case kind
    when 'file' then storage_path is not null and url is null and page_id is null
    when 'link' then url is not null and storage_path is null and page_id is null
    when 'page' then page_id is not null and storage_path is null and url is null
    else false
  end
);

-- La cascade de purge lit par là (et la sidebar d'une page, un jour, pour
-- savoir quels tickets la citent).
create index if not exists idx_attachments_page
  on public.attachments(page_id) where page_id is not null;

comment on column public.attachments.kind is
  'file = objet dans le bucket attachments ; link = URL externe (MIN-184) ; '
  'page = page du wiki du projet (MIN-275).';
comment on column public.attachments.page_id is
  'Page du projet référencée ; null hors ressource de genre page (MIN-275).';
