-- These functions accept an actor or instance already authorized by the server.
-- Removing PUBLIC alone does not remove Supabase's explicit default role grants.
REVOKE ALL ON FUNCTION public.claim_local_agent_run(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_local_agent_run(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_forge_relay_mint(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_forge_relay_mint(uuid, integer)
  TO service_role;
