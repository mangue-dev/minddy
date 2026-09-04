-- Keep resolved entity identities alongside the routine instruction so every
-- scheduled or manual run can render and resolve the same mentions the owner
-- selected when composing it.
ALTER TABLE public.agent_routines
  ADD COLUMN IF NOT EXISTS prompt_mentions jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE public.agent_routines
  DROP CONSTRAINT IF EXISTS agent_routines_prompt_mentions_array_check;

ALTER TABLE public.agent_routines
  ADD CONSTRAINT agent_routines_prompt_mentions_array_check
  CHECK (jsonb_typeof(prompt_mentions) = 'array');
