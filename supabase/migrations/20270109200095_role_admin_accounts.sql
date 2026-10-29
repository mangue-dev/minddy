-- MIN-847: the accounts that are instance administrators by role
-- (`app_metadata.role = admin`), told about every instance variable change
-- like the addresses of ADMIN_EMAILS. Only what the notification needs leaves
-- the database, for the service role only.
CREATE FUNCTION public.get_role_admin_accounts()
RETURNS TABLE(user_id uuid, email text, email_confirmed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id, u.email::text, u.email_confirmed_at IS NOT NULL
  FROM auth.users u
  WHERE u.deleted_at IS NULL
    AND u.raw_app_meta_data->>'role' = 'admin'
  ORDER BY u.id
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.get_role_admin_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_admin_accounts() TO service_role;
