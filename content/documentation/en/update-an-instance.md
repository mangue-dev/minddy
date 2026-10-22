---
{
  "id": "update-an-instance",
  "locale": "en",
  "title": "Instance updates",
  "summary": "Upgrade one published release at a time.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Update an instance without losing recovery"
  ],
  "figures": [
    {
      "id": "update-an-instance-flow",
      "kind": "diagram",
      "src": "/documentation/en/update-an-instance-flow.svg",
      "alt": "Diagram: Stop writes and scheduled work. Seal a complete pre-update backup. Target migrations, then target application. Verify recovery and reopen access.",
      "caption": "Read the stages in order. Stop writes and scheduled work. Seal a complete pre-update backup. Target migrations, then target application. Verify recovery and reopen access.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Stop writes and scheduled work"
          },
          {
            "title": "Seal a complete pre-update backup"
          },
          {
            "title": "Target migrations, then target application"
          },
          {
            "title": "Verify recovery and reopen access"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "update-an-instance-flow"
  ]
}
---

## Prepare the next release {#update-an-instance}

Upgrade one published release at a time. Inspect release notes, migration differences and compatibility rows. Do not combine a minddy update with a PostgreSQL major or Supabase image change. Verify target source, asset checksums and OCI digest and prepare it in a separate release directory with frozen dependencies. Announce the outage and abort deadline. Confirm a usable off-host backup and recent restoration. Preserve the current restartable application and its protected environment.

Some migrations permanently delete data of retired features. Updating from v0.11.0 to v0.20.0 removes the custom domain records, the code-agent runs and conversations with their history and connections, and the command palette's saved views (personal bookmarks; board views remain). After these migrations, only the complete pre-update backup can bring them back.


![Diagram: Stop writes and scheduled work. Seal a complete pre-update backup. Target migrations, then target application. Verify recovery and reopen access.](/documentation/en/update-an-instance-flow.svg)

## Update the full reference profile {#full}

Use the [installed full-profile Compose context](/docs/backups-and-restoration#context). Stop public ingress, all writes, workers and scheduler, then make the complete sealed backup. Copy the current environment mode `0600` to `TARGET_ENV_FILE` and change only `MINDDY_RELEASE`, `MINDDY_IMAGE`, `MINDDY_DEPLOY_DIR` and `MINDDY_ENV_FILE` for the verified target. Preserve URLs, credentials, encryption keys and feature choices. Delete `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` and the Vercel Sandbox variables `VERCEL_TOKEN`, `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID` if an earlier release left them: the application no longer reads them, and `--remove-orphans` removes the retired `agent-runner` container. Run the sequence below from the installed context. It starts only backend dependencies, applies target migrations and checks application readiness while scheduler and Caddy remain stopped.

For the v0.10.30 to v0.11.0 update, the target introduces `MINDDY_DATA_ROOT_KEY`. Add it only when the existing configuration has no root; preserve every existing credential-encryption secret. The command below writes a new 32-byte root directly to the protected target file without displaying it and refuses to replace an invalid saved value. When the source is v0.11.0 or later, the root normally exists and the command only checks it. A root alone does not enable workspace-content encryption: an environment without `MINDDY_CONTENT_ENCRYPTION_ENABLED=true` keeps it disabled.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node --input-type=module <<'NODE'
import {readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnvironment} from './scripts/self-hosting-install.mjs';
const file = process.env.TARGET_ENV_FILE;
const text = readFileSync(file, 'utf8');
const values = parseEnvironment(text);
if (Object.hasOwn(values, 'MINDDY_DATA_ROOT_KEY')) {
  if (!/^[a-f0-9]{64}$/i.test(values.MINDDY_DATA_ROOT_KEY)) {
    throw new Error('Recover the valid existing root key; do not replace it.');
  }
} else {
  writeFileSync(file, text + '\nMINDDY_DATA_ROOT_KEY=' + randomBytes(32).toString('hex') + '\n', {mode: 0o600});
  chmodSync(file, 0o600);
}
NODE
SUPABASE_DB_URL="$(node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {parseEnvironment,fullBootstrapDatabaseUrl} from "./scripts/self-hosting-install.mjs";
  console.log(fullBootstrapDatabaseUrl(parseEnvironment(readFileSync(process.env.TARGET_ENV_FILE,"utf8"))));
')"
node scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy
compose up -d --wait --remove-orphans minddy
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Keep managed and source operations separate {#managed-source}

Managed OCI uses the same protected target-environment and image sequence, with provider-controlled backup and database/Storage migration access rather than starting local backend services. Source delivery builds the target tag, blocks public API writes, performs a logical/provider backup, applies bootstrap using target code and starts the target production service behind maintenance. Do not substitute a source process to validate an OCI update. Do not start old code against changed schema unless the release explicitly guarantees compatibility.


The local Compose commands in the following source procedure apply only when the operator controls that backend. With provider-managed Supabase, replace backend stop/start and migration access with the provider’s supported operations, retain the protected minddy environment and complete provider data backup, then run the verified target application.


For the source procedure, set `MINDDY_REPO` to the tagged source repository, `SUPABASE_COMPOSE_DIR` to the operator-controlled backend from the [logical backup context](/docs/backups-and-restoration#outage), `TO_TAG` to the actual next published and verified tag, and `TARGET_RELEASE_DIR` to its separately built checkout. Supply the matching database and public API variables privately. After bootstrap and verification, start the target with `pnpm start` or your existing process supervisor behind maintenance, then reopen only after the checks below.

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$MINDDY_PUBLIC_SUPABASE_URL/auth/v1/health"
```

## Verify and reopen deliberately {#verify}

Run maintenance doctor before public ingress and jobs, then ordinary doctor after reopening. Sign in, verify retained project/issue identifiers, create/edit demo work, upload/download an attachment and compare its SHA-256, check Realtime and one harmless job. Confirm a revoked integration key still fails. Record image digest and migration history. On failure, keep the failed stack stopped; incompatible post-migration rollback restores the complete pre-update set on a blank target. There are no generated down migrations.
