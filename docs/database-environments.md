# Database environments

Minddy Cloud runs two hosted databases. Preview and production never share
one, so a migration under test cannot change production data.

| Environment | Origin | Git branch | Supabase | Receives migrations |
| --- | --- | --- | --- | --- |
| Production | `www.minddy.app` | `production` | project `minddy` (`cmzrlbnlytvgnomzgmqf`) | only from the protected `Promote production` workflow, at release |
| Preview | `preview.minddy.app` (and pull request previews) | `main` | persistent branch `preview` (`dehkvxlygczjbnbubffn`) of the `minddy` project | during development, by the author of the migration |
| Local | `localhost` | any | `supabase start` (Docker) | `npm run bootstrap:supabase` |

The `preview` branch belongs to the `minddy` Supabase project but has its own
ref, URL, API keys, Auth users and Storage. It was created without the
Supabase GitHub integration. Keep that integration disabled: it would push
migrations to production on every merge to `production`, outside the approval
gate. `supabase branches list --project-ref cmzrlbnlytvgnomzgmqf` shows the
branch and its state.

Development, verification and pull request evidence use the preview
database: a local `.env`, the capture scripts and the test accounts all point
there. Production is read only to diagnose an incident, and is written only by
the release.

## Moving a migration from preview to production

1. **Write** a timestamped file under `supabase/migrations/`. Its version must
   be unique and later than every applied version:
   `ls supabase/migrations | sed 's/_.*//' | sort | uniq -d` must print
   nothing (`lib/schema-guardrails.test.ts` enforces it). Two files sharing a
   version leave one of them pending forever without an error.
2. **Apply it to preview.** The local Supabase CLI is linked to the preview
   branch (check `cat supabase/.temp/project-ref`, which must not be the
   production ref). Run `supabase db push --dry-run`, confirm that only the
   new file is listed, then `supabase db push`. Verify the objects on preview.
3. **Open the pull request.** Its description states that the migration is
   applied to preview and how it was verified there. Merging into `main`
   deploys preview against a database that already has the schema; the
   deployment preflight below blocks a preview build whose database lacks it.
4. **Release.** `Promote production` applies every pending migration after the
   `cloud-production` approval and before it fast-forwards `production`. The
   step checks for duplicate versions, records the `supabase db push
   --dry-run` plan in the job summary, then runs `supabase db push` against the
   `PRODUCTION_DATABASE_URL` secret of the `cloud-production` environment
   (the session pooler connection string, because GitHub runners have no IPv6
   route to the direct database host). Vercel then builds the promoted SHA,
   whose preflight finds the new schema.

Never run `supabase db push`, `supabase db reset` or a `--linked` write against
production by hand, and never relink the local CLI to production to apply a
migration.

### Keep migrations backward compatible

Between the migration step and the end of the Vercel deployment, the code
already serving production runs against the new schema. A failed deployment
leaves it there longer. Each migration must therefore work with the
previous release:

- add tables, columns, functions and policies before the code that uses them;
- remove or rename in a later release, once no deployed code reads the old
  shape. A column dropped before its readers are gone turns their queries into
  PostgREST errors, which many reads surface as empty lists;
- make a new `NOT NULL` column nullable or defaulted first, and backfill it in a
  separate step.

A migration that fails in `Promote production` stops the promotion before
`production` moves: production keeps its code, and the database keeps the
statements committed before the failure. Fix it with a new migration on
`main`; do not edit an applied file.

## Refreshing the preview database

Preview drifts from production as abandoned migrations and test data
accumulate. Before each release, compare the two histories:

```bash
supabase migration list                    # linked preview branch
```

and the job summary of the last `Promote production` run. Preview may be
ahead by the migrations waiting for the next release, never behind and never
with a version absent from `supabase/migrations/`.

- **An abandoned migration** applied to preview but removed from the branch:
  revert its objects on preview with SQL, then record it with
  `supabase migration repair --status reverted <version>`.
- **A full refresh** rebuilds preview from the repository. Confirm that the CLI
  is linked to the preview ref, then run `supabase db reset --linked`, which
  drops the preview database and replays every migration. Then reconcile the
  Storage buckets (`node scripts/reconcile-storage-buckets.mjs` with the preview
  variables), replay the capture world (`captures/world/seed/`, see the
  `capture-world` skill), recreate the capture admin
  (`node captures/world/admin-account.mjs --apply --reset`) and refresh the
  saved sessions.

Preview never receives a copy of production data. A copy would make preview a
production data store and would need the production encryption root key.

## Deployment configuration

Each Vercel environment has its own database variables. Preview values come
from `supabase branches get preview --project-ref cmzrlbnlytvgnomzgmqf`.

