-- minddy — chantier « Ressources » (MIN-184)
-- Une ressource d'un ticket ou d'un objectif est SOIT un fichier (l'ancienne
-- pièce jointe, objet dans le bucket privé `attachments`), SOIT un lien. La
-- table garde son nom `attachments` — c'est la NOTION qui devient « ressource »
-- dans l'app, le MCP et les tools de Numo ; renommer la table voudrait dire
-- reprendre la RLS, le trigger de diffusion realtime, la contrainte à trois
-- parents, l'export RGPD, la corbeille et la rétention pour zéro gain visible.
--
-- Le favicon d'un lien vit DANS la ligne (`icon_data_url`, ~1-2 Ko en WebP
-- 32 px), pas dans le bucket : un second chemin d'objets obligerait les quatre
-- chaînes de ménage (route DELETE, corbeille, rétention, suppression de compte)
-- à le connaître. Idempotent.

alter table public.attachments
  add column if not exists kind          text not null default 'file',
  add column if not exists url           text,
  add column if not exists icon_data_url text;

-- Un lien n'a pas d'objet storage.
alter table public.attachments alter column storage_path drop not null;

-- Les deux formes d'une ressource, exclusives l'une de l'autre.
alter table public.attachments drop constraint if exists attachments_kind_ck;
alter table public.attachments add constraint attachments_kind_ck check (
  case kind
    when 'file' then storage_path is not null and url is null
    when 'link' then url is not null and storage_path is null
    else false
  end
);

comment on column public.attachments.kind is
  'file = objet dans le bucket attachments ; link = URL externe (MIN-184).';
comment on column public.attachments.url is
  'URL http(s) du lien ; null pour un fichier.';
comment on column public.attachments.icon_data_url is
  'Favicon du lien en data URI (image WebP 32 px, ~1-2 Ko) ; null si absent.';
