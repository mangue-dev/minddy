-- CVE-2026-6460 (MIN-986): a PostgreSQL role that can create objects can run
-- code as the server's OS user on servers below 17.12. The API roles never
-- create objects: migrations run as postgres. Hosted Supabase already denies
-- them CREATE on these schemas; this makes every deployment, self-hosted
-- included, hold the same guarantee rather than rely on image defaults.
revoke create on schema public from public, anon, authenticated, authenticator, service_role;
revoke create on schema graphql_public from public, anon, authenticated, authenticator, service_role;
do $$
begin
  execute format(
    'revoke create on database %I from public, anon, authenticated, authenticator, service_role',
    current_database()
  );
end
$$;
