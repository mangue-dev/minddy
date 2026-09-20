-- MIN-562: seed the Jev decision-layer calibration keys.
--
-- Plain `app_config` keys OUTSIDE the admin registry (deliberate, MIN-557:
-- no UI switch, these are calibration levers). The code falls back to the
-- same defaults when the rows are absent; seeding them makes the keys
-- discoverable and tunable by ops without a deploy:
--
-- - jev_confidence_floor — a Jev decision whose global confidence falls
--   under this floor is discarded for the existing LLM pass (0.55 to be
--   calibrated by MIN-567's shadow comparison).
-- - jev_shadow_sample_rate — share of decisions sampled for that
--   comparison (wired by MIN-567).

insert into public.app_config (key, value) values
  ('jev_confidence_floor', '0.55'),
  ('jev_shadow_sample_rate', '0.05')
on conflict (key) do nothing;
