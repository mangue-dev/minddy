-- MIN-907: the Apple refresh tokens that account deletion revokes
-- (App Review guideline 5.1.1(v)). Supabase keeps no provider token, so the
-- server stores the one Apple issues at sign-in, one per Apple client (the iOS
-- app and the web Services ID). Rows are born sealed with the user's data key
-- and cascade with the account; only the service role reads or writes them.
BEGIN;
CREATE TABLE public.apple_sign_in_tokens(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 255),
  encrypted_content text NOT NULL,
  encryption_version integer NOT NULL CHECK (encryption_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
ALTER TABLE public.apple_sign_in_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_sign_in_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.apple_sign_in_tokens TO service_role;
COMMIT;
