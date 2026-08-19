select format(
  'drop policy if exists %1$I on %2$I.%3$I;%4$screate policy %1$I on %2$I.%3$I as %5$s for %6$s to %7$s%8$s%9$s;',
  policyname,
  schemaname,
  tablename,
  E'\n',
  permissive,
  cmd,
  (
    select string_agg(quote_ident(role_name), ', ' order by position)
    from unnest(roles) with ordinality as policy_role(role_name, position)
  ),
  case when qual is null then '' else ' using (' || qual || ')' end,
  case when with_check is null then '' else ' with check (' || with_check || ')' end
)
from pg_policies
where schemaname in ('storage', 'realtime')
order by schemaname, tablename, policyname;
