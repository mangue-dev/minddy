# Preview database compatibility

Vercel builds run `npm run check:deployment-db` before compiling the app. The
check reads the target PostgREST OpenAPI schema with the deployment's service
credentials and requires the auth and Realtime RPCs used by this candidate.
Missing configuration, an unavailable schema, or a missing RPC stops the build
before Vercel replaces the current deployment. It does not apply migrations,
change grants, query account data, or substitute weaker authorization checks.
Local builds and immutable self-hosted image builds remain independent of a
running database; self-hosted upgrades still use the bootstrap verification.

This check detects missing entry points, not complete migration compatibility.
Review the migration history and test the target database before promotion.
Keep the required RPC list current when adding mandatory startup dependencies.

## Recovering a code/schema mismatch

1. Read the deployment's runtime errors and identify the missing function.
2. Compare `/api/runtime-config` on preview and production, then verify that
   the linked Supabase project matches the affected deployment. Treat a shared
   database as production infrastructure.
3. Inspect `supabase migration list --linked` without changing the database.
4. Restore only the preview alias to its last compatible, ready deployment.
   Reload the desktop app and verify an authenticated application request.
5. Review the pending migrations and their compatibility with the application
   versions using that database. Use a separate preview database or coordinate
   an approved production database/application upgrade. Do not blindly apply
   candidate migrations to a shared database to unblock a preview build.
6. After migration verification, rebuild the candidate with the preflight and
   verify login, authenticated APIs, MFA, and private Realtime subscriptions.

The v0.10.25 auth and Realtime dependencies were introduced by
`20270106620000_release_security_hardening.sql` and
`20270106630000_realtime_membership_generations.sql`; the preceding
`20270106610000_restrict_server_rpc_grants.sql` is also part of that upgrade.
The Realtime migration changes topic generations and access policies, so
restoring the preview alias avoids changing a shared production database
during incident recovery.

If the upgrade stops with `existing_storage_object_scope_invalid`, inspect the
affected object's account/project attribution and its attachment, page, and
message references. Preserve confirmed unreferenced objects from deleted
accounts in a private quarantine bucket through the Storage API, retaining
their original paths and verifying byte hashes. Keep a recovery manifest and
then retry the migration. Do not delete Storage metadata directly or bypass
the validation to make the migration pass.
