# Validate self-hosting in a clean room

This is the release acceptance scenario for a third-party minddy operator. It
starts from two consecutive immutable releases and uses no local minddy files,
accounts, production secrets, or Minddy Cloud services. The procedure is
destructive: run it only on a disposable host and disposable Supabase stacks.

The installation and operations runbooks remain the source of truth. This page
adds an ordered acceptance record around them:

- [install and bootstrap](self-hosting.md);
- [backup, update, restore, and rollback](self-hosting-operations.md).

## Acceptance boundary

Use a newly provisioned VM or workstation with an empty home directory for the
test account. Do not mount a maintainer checkout, password manager, SSH agent,
cloud CLI configuration, Docker volume, or browser profile. Network access is
needed only for the public Git repository, package registries, container images,
the selected optional provider, and loopback services.

The normal run is accepted only when both refs are annotated
`vMAJOR.MINOR.PATCH` release tags. Before the repository's first public release,
the explicit prepublication path below may instead use annotated
`preflight/vMAJOR.MINOR.PATCH` candidate refs from a checksummed Git bundle. In
both modes, the older commit must be an ancestor of the newer commit and both
commits must contain this scenario, the bootstrap, migrations, and both
self-hosting runbooks. A branch, bare commit SHA, uncommitted change, or locally
patched checkout is never acceptance evidence.

Prepublication evidence is conditional: it passes the lifecycle contract but
does not claim that a public release exists. It becomes release evidence only
when the final `vMAJOR.MINOR.PATCH` tags point to the exact commit identities in
the report. Any change to either candidate commit invalidates the run.

Use unique, non-production values throughout. The examples reserve `.test`
domains and local ports deliberately.

## 1. Prepare the disposable host

Install Node.js 24, pnpm 10.28.0, Docker, the Supabase CLI, PostgreSQL client
tools, Git, and curl. Then open a shell that has no inherited minddy or provider
configuration:

```bash
env -i \
  HOME="$HOME" \
  PATH="$PATH" \
  TERM="${TERM:-xterm}" \
  SHELL="${SHELL:-/bin/sh}" \
  bash --noprofile --norc
```

Set only public test inputs. Never paste a production value into this shell or
the report. For an already published pair, clone the public repository:

```bash
export VALIDATION_MODE=release
export FROM_REF=vX.Y.Z
export TO_REF=vX.Y.Z
export CLEAN_ROOT="$HOME/minddy-clean-room"
export SOURCE_DIR="$CLEAN_ROOT/source"
export BACKUP_ROOT="$CLEAN_ROOT/backups"
export REPORT_DIR="$CLEAN_ROOT/report"
install -d -m 0700 "$CLEAN_ROOT" "$BACKUP_ROOT" "$REPORT_DIR"
git clone https://github.com/mangue-dev/minddy.git "$SOURCE_DIR"
cd "$SOURCE_DIR"
git fetch --tags --force
```

For prepublication validation, receive only the candidate Git bundle and its
`SHA256SUMS` file from the release preparer. Do not receive a working tree or a
patch. Verify the bundle before importing its two annotated refs:

```bash
export VALIDATION_MODE=prepublication
export FROM_REF=preflight/v0.10.0
export TO_REF=preflight/v0.10.1
export CLEAN_ROOT="$HOME/minddy-clean-room"
export SOURCE_DIR="$CLEAN_ROOT/source"
export BACKUP_ROOT="$CLEAN_ROOT/backups"
export REPORT_DIR="$CLEAN_ROOT/report"
export CANDIDATE_BUNDLE="$CLEAN_ROOT/minddy-preflight.bundle"
cd "$CLEAN_ROOT"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
git init "$SOURCE_DIR"
git -C "$SOURCE_DIR" fetch "$CANDIDATE_BUNDLE" \
  "refs/tags/$FROM_REF:refs/tags/$FROM_REF" \
  "refs/tags/$TO_REF:refs/tags/$TO_REF"
git -C "$SOURCE_DIR" switch --detach "$TO_REF"
install -d -m 0700 "$BACKUP_ROOT" "$REPORT_DIR"
cd "$SOURCE_DIR"
```

Run the versioned preflight before installing dependencies or starting Docker:

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
if [ "$VALIDATION_MODE" = prepublication ]; then
  pnpm validate:self-hosted -- --prepublication \
    --from-ref "$FROM_REF" --to-ref "$TO_REF" \
    --report "$REPORT_DIR/preflight.md"
