-- minddy — MIN-280 : les FICHIERS d'une page (images et pièces jointes).
--
-- Une table à part, et pas une ligne `attachments`. Deux raisons, et la seconde
-- est la vraie :
--
--  1. le CHECK `attachments_kind_ck` (MIN-275) rend les trois genres d'une
--     ressource exclusifs, et aucun n'admet un `page_id` porteur d'octets ;
--  2. surtout, un fichier posé DANS un corps n'est pas une « ressource » d'une
--     liste. Une ressource de ticket est citée à côté du texte et se retire à la
--     main ; un fichier de page est une PHRASE du document — le retirer du texte
--     doit le faire disparaître. Ce n'est pas la même durée de vie, donc pas la
--     même table.
--
-- La ligne est la vérité, et le corps ne porte qu'une URL d'indirection
-- (`/api/projects/{projet}/pages/files/{id}`, cf. lib/page-files.ts) : ni chemin
-- de bucket recopié dans mille documents, ni URL signée qui expire en dix
-- minutes.
--
-- ── Le storage ──────────────────────────────────────────────────────────────
--
-- MÊME bucket `attachments`, et même famille de chemins que les ressources de
-- projet : `projects/{projet}/pages/{page}/{fichier}/{nom}`. Un préfixe
-- `pages/…` à la racine aurait voulu dire une branche de plus dans la politique
-- d'insertion du storage ET une famille de plus dans la porte de lecture
-- (`/api/attachments/file`), pour la règle d'accès identique mot pour mot :
-- « membre du projet ». Il n'y a donc AUCUNE politique de storage à ajouter ici,
-- et c'est le signe que le rangement est le bon.
--
-- L'écriture, elle, ne passe pas par la politique d'insertion du storage :
-- l'envoi est SERVEUR (POST /api/projects/{id}/pages/{pageId}/files, clé de
-- service). C'est ce qui garantit qu'un objet du bucket ne peut pas exister sans
-- sa ligne — un envoi direct depuis le navigateur, lui, laisse un orphelin dès
-- que l'onglet se ferme avant l'enregistrement, ce que les ressources de ticket
-- assument et qu'un corps de page, relu par le ménage, n'a pas à assumer.
--
-- Idempotent — safe à re-run.

create table if not exists public.page_files (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.pages(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null default 'application/octet-stream',
  size_bytes   bigint not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- La lecture chaude : les fichiers d'une page (la purge, le ménage, l'export).
create index if not exists idx_page_files_page on public.page_files(page_id);
-- Et par projet : la purge d'un projet relève ses objets d'un seul coup.
create index if not exists idx_page_files_project on public.page_files(project_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Lecture = membre du projet, comme le corps de la page où le fichier est posé.
-- Aucune politique d'insertion, de mise à jour ni de suppression : les lignes
-- sont écrites et effacées par la clé de service uniquement (route d'envoi,
-- purge de la corbeille, balayage des orphelins).
alter table public.page_files enable row level security;

drop policy if exists page_files_select on public.page_files;
create policy page_files_select on public.page_files for select
  using (public.can_access_project(project_id));
