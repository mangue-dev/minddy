-- minddy — MIN-351 : les gardes qui survivaient à la révocation.
--
-- Trois passes, sans rapport entre elles sinon qu'elles tombent toutes du même
-- audit :
--
--  1. « Auteur » n'est pas une autorisation. `comments_update` et
--     `comments_delete` ne regardaient QUE `author_id = auth.uid()` : retiré du
--     projet, l'ancien membre gardait la main sur ses commentaires — les
--     réécrire, les effacer — indéfiniment, avec la clé anon et rien d'autre.
--     Être l'auteur dit à qui appartient la ligne ; ce qui dit si on a encore le
--     droit d'y toucher, c'est l'appartenance au projet du PARENT. Les deux, et
--     dans cet ordre, comme le fait déjà `page_comments_delete`.
--
--  2. `via_assistant` n'était épinglé nulle part côté client. Un `insert`
--     PostgREST direct avec `via_assistant: true` posait un commentaire signé
--     « Numo » sous les mots d'un humain — c'est exactement l'inverse de la
--     règle d'identité du produit (un geste humain porte le nom de l'humain).
--     Aucun chemin de l'app ne passe par ces policies : le serveur écrit en clé
--     service (lib/server/add-comment.ts, lib/server/page-comments.ts), qui
--     traverse la RLS. Les épingler ne coûte donc rien et ferme la porte.
--     `via_mcp` part avec, pour la même raison : c'est l'autre marque d'acteur
--     non humain du fil.
--
--  3. Le cast d'UUID des policies `realtime.messages` n'avait pas de garde de
--     format. `split_part(topic, ':', 2)::uuid` sur `project:pas-un-uuid` LÈVE,
--     et une branche qui lève fait tomber la policy ENTIÈRE — pas seulement la
--     sienne : tout le temps réel de l'application, pour la session qui a joint
--     ce topic. Les fonctions `can_watch_*` prennent déjà cette précaution en
--     plpgsql (20260908090000) ; les trois policies qui castent EN LIGNE ne
--     l'avaient pas.
--
-- Idempotent — safe à re-run.

-- ── 1. L'appartenance au projet, en plus de l'auteur ────────────────────────
--
-- Le parent d'un commentaire est un ticket, un objectif ou un retour du board :
-- les trois portent `project_id`, et `comments_select` (20260728091000) fait
-- déjà cette lecture pour les deux premiers. Le troisième s'ajoute ici — un fil
-- de feedback est servi côté serveur, mais la ligne existe et la règle doit
-- valoir quel que soit le chemin.
--
-- Une fonction plutôt que l'expression recopiée quatre fois : elle est la même
-- pour `select`, `insert`, `update` et `delete`, et trois `exists` en ligne
-- répétés quatre fois est exactement la forme qui finit par diverger.
--
-- Nommée `can_access_*` à dessein : c'est la famille des aides de POLICY, celle
-- que le balai de 20261220090000 et le garde-fou de
-- `lib/schema-guardrails.test.ts` laissent exécutables par `authenticated`.
--
-- `security definer` (comme `can_access_project`) : les lignes parentes ne sont
-- pas toutes lisibles par l'appelant — un retour du board ne l'est jamais par la
-- RLS, il est servi en clé service. D'où aussi le `grant execute` explicite en
-- dessous : appelée DEPUIS une policy, une fonction non exécutable LÈVE, et la
-- policy entière tombe avec elle (MIN-329).
create or replace function public.can_access_comment_parent(
  issue_uuid uuid,
  objective_uuid uuid,
  feedback_post_uuid uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.issues i
    where i.id = issue_uuid and public.can_access_project(i.project_id)
  ) or exists (
    select 1 from public.objectives o
    where o.id = objective_uuid and public.can_access_project(o.project_id)
  ) or exists (
    select 1 from public.feedback_posts f
    where f.id = feedback_post_uuid and public.can_access_project(f.project_id)
  );
$$;

grant execute on function public.can_access_comment_parent(uuid, uuid, uuid)
  to authenticated;

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update
  to authenticated
  using (
    author_id = (select auth.uid())
    and via_assistant = false
    and public.can_access_comment_parent(issue_id, objective_id, feedback_post_id)
  )
  with check (
    author_id = (select auth.uid())
    and via_assistant = false
    and public.can_access_comment_parent(issue_id, objective_id, feedback_post_id)
  );

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    and via_assistant = false
    and public.can_access_comment_parent(issue_id, objective_id, feedback_post_id)
  );

-- ── 2. `via_assistant` épinglé sur les inserts client ───────────────────────
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and via_assistant = false
    and via_mcp = false
    and public.can_access_comment_parent(issue_id, objective_id, feedback_post_id)
  );

drop policy if exists page_comments_insert on public.page_comments;
create policy page_comments_insert on public.page_comments for insert
  to authenticated
  with check (
    public.can_access_project(project_id)
    and author_id = (select auth.uid())
    and via_assistant = false
    and via_mcp = false
  );

-- ── 3. Le cast d'UUID des topics, derrière un contrôle de format ────────────
--
-- Rend NULL au lieu de lever. `can_access_project(null)` rend NULL, que la
-- policy lit comme faux : le topic malformé ne joint rien, et surtout il
-- n'emporte plus les autres branches avec lui.
--
-- PAS `security definer` : elle ne lit rien: c'est une conversion de texte, et
-- le balayage de 20261220090000 ne révoque `execute` que sur les définisseurs.
create or replace function public.topic_uuid(topic text)
returns uuid language plpgsql immutable parallel safe as $$
begin
  return split_part(topic, ':', 2)::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.topic_uuid(text) to authenticated;

-- La policy de RÉCEPTION broadcast, réécrite entière : elle est recopiée par
-- chaque migration qui la touche (`create policy` ne se patche pas), et la
-- dernière copie fait foi. Celle-ci reprend 20261006091000 à l'identique, au
-- cast près.
drop policy if exists members_receive_broadcasts on realtime.messages;
create policy members_receive_broadcasts on realtime.messages
for select to authenticated
using (
  extension = 'broadcast' and (
    (
      realtime.topic() like 'project:%'
      and public.can_access_project(public.topic_uuid(realtime.topic()))
    )
    or (
      realtime.topic() like 'user:%'
      and split_part(realtime.topic(), ':', 2) = (select auth.uid()::text)
    )
    or (
      realtime.topic() like 'agent-run:%'
      and public.can_watch_agent_run(realtime.topic())
    )
    or (
      realtime.topic() like 'numo-comment:%'
      and public.can_watch_numo_comment(realtime.topic())
    )
    or (
      realtime.topic() like 'pull-request:%'
      and public.can_watch_pull_request(realtime.topic())
    )
  )
);

-- Présence des pages (20261127090000), même correction.
drop policy if exists members_receive_page_presence on realtime.messages;
create policy members_receive_page_presence on realtime.messages
for select to authenticated
using (
  extension = 'presence'
  and realtime.topic() like 'page-presence:%'
  and public.can_access_project(public.topic_uuid(realtime.topic()))
);

drop policy if exists members_track_page_presence on realtime.messages;
create policy members_track_page_presence on realtime.messages
for insert to authenticated
with check (
  extension = 'presence'
  and realtime.topic() like 'page-presence:%'
  and public.can_access_project(public.topic_uuid(realtime.topic()))
);
