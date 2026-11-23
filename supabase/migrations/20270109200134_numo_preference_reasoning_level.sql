-- An account's reasoning level for its language model, next to the model it
-- chose for each personal provider. NULL follows the instance's level. The
-- instance's own provider (`minddy`) takes neither: its administrator sets
-- both.
alter table public.user_numo_preferences
  add column reasoning_level text
  check (reasoning_level is null
    or reasoning_level in ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));
