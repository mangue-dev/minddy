-- Personal outbound MCP connections. Credentials are only read by the service.
CREATE TABLE public.user_mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url text NOT NULL CHECK (char_length(url) <= 2048 AND url LIKE 'https://%'),
  token_encrypted text,
  headers_encrypted text,
  transport text NOT NULL DEFAULT 'http' CHECK (transport IN ('http', 'sse')),
  auth_mode text NOT NULL DEFAULT 'none' CHECK (auth_mode IN ('none', 'bearer', 'oauth')),
  oauth_encrypted text,
  oauth_connected boolean NOT NULL DEFAULT false,
  oauth_lock_token uuid,
  oauth_lock_until timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_mcp_connections_user_idx ON public.user_mcp_connections(user_id);
ALTER TABLE public.user_mcp_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_mcp_connections FROM anon, authenticated;
GRANT ALL ON public.user_mcp_connections TO service_role;
COMMENT ON TABLE public.user_mcp_connections IS
  'Account-wide personal MCP clients. Server-only access; every query must filter by user_id.';

-- Short-lived, single-use OAuth transactions are bound to the initiating account.
CREATE TABLE public.user_mcp_oauth_attempts (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.user_mcp_connections(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  payload_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
ALTER TABLE public.user_mcp_oauth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_mcp_oauth_attempts FROM anon, authenticated;
GRANT ALL ON public.user_mcp_oauth_attempts TO service_role;