else
  pnpm validate:self-hosted -- \
    --from-tag "$FROM_REF" --to-tag "$TO_REF" \
    --report "$REPORT_DIR/preflight.md"
fi
```

Stop if it reports `BLOCKED`. Do not substitute a branch or add missing files to
the checkout: that would test unpublished local state.

## 2. Install the source release

```bash
git switch --detach "$FROM_REF"
test "$(git describe --tags --exact-match)" = "$FROM_REF"
test -z "$(git status --porcelain)"
pnpm install --frozen-lockfile
pnpm bootstrap:supabase
pnpm bootstrap:supabase
```

The second bootstrap must succeed without replacing generated secrets or
reapplying migrations. Keep `.env.local` out of the report. Add only these
non-secret instance values:

```dotenv
MINDDY_PUBLIC_APP_URL=http://127.0.0.1:3000
MINDDY_PUBLIC_SITE_NAME=minddy clean room
MINDDY_PUBLIC_CONTACT_EMAIL=operator@example.test
ADMIN_EMAILS=admin@example.test
EMAIL_PROVIDER=console
AGENT_EXECUTION_BACKEND=local
MINDDY_MANAGED_AI=0
MINDDY_MANAGED_BILLING=0
MINDDY_PUBLIC_VERCEL_ANALYTICS=0
```

Leave all Stripe, PostHog, Resend, Vercel, push, GitHub, GitLab, and managed AI
keys absent. Build and start the release:

```bash
pnpm build
pnpm start > "$REPORT_DIR/source-app.log" 2>&1 &
export SOURCE_APP_PID=$!
for attempt in $(seq 1 60); do
  curl --fail --silent http://127.0.0.1:3000/ >/dev/null && break
  test "$attempt" -lt 60 || exit 1
  sleep 1
done
```

## 3. Exercise the core as a new user

Use a private browser profile containing no existing cookies.

1. Run `supabase status`, open the local email inbox URL it reports, then open
   `http://127.0.0.1:3000` and sign up as `admin@example.test`. Use the message
   captured in that local inbox to confirm the account.
2. Confirm that the account receives first-administrator access through
   `ADMIN_EMAILS`; no database console edit is allowed.
3. Create project `Clean Room` with key `ROOM`.
4. Create ticket `Survives update and restore`, set it to `In progress`, priority
   `Urgent`, effort `M`, and add the description `MIN-383 acceptance marker`.
5. Upload a small text attachment containing only `clean-room-storage-marker`.
6. Sign out, sign in again, and confirm that the project, ticket, and attachment
   are readable.

Record timestamps and generated row identifiers, but no cookie, JWT, key, email
link, or attachment signed URL. Capture the following database counts:

```bash
source <(supabase status --output env)
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$REPORT_DIR/source-counts.json"
```

## 4. Exercise one optional integration and isolate the others

In project settings, create an `issues` integration named `Clean room caller`.
Store its one-time key in a shell variable without printing it, then submit a
second issue through the endpoint and payload shown by the application itself.
Confirm that it appears in triage with integration attribution. Revoke the key
and confirm that reusing it returns `401`.

The chosen integration is the only optional surface enabled for this run. Verify
the disabled surfaces before continuing:

- billing and managed quota UI stays absent;
- AI actions report that a provider key or local model is required;
- GitHub and GitLab connection actions stay unavailable until configured;
- email uses the local console provider;
- browser and server logs contain no request to `minddy.app`, Stripe, PostHog,
  Resend, Vercel, GitHub, GitLab, or OpenRouter;
- OAuth discovery, MCP endpoint values, links, and callback URLs use
  `http://127.0.0.1:3000`, never a Minddy Cloud origin.

Any silent external request or `minddy.app` URL is a release blocker. Save only
the request host, path, status, and timestamp; remove headers and bodies.

### CI egress contract

The CI contract records only the capture source, destination host, and its
policy decision. The four capture sources are `browser`, `server`,
`scheduler`, and `container`. A missing source blocks the report, so a quiet
source cannot be mistaken for an unobserved one.

For the minimal scenario, only the application, selected Supabase hostname,
and internal scheduler target are allowed. The full Compose profile additionally
makes its default network internal: Caddy is the only service on an external
edge network. Stripe, PostHog, Vercel, OpenRouter, Resend, telemetry, feedback,
and Minddy Cloud remain denied unless an operator explicitly declares the one
selected provider; Minddy Cloud is never allowed.

