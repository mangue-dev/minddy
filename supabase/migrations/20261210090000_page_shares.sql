-- minddy — MIN-283 « Publier une page en lecture, et l'exporter »
--
-- Une page publiée est une CIBLE DE PLUS pour le partage public existant
-- (MIN-26), pas une machinerie de plus : le token, le mot de passe scrypt, le
-- cookie de déverrouillage et la politique deny-all sont déjà là et déjà
-- testés. Une table `page_shares` parallèle aurait voulu dire une seconde
-- politique de sécurité à tenir, et c'est toujours celle qu'on ouvre le moins
-- souvent qui prend du retard.
--
-- D'où l'élargissement de `view_shares` : `view_id` devient nullable, `page_id`
-- apparaît, et un CHECK d'exclusivité fait dire à la base « une ligne, une
-- cible » — la forme retenue dans ce dépôt depuis `attachments_kind_ck`
-- (MIN-275).
--
-- Deux colonnes propres à la page :
--   • `include_children` : la branche part avec la page, ou ne part pas. C'est
--     un choix EXPLICITE à la publication — publier sans le dire toute une
--     branche du wiki serait une fuite, pas une feature.
--   • `allow_indexing` : `false` par défaut, comme les boards de retours.
--     Publier n'est pas référencer, et une spec client indexée par Google est
--     un incident, pas une contrariété.
--
-- RLS inchangée (deny-all, service client only) : le token et l'empreinte du
-- mot de passe ne doivent jamais transiter par le client anon.
-- Idempotent — sûr à rejouer.

alter table public.view_shares
  add column if not exists page_id uuid references public.pages(id) on delete cascade;

alter table public.view_shares
  add column if not exists include_children boolean not null default false;

alter table public.view_shares
  add column if not exists allow_indexing boolean not null default false;

-- `view_id` portait `not null unique` : la contrainte d'unicité reste (une
-- vue = un partage), la nullité tombe pour laisser passer une cible page.
alter table public.view_shares alter column view_id drop not null;

-- Une ligne, une cible — et exactement une.
alter table public.view_shares drop constraint if exists view_shares_target_ck;
alter table public.view_shares add constraint view_shares_target_ck check (
  (view_id is not null and page_id is null)
  or (view_id is null and page_id is not null)
);

-- Une page = un partage, comme une vue = un partage. Un index unique partiel
-- plutôt qu'une contrainte : `page_id` est null sur toutes les lignes de vue,
-- et un unique ordinaire les laisserait passer (null ≠ null) mais porterait
-- l'index pour rien.
create unique index if not exists view_shares_page_unique
  on public.view_shares(page_id) where page_id is not null;

comment on column public.view_shares.page_id is
  'Page du wiki publiée en lecture (MIN-283) ; null sur un partage de vue.';
comment on column public.view_shares.include_children is
  'La branche entière part avec la page (MIN-283) — choix explicite à la publication.';
comment on column public.view_shares.allow_indexing is
  'Autorise les moteurs à indexer la page publiée. false par défaut : publier '
  'n''est pas référencer (MIN-283).';
