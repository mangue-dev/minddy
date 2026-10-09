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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "components/documentation/documentation-navigation.tsx",
      "components/documentation/documentation-article.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun); agent:/root (installation article labeled as supporting reference; primary wizard entry points verified; existing figures and procedural evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 en network guidance and terminology review); agent:/root (en installation-reference title review)",
    "date": "2026-10-09"
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
      "alt": "Diagram: Verified release and protected environment. Installer: full reference profile. Official Supabase, app, scheduler, runner. Account, file and recovery acceptance.",
      "caption": "Read the stages in order. Verified release and protected environment. Installer: full reference profile. Official Supabase, app, scheduler, runner. Account, file and recovery acceptance.",
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
            "title": "Verified release and protected environment"
          },
          {
            "title": "Installer: full reference profile"
          },
          {
            "title": "Official Supabase, app, scheduler, runner"
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        1051
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
      "revision": 6,
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

Install a self-hosted instance from a verified release and the matching profile: full, managed Supabase or source. Establish compatibility and check the published runner limits first, then follow the selected installation procedure and acceptance checks before admitting users. The documented v0.11.0 engineering workaround is an explicit tooling variant, not a corrected published release.

## MCP availability and network access {#mcp-network-access}

MCP is included in self-hosted minddy and starts with the application. It works out of the box at `/api/mcp` on the instance origin configured with `MINDDY_PUBLIC_APP_URL`. OAuth discovery and dynamic client registration are included: you do not need a separate MCP server, a dedicated OAuth application or a minddy Cloud proxy. Connect your MCP client to your instance endpoint, then sign in and grant access through the browser consent flow.

Availability does not guarantee network reachability. Both the MCP client and the browser used for authorization must be able to reach the advertised MCP and OAuth URLs. If you configure an explicit `OAUTH_ISSUER` override, that origin must also be reachable. The client must support the connection, OAuth flow and chosen network path; some clients require HTTPS even on private networks.

Choose an origin reachable from the MCP client and its authorization browser. On the same computer, a compatible client can use `http://localhost:6463/api/mcp`. On another LAN/VPN computer, use the server’s configured address, for example `http://192.168.1.50/api/mcp`, with its listening address, application port, firewall and routing allowing access. `localhost` and `127.0.0.1` always point to the computer making the connection, so the server’s localhost URL will not work there. A loopback-only process remains unreachable directly. Outside the private network, use a reachable HTTPS endpoint such as `https://tickets.example.com/api/mcp` or a supported network path, subject to client requirements. A hosted agent needs that route too; local hosting does not automatically expose the instance to the Internet.

[Read the MCP network guidance before connecting a remote client](/docs/minddy-mcp#network-access).

## Select a supported release and installation profile {#self-hosted-compatibility}

Use an immutable release from the public `mangue-dev/minddy` repository. The v0.11.0 compatibility row supports Linux amd64 and arm64 production hosts, Node.js 24, `pnpm` 10.28.0, Docker Engine 27.0.0 or later and Compose plugin 2.29.0 or later. The full profile pins official Supabase `self-hosted/v0.7.2` at commit `549db119c44c25167461812041ba198bde2b31a4`. Keep its complete image set; upgrading one service separately creates an operator-managed variant.

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

### Known runner limits in the published release {#known-runner-limits}

The published v0.11.0 runner has additional code-execution blockers: it rejects sandbox names with the allocation suffix, writes base64 file chunks larger than Linux permits in one environment value, and initializes a UID-10001, mode-`0700` temporary store as root after dropping all capabilities. The last command can fail without its exit being checked, leaving the working directory absent. A healthy runner endpoint does not validate cloning or code execution. The current candidate corrects these paths; a disposable rehearsal used the current runner and storage helper as explicit read-only mounts on the v0.11.0 image. This does not produce a corrected published image or a new supported compatibility row. Obtain a corrected release/tooling combination and run the code-work acceptance checks before enabling code agents for a team.

The Git relay in v0.11.0 also omits the HTTP Basic challenge, preventing an ordinary Git client from sending its credentials. The [pinned engineering workaround](/docs/installation#runner-workaround) supplies matching runner files and their checksums; it does not change the published image or create a supported release.

The published application image includes Node.js and Git but deliberately removes `npm`, `npx` and Corepack. The reference Compose profile also selects that image for workers through `AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE`. This is insufficient for a fresh code worker: the OpenCode bootstrap uses `npm` to install its pinned runtime and plugin, even for a repository with no project dependencies. Without `npm`, execution stops at bootstrap; no project edit or test success can be inferred from the conversation. Use an operator-built and verified dedicated worker image with Node.js 24, `npm`, Git and the project’s required tools, selected by overriding `AGENT_RUNNER_SANDBOX_IMAGE` in the runner service. Keep the runner’s isolation constraints. Verify bootstrap, repository cloning, actual tests and the resulting diff before enabling code delegation. Fixing the runner files alone does not supply this worker toolchain.

The pinned storage helper also makes the sandbox workspace executable. Docker otherwise mounts this tmpfs with `noexec`, preventing the native OpenCode binary from starting and potentially surfacing a misleading musl-package fallback error. The correction retains `nosuid`, `nodev`, UID/GID 10001, mode `0700`, read-only root filesystem, dropped capabilities and the disposable per-sandbox store. It does not grant executable access to host data or make the application image a suitable worker image.

## Install the reference server profile {#install-a-server}

Start from a verified tagged checkout and immutable image digest. Linux amd64 and arm64 are supported. Allow 4 GB RAM, two cores and 20 GB SSD for managed Supabase; allow 8 GB RAM, four cores and 60 GB SSD when Supabase shares the host. Public service requires DNS and HTTPS on your own origins. HTTP is accepted only on `localhost` or a private IPv4 network. Restrict private HTTP to a trusted LAN and never forward router ports. The full profile exposes the app on port 80 and its API on 8000 in that mode.


![Diagram: Verified release and protected environment. Installer: full reference profile. Official Supabase, app, scheduler, runner. Account, file and recovery acceptance.](/documentation/en/install-a-server-flow.svg)


![Public installation wizard with Supabase on the same server selected.](/documentation/en/install-a-server-wizard.png)

### Configure and run the installer {#install}

Run `pnpm self-host:install` from the release directory. Select managed or full, your application origin and administrator address. For full, first fetch the pinned upstream checkout. The installer writes a mode-`0600` environment, generates distinct missing secrets, pulls the selected profile, starts it and runs idempotent bootstrap. It retains an existing image pin and secrets. The example uses the `IMAGE` digest [verified in the compatibility section](#verify-release). For real Auth email, add `--skip-start` first, then configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` and `SMTP_SENDER_NAME` in the protected file before rerunning. Keep `ENABLE_EMAIL_AUTOCONFIRM=false`. The placeholder `supabase-mail` is not a production inbox.


Before starting, compare `MINDDY_RELEASE` and `MINDDY_IMAGE` in the protected file with the selected compatibility row and verified container asset. The v0.11.0 deployment template still says 0.10.30, and `--image` changes only the image reference; there is no `--release` flag. For a new v0.11.0 installation prepared with `--skip-start`, set `MINDDY_RELEASE=0.11.0` explicitly and keep the verified immutable image reference. Do not replace generated credentials or encryption keys. Never infer a supported 0.11.1 profile from the candidate package version: it has no compatibility row in this snapshot.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


The command above creates `deploy/self-hosted/.env` in the selected release directory. Edit that protected file before starting. For the v0.11.0 engineering variant documented here, stop the automatic installer at this configuration stage: follow the [pinned runner and worker procedure](/docs/installation#runner-workaround), then the [explicit full-profile start](/docs/installation#adapted-start). Do not rerun the historical installer without `--skip-start`: it omits the required overlay and cannot complete this variant. Existing origins, image and secrets remain in the protected file.

### Check before admitting users {#accept}

The reference profiles include the scheduler and trusted sandbox runner. Never publish runner port 6464 or PostgreSQL to the Internet. Run the doctor with the installed environment and full-profile upstream Compose file. Test confirmation, sign-in, MFA, reset, project and issue creation, attachment upload/download and Realtime in two sessions. A 200 response from `/api/health` only proves application liveness. If interrupted, resume the explicit adapted sequence with the same Compose context and protected environment; do not reset data. Establish an off-host backup and blank-target restore before onboarding a team.

### Runner prerequisites for the server profile {#install-a-server-known-runner-limits}

The [published runner limits](#known-runner-limits) affect cloning and code execution even when health checks pass. For the documented v0.11.0 variant, apply the pinned runner files and dedicated worker image below before enabling code agents; this variant does not create a new supported release.

### Apply the pinned engineering workaround {#runner-workaround}

For the published v0.11.0 image, the following explicit tooling variant also supplies the Basic authentication challenge required by Git HTTP clients. It is a workaround pinned to source commit `89ab340cb10ec729948fc6e596fb7ab0326fc470`, not a newly published image or compatibility row. Prepare the base configuration first; apply this variant before starting the full stack. The two files must stay together, at their verified hashes, on persistent storage. These commands expose no runner port.

First set the installed context in [the reference backup procedure](/docs/backups-and-restoration#context). Its Compose function must include `RUNNER_FIX_OVERRIDE`. Then download and verify the two public files below. A mismatch is an abort condition.

This procedure also builds a separate code-worker image. The application image lacks `npm` and cannot bootstrap a fresh code worker; the separate image is required.  The base is pinned, but Debian packages are resolved at build time; inspect the resulting Docker image ID and retain that exact image with the backup. Never substitute the application image after a restore. Building requires access to the base registry and Debian package repositories; fresh OpenCode bootstrap also needs the `npm` registry. The recipe supplies the bootstrap tools, not every project’s dependencies. Additional build tools require an explicitly maintained variant. The Compose overlay below sets the runner service’s image environment directly because the historical reference Compose file ignores a standalone `AGENT_RUNNER_SANDBOX_IMAGE` value in the protected file.

```bash
set -euo pipefail
RUNNER_FIX_COMMIT=89ab340cb10ec729948fc6e596fb7ab0326fc470
export RUNNER_FIX_DIR="/srv/minddy/runner-fix-$RUNNER_FIX_COMMIT"
export RUNNER_FIX_OVERRIDE="$RUNNER_FIX_DIR/compose.runner-fix.yml"
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
for file in agent-runner.mjs agent-runner-storage.mjs; do
  curl --fail --show-error --location \
    "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/$file" \
    -o "$RUNNER_FIX_DIR/$file"
done
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' \
    '31631296f9559a0367237bc02fc6387f300eee39bb14681a973d83988ccb7b17  agent-runner.mjs' \
    '501e6c92605ca2b4ec32d13599dfd645f285b08c5092860686b5838691f09b5b  agent-runner-storage.mjs' > SHA256SUMS
  sha256sum --check SHA256SUMS
)
cat > "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" <<'DOCKERFILE'
# syntax=docker/dockerfile:1.7

# Code workers bootstrap the pinned OpenCode runtime with npm. The application
# image deliberately omits package managers and cannot serve as this image.
FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git libpcre2-8-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 minddy \
    && useradd --uid 10001 --gid minddy --create-home --shell /usr/sbin/nologin minddy

ENV HOME=/vercel/home
ENV npm_config_cache=/vercel/npm-cache
USER minddy
WORKDIR /

CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
DOCKERFILE
docker build --pull -t minddy-agent-sandbox:operator \
  -f "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" "$RUNNER_FIX_DIR"
export RUNNER_SANDBOX_IMAGE="$(docker image inspect minddy-agent-sandbox:operator --format '{{.Id}}')"
printf '%s\n' "$RUNNER_SANDBOX_IMAGE" > "$RUNNER_FIX_DIR/sandbox-image.txt"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint sh "$RUNNER_SANDBOX_IMAGE" \
  -c 'node --version && npm --version && git --version && id -u'
cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: "$RUNNER_SANDBOX_IMAGE"
    volumes:
      - "$RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro"
      - "$RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro"
EOF
compose up -d --no-deps --force-recreate agent-runner
compose exec -T agent-runner node --input-type=module -e \
  'const r=await fetch("http://127.0.0.1:6464/health"); if(!r.ok) process.exit(1); console.log(r.status);'
```

The `compose up` command recreates only the runner. Its health response is still insufficient acceptance: verify a new sandbox, repository cloning, a file larger than 1 MiB, tests and the resulting diff before admitting code agents. Keep `RUNNER_FIX_OVERRIDE` and `RUNNER_FIX_DIR` in every operational shell. The historical installer and update helper do not consume this shell override; after either changes or recreates the runner, reapply this Compose command. Include both files and the override in your encrypted backup, and restore their absolute paths before restarting the runner.

Keep the dedicated worker image configured above. The application image cannot bootstrap a fresh worker because it lacks `npm`; see the [worker toolchain requirements](#known-runner-limits) before substituting an image.

### Start the explicitly adapted full profile {#adapted-start}

The unchanged v0.11.0 installer cannot complete this engineering variant: its image omits the helper, its function pin disagrees with the frozen dependency, and it does not accept the runner overlay above. For this variant, prepare configuration with `--skip-start` and apply the pinned tooling before the first start. Use the following full-profile sequence instead of rerunning the historical installer without `--skip-start`. The pin replacement is an explicit modification of the deployment tooling, not an alteration of the published tag. Preserve the original pin with the release evidence.

If you run this full profile on macOS Docker Desktop, apply the [filesystem Storage volume override](/docs/storage-and-attachments#docker-desktop) before the first start and retain `RESTORE_OVERRIDE` alongside the runner override. The Linux host bind-mount layout and this named-volume profile require different byte archives; use the matching backup and restoration procedure.

```bash
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/functions-bundle.json" \
  -o "$RUNNER_FIX_DIR/functions-bundle.json"
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' '7fae1ec49c6a75fcd34d3fae7513e140eead1c2146753f2a4200f30eeb2bf202  functions-bundle.json' | sha256sum --check
)
if [ ! -e "$RUNNER_FIX_DIR/functions-bundle.tagged.json" ]; then
  install -m 0644 deploy/self-hosted/functions-bundle.json "$RUNNER_FIX_DIR/functions-bundle.tagged.json"
fi
install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" deploy/self-hosted/functions-bundle.json
compose pull --quiet
node --input-type=module -e \
  'const m=await import("./scripts/prepare-self-hosted-functions.mjs"); m.prepareFunctionsBundle({supabaseDir:process.env.SUPABASE_DIR,envFile:process.env.MINDDY_ENV_FILE});'
compose up -d --pull never --wait --wait-timeout 120
node --input-type=module <<'NODE'
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnvironment, fullBootstrapDatabaseUrl, fullMaintenanceApiUrl } from "./scripts/self-hosting-install.mjs";
const envFile = process.env.MINDDY_ENV_FILE;
const values = parseEnvironment(readFileSync(envFile, "utf8"));
const result = spawnSync(process.execPath, ["scripts/bootstrap-supabase.mjs",
  "--db-url", fullBootstrapDatabaseUrl(values), "--env-file", envFile,
  "--existing-env", "--enable", "scheduler", "--supabase-url", fullMaintenanceApiUrl(values)], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env,
    MINDDY_PUBLIC_APP_URL: values.MINDDY_PUBLIC_APP_URL,
    MINDDY_PUBLIC_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
    MINDDY_PUBLIC_SUPABASE_ANON_KEY: values.MINDDY_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY },
});
writeFileSync(`${envFile}.bootstrap.log`, `${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600 });
chmodSync(`${envFile}.bootstrap.log`, 0o600);
if (result.error || result.status !== 0) {
  console.error("Bootstrap failed; inspect the protected diagnostic log locally.");
  process.exit(1);
}
console.log("Bootstrap completed.");
NODE
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

The wrapper reads the protected file as data, derives the private maintenance URLs using the same exported helpers as the installer, and runs the original bootstrap with scheduler prerequisites. Its diagnostic log remains mode `0600`; do not attach it to a public report without inspecting and redacting it. An unsuccessful phase must stop the procedure. The doctor must use the same adapted context; it validates services, not code-worker acceptance or delivery by external providers.

The [storage-helper correction](#known-runner-limits) is also required for the sandbox to execute OpenCode. Retain that helper together with the runner files and dedicated worker image when backing up or restoring this variant.

## Install with managed Supabase or from source {#managed-or-source-installation}

Managed Supabase describes who operates the backend. It can accompany the official OCI application profile or a source application server. Keep these deployments distinct in installation and acceptance records. Your backend must expose PostgreSQL, Auth, Storage and Realtime. For the guided managed OCI profile, supply a project on supabase.com, its public URL, anon and service-role keys and a PostgreSQL connection reachable from bootstrap tooling. Use your own project; minddy Cloud credentials are not installation inputs.


![Diagram: Your managed Supabase project. PostgreSQL, Auth, Storage, Realtime. OCI profile OR tagged source application. Profile-specific jobs and backup procedure.](/documentation/en/managed-or-source-installation-flow.svg)

### Install the managed OCI profile {#managed}

From the verified release directory, run the guided command below. `IMAGE` is the digest [verified in the compatibility section](#verify-release). Values containing ... are examples, not usable credentials. Obtain real values privately and avoid command history or shared logs containing secrets. The installer preserves an existing protected environment, includes its scheduler and runner and keeps optional services off until configured. Configure Auth SMTP and exact redirects separately in your Supabase project.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

### Complete a source deployment {#source}

For source delivery, install frozen dependencies from the tagged checkout, supply the required application and Supabase environment, run bootstrap, build and run the production server behind your reverse proxy. Set runtime `MINDDY_PUBLIC_*` values before startup. You provide a durable scheduler with the authenticated schedules documented in the [scheduled-work section](/docs/instance-configuration#schedules); a source build alone supplies no running jobs. Verify database migrations and Storage, then exercise Auth, issue creation, file bytes and Realtime. Back up this instance through the logical/provider procedure. Do not test an OCI installation by switching to a source server.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