The report input is JSON produced by the capture layer and contains no request
body, path, query string, header, or credential. For example:

```bash
MINDDY_PUBLIC_APP_URL=http://minddy:3000 \
MINDDY_PUBLIC_SUPABASE_URL=https://project.supabase.co \
MINDDY_SCHEDULER_URL=http://minddy:3000 \
pnpm verify:self-hosted-egress -- \
  --egress-log test/fixtures/self-hosted-egress/minimal.json \
  --profile minimal \
  --report "$REPORT_DIR/egress-minimal.md"
```

Run the provider scenario separately and declare only its host with
`--profile provider --allow-host api.resend.com`. The resulting CI artifacts
make a required Supabase access distinguishable from a prohibited vendor leak.

## 5. Back up and update

Follow **Before any maintenance** and **Complete and consistent backup** in
[`self-hosting-operations.md`](self-hosting-operations.md) without shortening
the database, configuration, or Storage steps. Use `BACKUP_ROOT` above, verify
`SHA256SUMS`, and copy the sealed set to a second disposable volume. The source
counts must be part of the set.

Then follow **Update to the next version** exactly:

```bash
kill "$SOURCE_APP_PID"
git switch --detach "$TO_REF"
test "$(git describe --tags --exact-match)" = "$TO_REF"
test -z "$(git status --porcelain)"
pnpm install --frozen-lockfile
pnpm bootstrap:supabase
pnpm verify:supabase --local
pnpm build
pnpm start > "$REPORT_DIR/target-app.log" 2>&1 &
export TARGET_APP_PID=$!
```

Repeat the sign-in, project, ticket, attachment, and integration-created ticket
checks. Confirm that no existing identifier changed. Record the migration list
before reopening writes:

```bash
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select version from supabase_migrations.schema_migrations order by version" \
  > "$REPORT_DIR/target-migrations.txt"
```

## 6. Restore onto a blank stack

Stop the target application and follow **Restore to a pristine environment** in
the operations runbook. The restore target must use a new Supabase directory,
new Docker resources, a new application origin, and no users or Storage objects
before loading the backup. Do not restore over the updated stack.

After the database, Storage bytes, configuration, and saved source commit are
restored together:

```bash
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$RESTORE_SUPABASE_URL" \
  --service-role-key "$RESTORE_SERVICE_ROLE_KEY"
diff -u "$REPORT_DIR/source-counts.json" "$REPORT_DIR/restored-counts.json"
```

Sign in as the restored user. Confirm the original project, both tickets,
integration attribution and revocation, attachment metadata, and downloaded
attachment bytes. The restored application must still use the restore origin for
links, OAuth, MCP, and callbacks.

## 7. Seal the evidence

Create `report.md` with this table. Every row needs a command, observation, or
sanitized artifact; a bare assertion is not evidence.

| Check | Result | Evidence |
| --- | --- | --- |
| Immutable consecutive tags |  | `preflight.md` |
| Clean bootstrap and idempotent second run |  | timestamps and exit codes |
| Account and first administrator |  | redacted account ID and role |
| Project, ticket, and Storage object |  | IDs and `source-counts.json` |
| One integration enabled and revoked |  | redacted integration ID and HTTP statuses |
| Other optional services isolated |  | sanitized host/request audit |
| Coordinated backup sealed and copied |  | backup ID and checksum result |
| Update completed in required order |  | tag, migration list, downtime |
| Blank restore completed |  | target identity and verifier output |
| Restored data and bytes match |  | count diff and attachment hash |

Remove secrets from logs, then seal the evidence directory:

```bash
if rg -n -i 'authorization:|bearer |service_role|postgres(ql)?://[^ ]+:[^@ ]+@' "$REPORT_DIR"; then
  echo "Potential secret in evidence; redact it before continuing." >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  find "$REPORT_DIR" -type f -print0 | sort -z | xargs -0 sha256sum \
    > "$REPORT_DIR/SHA256SUMS"
else
  find "$REPORT_DIR" -type f -print0 | sort -z | xargs -0 shasum -a 256 \
    > "$REPORT_DIR/SHA256SUMS"
fi
```

Record every deviation as a blocking issue before accepting the release. A run
with a missing published tag, an unpublished fix, skipped Storage bytes, changed
counts, an unexplained outbound request, or an undocumented infrastructure edit
is `BLOCKED`, not a partial pass.
