-- MIN-980: an account's decision settings.
--
-- `engine` overrides the instance's `decision_engine` setting (NULL follows
-- it): `model` asks a decision model, `llm` asks a language model.
-- `provider` picks who answers: NULL is automatic (the language model's
-- route), `minddy` is minddy Cloud, any other value names one of the
-- account's credentials by provider (a credential is unique per provider).
-- A removed credential reads as automatic again.
-- `model` is the model that credential runs for decisions (NULL is its
-- default), and `model_engine` the engine it was chosen for: a decision model
-- id and a language model id do not share a namespace, so a model is only
-- used under the engine it was chosen for. Model identifiers contain no
-- credentials.
--
-- Additive: the previous release never reads the table.
CREATE TABLE public.user_ai_decision_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  engine text CHECK (engine IS NULL OR engine IN ('model', 'llm')),
  provider text CHECK (provider IS NULL OR length(provider) BETWEEN 1 AND 64),
  model text CHECK (model IS NULL OR model ~ '^[A-Za-z0-9_./:@-]{1,200}$'),
  model_engine text CHECK (model_engine IS NULL OR model_engine IN ('model', 'llm')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((model IS NULL) = (model_engine IS NULL))
);

-- Reads by the owner only; every write goes through the server, which checks
-- the credential and the model.
ALTER TABLE public.user_ai_decision_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_ai_decision_preferences_select ON public.user_ai_decision_preferences
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.user_ai_decision_preferences TO authenticated;
GRANT ALL ON public.user_ai_decision_preferences TO service_role;