| Variable | Production | Preview |
| --- | --- | --- |
| `MINDDY_PUBLIC_SUPABASE_URL`, `MINDDY_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | production project | preview branch |
| `MINDDY_DATA_ROOT_KEY`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `GIT_STATE_SECRET`, `GITLAB_TOKEN_ENCRYPTION_SECRET`, `CRON_SECRET` | production values | independent values |
| `MINDDY_PRODUCTION_SUPABASE_URL` | production project URL | production project URL |

The encryption secrets protect data stored in one database. Independent preview
values keep a leaked preview variable from opening production data or backups.
`MINDDY_PRODUCTION_SUPABASE_URL` declares which database is production:
`npm run check:deployment-db` refuses a production build that targets another
database and any other build that targets it. Compare
`/api/runtime-config` on both origins after a change; their `supabaseUrl`
values must differ.

The preview branch inherits the parent project's Auth configuration (SMTP,
email templates, password and session policy) when it is created. Its URL
configuration differs: `site_url` is `https://preview.minddy.app`, and the
redirect allowlist names `https://preview.minddy.app/auth/callback?**`. An
OAuth provider (Google, GitHub) works on preview only once the provider app
also lists the branch's `https://dehkvxlygczjbnbubffn.supabase.co/auth/v1/callback`.
See [the Auth configuration record](auth-supabase-config.md).

## What preview does not run

- **Vercel crons** run on production only. Interactive work still runs inline,
  but on preview no scheduled routine fires, event-triggered routines stay
  queued, retryable Numo turns are not resumed, and key rotation, billing sync,
  FX rates and retention sweeps do not run. Call a cron route with
  `Authorization: Bearer <preview CRON_SECRET>` to exercise it.
- **Forge and Stripe webhooks** target production. Pull request
  synchronization, forge mentions and Stripe events reach preview only through
  a separately registered app or test-mode endpoint.
- **The public changelog** is published to production Storage. Set
  `MINDDY_CHANGELOG_URL` on preview to read production's public changelog, or
  preview shows the bundled history only.
- **Accounts are separate.** A production account does not exist on preview.
  The desktop app keeps one session per channel, so switching between the
  stable and preview channels asks to sign in once on each.

## Deployment preflight

Vercel builds run `npm run check:deployment-db` before compiling the app. The
check first applies the environment rule above. It then reads the target
PostgREST OpenAPI schema with the deployment's service credentials and
requires the auth and Realtime RPCs used by this candidate, plus the
`user_numo_preferences` table and its account/provider/model columns. Missing
configuration, an unavailable schema, or a missing required entry stops the
build before Vercel replaces the current deployment. It does not apply
migrations, change grants, query account data, or substitute weaker
authorization checks. Local builds and immutable self-hosted image builds
remain independent of a running database; self-hosted upgrades still use the
bootstrap verification.

This check detects missing entry points, not complete migration compatibility.
Keep the required schema entries current when adding mandatory startup
dependencies.

Numo's personal model defaults require
`20270109200040_personal_numo_model_preferences.sql`. A failed preference read
does not remove the model catalog: `/api/assistant/models` reports the database
failure and returns the available choices with an unknown (`null`) default.
An explicit model can still be selected. Settings reads and turn admission
without an explicit model continue to fail rather than silently replace a saved
choice. `DatabaseOperationError` exceptions report only structural failure kind,
code and HTTP status to PostHog, alongside the operation name in the exception;
upstream database messages, hints and row values are not retained by that wrapper.

Worker Stop prefers `request_numo_worker_stop`, introduced by
`20270109200021_numo_durable_worker_stop.sql`. Until that additive migration is
applied, only a PostgREST missing-function response (`PGRST202`) enables the
compatibility path: retire the existing Numo parent and clear its claim before
discarding the selected worker's steering/input and storing its interrupt.
Storage errors fail the request and leave the revocation durable for a retry;
unrelated workers are never interrupted. Conversation status uses a timestamp
compare-and-set to preserve a concurrent new turn.

## Recovering a code/schema mismatch

1. Read the deployment's runtime errors and identify the missing function.
2. Compare `/api/runtime-config` on preview and production, and verify that
   each deployment targets its own database.
3. Inspect `supabase migration list` for the affected database without
   changing it.
4. On preview, apply the missing migration with `supabase db push` and redeploy.
   On production, restore the last compatible ready deployment, then ship the
   migration through `Promote production`; do not apply it by hand.
5. After the fix, verify login, authenticated APIs, MFA, and private Realtime
   subscriptions.

If an upgrade stops with `existing_storage_object_scope_invalid`, inspect the
affected object's account/project attribution and its attachment, page, and
message references. Preserve confirmed unreferenced objects from deleted
accounts in a private quarantine bucket through the Storage API, retaining
their original paths and verifying byte hashes. Keep a recovery manifest and
then retry the migration. Do not delete Storage metadata directly or bypass
the validation to make the migration pass.
