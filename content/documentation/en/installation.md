---
{
  "id": "installation",
  "locale": "en",
  "title": "Installation reference",
  "summary": "Choose a verified release and installation profile, install the full, managed or source profile and check its operating limits.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01",
    "H03",
    "H04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "components/documentation/documentation-navigation.tsx",
      "components/documentation/documentation-article.tsx",
      "desktop/src/local-installer.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (MIN-847 installer question checked against scripts/self-hosting-install.mjs and lib/desktop/local-installer.ts); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the introduction now points a private instance on your own computer to the desktop app's built-in installer; no installation run, no screenshot recaptured, existing figures carried forward unchanged)",
    "language": "agent:claude-code (en MIN-847 sentence; self-reviewed; agent review, not human acceptance); agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-788 changed passages; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "authentication-and-email",
    "backups-and-restoration",
    "instance-configuration"
  ],
  "aliases": [
    "self-hosted-compatibility",
    "install-a-server",
    "self-hosting",
    "managed-or-source-installation"
  ],
  "tags": [
    "Select a supported release and installation profile",
    "Install the reference server profile",
    "Install with managed Supabase or from source"
  ],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/en/self-hosted-compatibility-flow.svg",
      "alt": "Diagram: Annotated source tag. Assets and SHA256SUMS. Official OCI signature and digest. Selected compatibility profile.",
      "caption": "Read the stages in order. Annotated source tag. Assets and `SHA256SUMS`. Official OCI signature and digest. Selected compatibility profile.",
      "revision": 13,
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
            "title": "Annotated source tag"
          },
          {
            "title": "Assets and `SHA256SUMS`"
          },
          {
            "title": "Official OCI signature and digest"
          },
          {
            "title": "Selected compatibility profile"
          }
        ]
      }
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/en/install-a-server-flow.svg",
      "alt": "Diagram: Verified release and protected environment. Installer: full reference profile. Official Supabase, app, scheduler. Account, file and recovery acceptance.",
      "caption": "Read the stages in order. Verified release and protected environment. Installer: full reference profile. Official Supabase, app, scheduler. Account, file and recovery acceptance.",
      "revision": 13,
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
            "title": "Verified release and protected environment"
          },
          {
            "title": "Installer: full reference profile"
          },
          {
            "title": "Official Supabase, app, scheduler"
          },
          {
            "title": "Account, file and recovery acceptance"
          }
        ]
      }
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/en/install-a-server-wizard.png",
      "alt": "Public installation wizard with Supabase on the same server selected.",
      "caption": "The full profile keeps the application and Supabase on your server. In this example, their private network access is restricted to the LAN.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        944,
        1090
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/en/managed-or-source-installation-flow.svg",
      "alt": "Diagram: Your managed Supabase project. PostgreSQL, Auth, Storage, Realtime. OCI profile OR tagged source application. Profile-specific jobs and backup procedure.",
      "caption": "A managed backend can serve either deployment method, with scheduling and backups configured for the chosen profile.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Your managed Supabase project"
          },
          {
            "title": "PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "OCI profile OR tagged source application"
          },
          {
            "title": "Profile-specific jobs and backup procedure"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Install a self-hosted instance from a verified release and the matching profile: full, managed Supabase or source. Establish compatibility first, then follow the selected installation procedure and acceptance checks before admitting users. To run a private instance on your own computer instead, use the desktop app's installer described in [local instances](/docs/install-locally#install-locally).

## MCP availability and network access {#mcp-network-access}

MCP is included in self-hosted minddy and starts with the application. It works out of the box at `/api/mcp` on the instance origin configured with `MINDDY_PUBLIC_APP_URL`. OAuth discovery and dynamic client registration are included: you do not need a separate MCP server, a dedicated OAuth application or a minddy Cloud proxy. Connect your MCP client to your instance endpoint, then sign in and grant access through the browser consent flow.

Availability does not guarantee network reachability. Both the MCP client and the browser used for authorization must be able to reach the advertised MCP and OAuth URLs. If you configure an explicit `OAUTH_ISSUER` override, that origin must also be reachable. The client must support the connection, OAuth flow and chosen network path; some clients require HTTPS even on private networks.

Choose an origin reachable from the MCP client and its authorization browser. On the same computer, a compatible client can use `http://localhost:6463/api/mcp`. On another LAN/VPN computer, use the server’s configured address, for example `http://192.168.1.50/api/mcp`, with its listening address, application port, firewall and routing allowing access. `localhost` and `127.0.0.1` always point to the computer making the connection, so the server’s localhost URL will not work there. A loopback-only process remains unreachable directly. Outside the private network, use a reachable HTTPS endpoint such as `https://tickets.example.com/api/mcp` or a supported network path, subject to client requirements. A hosted agent needs that route too; local hosting does not automatically expose the instance to the Internet.

[Read the MCP network guidance before connecting a remote client](/docs/minddy-mcp#network-access).

## Select a supported release and installation profile {#self-hosted-compatibility}

Use an immutable release from the public `mangue-dev/minddy` repository and read the requirements from the row of `deploy/self-hosted/compatibility.json` whose `minddyRelease` matches it. A package version without its own row is not a supported self-hosted release. Every published row supports Linux amd64 and arm64 production hosts, Node.js 24, `pnpm` 10.28.0, Docker Engine 27.0.0 or later and Compose plugin 2.29.0 or later. The full profile pins official Supabase `self-hosted/v0.8.3` at commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`. Keep its complete image set; upgrading one service separately creates an operator-managed variant.

The managed profile connects to a Supabase project on supabase.com. It must expose PostgreSQL, Auth, Storage and Realtime and pass the release verification. PostgreSQL alone is insufficient. The Supabase CLI local stack is for development and evaluation, not a public production service.


![Diagram: Annotated source tag. Assets and SHA256SUMS. Official OCI signature and digest. Selected compatibility profile.](/documentation/en/self-hosted-compatibility-flow.svg)

### Verify before execution {#verify-release}

Check the annotated tag, release assets, `SHA256SUMS` and official OCI signature before installing dependencies or executing the release. The following Bash commands start in the selected tagged checkout and leave `IMAGE` set to its verified digest. Stop on a failed check. Install Cosign using its official instructions first. The command preserves source and image identity; it does not prove the deployment works.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

### Plan operation and upgrades {#support}

Install one published release at a time. Migrations are forward-only; incompatible rollback restores a matching database, Storage, configuration and application set. minddy maintains release tooling and offers best-effort diagnosis of reproducible core defects. You operate DNS, TLS, host capacity, backups, restore drills and optional providers. A moving image tag or derivative Supabase stack does not inherit the release support contract.

The published v0.11.0 profiles also start an `agent-runner` service that fails before the application becomes healthy. Later releases remove that runner and its code sandboxes entirely: Numo does not run code, and no service receives the Docker socket. Install such a release rather than adapting v0.11.0.


## Install the reference server profile {#install-a-server}

Start from a verified tagged checkout and immutable image digest. Linux amd64 and arm64 are supported. Allow 4 GB RAM, two cores and 20 GB SSD for managed Supabase; allow 8 GB RAM, four cores and 60 GB SSD when Supabase shares the host. Public service requires DNS and HTTPS on your own origins. HTTP is accepted only on `localhost` or a private IPv4 network. Restrict private HTTP to a trusted LAN and never forward router ports. The full profile exposes the app on port 80 and its API on 8000 in that mode.


![Diagram: Verified release and protected environment. Installer: full reference profile. Official Supabase, app, scheduler. Account, file and recovery acceptance.](/documentation/en/install-a-server-flow.svg)


![Public installation wizard with Supabase on the same server selected.](/documentation/en/install-a-server-wizard.png)

### Configure and run the installer {#install}

Run `pnpm self-host:install` from the release directory. Select managed or full, your application origin and administrator address. For full, first fetch the pinned upstream checkout. The installer writes a mode-`0600` environment, generates distinct missing secrets, pulls the selected profile, starts it and runs idempotent bootstrap. It retains an existing image pin and secrets. The installer also asks whether to encrypt workspace content; `--encryption enabled` (the default) or `--encryption disabled` answers non-interactively, and it writes `MINDDY_CONTENT_ENCRYPTION_ENABLED` with an independent `MINDDY_DATA_ROOT_KEY`. A rerun keeps the saved choice and refuses a conflicting one; see [workspace encryption](/docs/workspace-encryption#workspace-encryption) before changing it. It also asks whether administrators may edit instance variables from the admin dashboard; `--config-overrides enabled` (the default) or `--config-overrides disabled` answers non-interactively and writes `MINDDY_CONFIG_OVERRIDES`. See [edit the instance variables](/docs/instance-administration#instance-variables). The example uses the `IMAGE` digest [verified in the compatibility section](#verify-release). For real Auth email, add `--skip-start` first, then configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` and `SMTP_SENDER_NAME` in the protected file before rerunning. Keep `ENABLE_EMAIL_AUTOCONFIRM=false`. The placeholder `supabase-mail` is not a production inbox.


Before starting, compare `MINDDY_RELEASE` and `MINDDY_IMAGE` in the protected file with the selected compatibility row and verified container asset. The installer copies `MINDDY_RELEASE` from the release's deployment template, and `--image` changes only the image reference; there is no `--release` flag. The v0.11.0 template, for example, still says 0.10.30. When the value differs from the release you install, prepare the file with `--skip-start`, set `MINDDY_RELEASE` to that release explicitly and keep the verified immutable image reference. Do not replace generated credentials or encryption keys.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


The command above creates `deploy/self-hosted/.env` in the selected release directory. Edit that protected file, then rerun the same command without `--skip-start` to start the profile and run bootstrap. Existing origins, image and secrets remain in the protected file.

If you run this full profile on macOS Docker Desktop, apply the [filesystem Storage volume override](/docs/storage-and-attachments#docker-desktop) before the first start and retain `RESTORE_OVERRIDE` for every later Compose operation. The Linux host bind-mount layout and this named-volume profile require different byte archives; use the matching backup and restoration procedure.

### Check before admitting users {#accept}

The reference profiles include the scheduler; they contain no code runner and mount no Docker socket. Never publish PostgreSQL or internal service ports to the Internet. Run the doctor with the installed environment and full-profile upstream Compose file. Test confirmation, sign-in, MFA, reset, project and issue creation, attachment upload/download and Realtime in two sessions. A 200 response from `/api/health` only proves application liveness. If interrupted, rerun the installer with the same Compose context and protected environment; do not reset data. Establish an off-host backup and blank-target restore before onboarding a team.




## Install with managed Supabase or from source {#managed-or-source-installation}

Managed Supabase describes who operates the backend. It can accompany the official OCI application profile or a source application server. Keep these deployments distinct in installation and acceptance records. Your backend must expose PostgreSQL, Auth, Storage and Realtime. For the guided managed OCI profile, supply a project on supabase.com, its public URL, anon and service-role keys and a PostgreSQL connection reachable from bootstrap tooling. Use your own project; minddy Cloud credentials are not installation inputs.


![Diagram: Your managed Supabase project. PostgreSQL, Auth, Storage, Realtime. OCI profile OR tagged source application. Profile-specific jobs and backup procedure.](/documentation/en/managed-or-source-installation-flow.svg)

### Install the managed OCI profile {#managed}

From the verified release directory, run the guided command below. `IMAGE` is the digest [verified in the compatibility section](#verify-release). Values containing ... are examples, not usable credentials. Obtain real values privately and avoid command history or shared logs containing secrets. The installer preserves an existing protected environment, includes its scheduler and keeps optional services off until configured. Configure Auth SMTP and exact redirects separately in your Supabase project.

The published v0.11.0 `managed` OCI profile has the same failing runner as the `full` profile, so its unchanged installer cannot complete startup; use a later release without the runner. The command below prepares configuration with `--skip-start`. Review that protected file while preserving the verified image and generated secrets, then rerun the command without `--skip-start`. Verify the `managed` profile before admitting users. Do not run full-profile local backend commands against a provider project.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE" --skip-start
```

### Complete a source deployment {#source}

For source delivery, install frozen dependencies from the tagged checkout, supply the required application and Supabase environment, run bootstrap, build and run the production server behind your reverse proxy. Set runtime `MINDDY_PUBLIC_*` values before startup. You provide a durable scheduler with the authenticated schedules documented in the [scheduled-work section](/docs/instance-configuration#schedules); a source build alone supplies no running jobs. Verify database migrations and Storage, then exercise Auth, issue creation, file bytes and Realtime. Back up this instance through the logical/provider procedure. Do not test an OCI installation by switching to a source server.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
