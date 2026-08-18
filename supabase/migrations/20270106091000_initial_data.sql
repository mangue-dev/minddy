-- minddy — initial baseline data (MIN-379).
--
-- A Supabase schema dump does not carry configuration INSERTs.
-- These values ​​are therefore a distinct, idempotent migration, so that a
-- new instance finds exactly the application defects of the previous one
-- historique de 211 migrations.

insert into public.app_config (key, value) values
  ('assistant_model', 'deepseek/deepseek-v4-flash'),
  ('fallback_model', 'deepseek/deepseek-v4-flash'),
  ('transcription_model', 'openai/whisper-large-v3'),
  ('dictate_model', 'google/gemini-3.1-flash-lite'),
  ('smart_assign_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_analysis_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_embedding_model', 'openai/text-embedding-3-small'),
  ('feedback_merge_auto_threshold', '0.92'),
  ('feedback_merge_suggest_floor', '0.6'),
  ('feedback_analysis_batch_size', '50'),
  ('feedback_classify_enabled', 'true'),
  ('feedback_classify_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_classify_batch_size', '50'),
  ('agent_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_junk_purge_days', '30')
on conflict (key) do nothing;

insert into public.plan_storage_quotas (plan_id, bytes) values
  ('free', 1073741824),
  ('go',   21474836480),
  ('pro',  107374182400)
on conflict (plan_id) do nothing;

-- Facilities that had applied some migrations manually have
-- already the baseline schema, but can keep old variants
-- of these objects. Replaying them here aligns them without touching the business data.
create or replace function public.broadcast_activity_scoped()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  if coalesce(new.issue_id, old.issue_id) is not null then
    select project_id into pid from public.issues
     where id = coalesce(new.issue_id, old.issue_id);
  elsif coalesce(new.objective_id, old.objective_id) is not null then
    select project_id into pid from public.objectives
     where id = coalesce(new.objective_id, old.objective_id);
  elsif coalesce(new.feedback_post_id, old.feedback_post_id) is not null then
    select project_id into pid from public.feedback_posts
     where id = coalesce(new.feedback_post_id, old.feedback_post_id);
  end if;
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop policy if exists assistant_active_conversation_delete on public.assistant_active_conversation;
create policy assistant_active_conversation_delete on public.assistant_active_conversation
  for delete to authenticated using (user_id = auth.uid());
drop policy if exists assistant_active_conversation_insert on public.assistant_active_conversation;
create policy assistant_active_conversation_insert on public.assistant_active_conversation
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = assistant_active_conversation.conversation_id and c.user_id = auth.uid()
    )
  );
drop policy if exists assistant_active_conversation_select on public.assistant_active_conversation;
create policy assistant_active_conversation_select on public.assistant_active_conversation
  for select to authenticated using (user_id = auth.uid());
drop policy if exists assistant_active_conversation_update on public.assistant_active_conversation;
create policy assistant_active_conversation_update on public.assistant_active_conversation
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = assistant_active_conversation.conversation_id and c.user_id = auth.uid()
    )
  );

revoke select on table public.api_keys from anon, authenticated;
revoke select on table public.billing_accounts from anon, authenticated;
revoke all on table public.forge_mention_throttle from anon, authenticated;
revoke select on table public.git_connections from anon, authenticated;
revoke select on table public.git_user_identities from anon, authenticated;
revoke select on table public.integrations from anon, authenticated;
revoke select on table public.oauth_grants from anon, authenticated;
revoke select on table public.user_ai_keys from anon, authenticated;
