-- minddy — MIN-54 : classification IA des feedbacks (catégorisation + revue avant
-- publication + modération anti-fuite/junk).
--
-- On introduit un état de PUBLICATION `review_state`, distinct du choix de
-- visibilité `is_public` (celui-là reste le choix de l'auteur : public vs privé
-- équipe). Un post que l'auteur veut public n'apparaît sur le board qu'une fois
-- vérifié par la passe IA (catégorisé, jugé non-sensible, non-junk) :
--   board visible ⇔ is_public = true AND review_state = 'published'
--                     AND merged_into_id is null.
-- Sensible détecté → is_public forcé à false (jamais publié). Junk → 'rejected'.
--
-- La passe de classification est DÉCOUPLÉE de la passe de merge (MIN-37) : gate,
-- lease et compteur d'échecs propres, sur le même cron horaire. Deny-all RLS
-- inchangé : service-role uniquement.
-- Idempotent — safe to re-run.

-- ── Colonnes d'état & de bookkeeping ─────────────────────────────────────────
alter table public.feedback_posts
  add column if not exists review_state text not null default 'pending'
    check (review_state in ('pending', 'published', 'rejected')),
  add column if not exists classified_at timestamptz,
  add column if not exists classification_claimed_at timestamptz,
  add column if not exists classification_failures integer not null default 0,
  -- null = non sensible ; sinon nature détectée (security | severe_bug |
  -- personal_data | legal | other). Validé applicativement.
  add column if not exists sensitivity text,
  -- Motif court, visible équipe (raison du passage en privé OU du rejet junk).
  add column if not exists moderation_reason text;

-- ── Backfill : les posts existants sont déjà live → publiés et marqués classés
--    (ils ne doivent ni disparaître du board ni être reclassés par la passe). ──
update public.feedback_posts
   set review_state = 'published',
       classified_at = now()
 where classified_at is null;

-- ── Index de scan de la passe de classification ──────────────────────────────
create index if not exists feedback_posts_to_classify
  on public.feedback_posts (project_id)
  where classified_at is null and merged_into_id is null;

-- ── Board public : ne lister/suggérer que les posts publiés ──────────────────
-- Remplace l'index de liste publique par sa version incluant review_state.
drop index if exists public.feedback_posts_public_list;
create index if not exists feedback_posts_public_list
  on public.feedback_posts (project_id, status)
  where is_public and review_state = 'published' and merged_into_id is null;

-- Les suggestions « existe peut-être déjà » côté visiteur (p_public_only) ne
-- doivent remonter que des posts publiés — un post en attente de revue n'existe
-- pas encore publiquement. Signature inchangée → create or replace suffit.
create or replace function public.match_feedback_posts(
  p_project_id  uuid,
  p_embedding   extensions.vector(1536),
  p_exclude     uuid default null,
  p_limit       integer default 8,
  p_public_only boolean default false
)
returns table (id uuid, title text, body text, status text, vote_count integer, issue_id uuid, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.title, p.body, p.status, p.vote_count, p.issue_id,
         (1 - (p.embedding <=> p_embedding))::real as similarity
    from public.feedback_posts p
   where p.project_id = p_project_id
     and p.embedding is not null
     and p.merged_into_id is null
     and (not p_public_only or (p.is_public and p.review_state = 'published'))
     and (p_exclude is null or p.id <> p_exclude)
   order by p.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) to service_role;

-- ── Claim pour la passe de classification (miroir de _for_analysis :
--    skip locked + lease 15 min auto-guérissant, abandon après 3 échecs) ──────
create or replace function public.claim_feedback_posts_for_classification(p_limit integer)
returns setof public.feedback_posts
language sql security definer set search_path = public, extensions as $$
  update public.feedback_posts p
     set classification_claimed_at = now()
   where p.id in (
     select id from public.feedback_posts
      where classified_at is null
        and merged_into_id is null
        and classification_failures < 3
        and (classification_claimed_at is null or classification_claimed_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning p.*;
$$;

revoke all on function public.claim_feedback_posts_for_classification(integer) from public, anon, authenticated;
grant execute on function public.claim_feedback_posts_for_classification(integer) to service_role;

-- ── Config IA (surchargeable en base, pattern feedback_analysis_model) ───────
insert into public.app_config (key, value) values
  ('feedback_classify_enabled', 'true'),
  ('feedback_classify_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_classify_batch_size', '50')
on conflict (key) do nothing;
