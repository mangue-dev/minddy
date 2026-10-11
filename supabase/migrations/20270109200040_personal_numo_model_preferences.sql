-- Provider-bound personal defaults; model identifiers contain no credentials.
CREATE TABLE public.user_numo_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  model text CHECK (model IS NULL OR model ~ '^[A-Za-z0-9_./:@-]{1,200}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
ALTER TABLE public.user_numo_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_numo_preferences_owner ON public.user_numo_preferences
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_numo_preferences TO authenticated;
GRANT ALL ON public.user_numo_preferences TO service_role;
