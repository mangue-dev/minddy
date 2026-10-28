-- MIN-826: route each precise usage (call type), not each category.
--
-- 20270109200089 routed four categories (Numo, automations, voice, feedback).
-- A provider is now chosen per call type: Numo conversations, their titles
-- and web search can each use a different provider, like every automation.
-- The table is renamed for what it holds, and each category route becomes the
-- routes of its call types that the credential's provider can serve. Neither
-- 20270109200089 nor this migration has been released: no deployed code reads
-- the category shape.

alter table public.user_ai_surface_routes rename to user_ai_usage_routes;
alter table public.user_ai_usage_routes rename column surface to usage_key;
alter table public.user_ai_usage_routes
  drop constraint user_ai_surface_routes_surface_check;
alter table public.user_ai_usage_routes
  rename constraint user_ai_surface_routes_key_fkey to user_ai_usage_routes_key_fkey;
alter index public.user_ai_surface_routes_key_idx rename to user_ai_usage_routes_key_idx;
alter policy user_ai_surface_routes_select on public.user_ai_usage_routes
  rename to user_ai_usage_routes_select;
alter trigger user_ai_surface_routes_set_updated_at on public.user_ai_usage_routes
  rename to user_ai_usage_routes_set_updated_at;

-- Each category route becomes one route per call type its provider serves.
insert into public.user_ai_usage_routes (user_id, usage_key, ai_key_id, created_at, updated_at)
select routes.user_id, usages.usage_key, routes.ai_key_id, routes.created_at, routes.updated_at
from public.user_ai_usage_routes as routes
join public.user_ai_keys as keys on keys.id = routes.ai_key_id
cross join lateral (values
  ('assistant', 'assistant_model', 'text'),
  ('assistant', 'conversation_title_model', 'text'),
  ('assistant', 'web_search_model', 'web_search'),
  ('automations', 'smart_assign_model', 'text'),
  ('automations', 'smart_fill_model', 'text'),
  ('automations', 'smart_fill_title_model', 'text'),
  ('automations', 'import_map_model', 'text'),
  ('automations', 'brief_model', 'text'),
  ('automations', 'issue_embedding_model', 'embedding'),
  ('automations', 'issue_relation_model', 'text'),
  ('voice', 'dictate_model', 'text'),
  ('voice', 'transcription_model', 'transcription'),
  ('feedback', 'feedback_analysis_model', 'text'),
  ('feedback', 'feedback_embedding_model', 'embedding')
) as usages(surface, usage_key, capability)
where usages.surface = routes.usage_key
  and case usages.capability
    when 'text' then true
    when 'web_search' then keys.provider = 'openrouter'
    when 'transcription' then keys.provider in ('openrouter', 'openai')
    when 'embedding' then keys.provider in ('openrouter', 'openai', 'google')
  end
on conflict (user_id, usage_key) do nothing;

delete from public.user_ai_usage_routes
where usage_key in ('assistant', 'automations', 'voice', 'feedback');

alter table public.user_ai_usage_routes
  add constraint user_ai_usage_routes_usage_key_check check (usage_key in (
    'assistant_model', 'conversation_title_model', 'web_search_model',
    'smart_assign_model', 'smart_fill_model', 'smart_fill_title_model',
    'import_map_model', 'brief_model', 'issue_embedding_model',
    'issue_relation_model', 'dictate_model', 'transcription_model',
    'feedback_analysis_model', 'feedback_embedding_model'
  ));

comment on table public.user_ai_usage_routes is
  'Provider of each AI call type (MIN-826): a row routes the call type to one of the account credentials; no row means Minddy Cloud.';
