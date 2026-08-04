-- minddy — brouillons de création de projet.
--
-- Le wizard de création ne crée le projet qu'à la DERNIÈRE étape : tout ce qui
-- précède vivait en mémoire, et fermer la modale en route perdait la saisie.
-- Ce qui manquait n'était pas un « enregistrer » mais un objet : un brouillon,
-- qui tienne entre deux sessions et se montre dans la barre latérale à la place
-- du projet qu'il deviendra.
--
-- Une table à part, et NON un drapeau `projects.draft` : un projet à moitié
-- configuré aurait fuité partout où l'on liste des projets (palette, sélecteurs
-- de ticket, MCP, statistiques, facturation), chacun devant apprendre à
-- l'écarter. Ici l'invariant tient tout seul — un projet existe ou n'existe pas,
-- et le brouillon n'est vu que de la barre latérale et du wizard.
--
--   • `id`   = l'id du FUTUR projet, tiré côté client. C'est la graine de l'orbe
--              montrée dans le wizard et dans la barre latérale : elle doit
--              survivre à la reprise, sinon le brouillon change de couleur en
--              route et le projet créé n'a pas celle qu'on lui a vue.
--   • `step` = l'étape où l'on s'est arrêté, par son ID (pas son index) : le
--              parcours dépend des réponses (l'origine décide de l'amorce), donc
--              un index ne veut rien dire d'une reprise à l'autre.
--   • `data` = le reste de la saisie (clé, origine, amorce, icône, dépôt choisi,
--              interrupteurs). Du jsonb parce que c'est l'état d'un formulaire,
--              pas un modèle : il bouge à chaque étape ajoutée au wizard, et
--              aucune requête ne le filtre.
--
-- Le CSV d'import n'y figure pas : le fichier pèse jusqu'à 5 Mo et ne se
-- sérialise pas. La reprise le redemande, en le disant.
--
-- RLS : self-manage strict — chacun ne voit et n'écrit que ses brouillons. Pas
-- de notion de membre ici, un brouillon n'appartient à personne d'autre.
-- Idempotent — safe to re-run.

create table if not exists public.project_drafts (
  id         uuid primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  step       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La barre latérale les liste du plus récent au plus ancien, pour un seul
-- utilisateur : c'est l'unique lecture de cette table.
create index if not exists idx_project_drafts_user
  on public.project_drafts(user_id, updated_at desc);

alter table public.project_drafts enable row level security;

drop policy if exists project_drafts_select on public.project_drafts;
create policy project_drafts_select on public.project_drafts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists project_drafts_insert on public.project_drafts;
create policy project_drafts_insert on public.project_drafts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists project_drafts_update on public.project_drafts;
create policy project_drafts_update on public.project_drafts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists project_drafts_delete on public.project_drafts;
create policy project_drafts_delete on public.project_drafts
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists project_drafts_set_updated_at on public.project_drafts;
create trigger project_drafts_set_updated_at
  before update on public.project_drafts
  for each row execute function public.set_updated_at();
