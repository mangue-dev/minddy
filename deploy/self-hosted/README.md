# Self-hosted deployment assets

This directory is reserved for versioned minddy self-hosting assets. It belongs
to the public main repository; no second deployment repository is part of the
supported distribution.

## Reference Compose profiles

Both profiles use the release-pinned images recorded in `compatibility.json`.
Copy `.env.example` to a protected `.env`, replace every placeholder, and use
the tagged release directory rather than a development checkout. The guided
file deliberately contains only deployment settings; use the root
[`../../.env.example`](../../.env.example) for an exhaustive list of optional
application integrations.

For the normal first installation, prefer `pnpm self-host:install`. It makes
the same configuration explicit, refuses to replace an existing environment
file, and then starts the profile and bootstrap. Run `pnpm self-host:doctor`
afterward for a redacted health and configuration report. The manual commands
below remain the advanced/operator-controlled path.

### Managed Supabase

Use `compose.managed.yml` when the operator already has a compatible managed or
self-hosted Supabase project. It starts minddy and Caddy; it never starts,
copies, or changes Supabase services.

```bash
export MINDDY_DEPLOY_DIR=/srv/minddy/release/deploy/self-hosted
cp "$MINDDY_DEPLOY_DIR/.env.example" "$MINDDY_DEPLOY_DIR/.env"
chmod 600 "$MINDDY_DEPLOY_DIR/.env"
# Edit $MINDDY_DEPLOY_DIR/.env, including the existing Supabase URL and keys.
docker compose --env-file "$MINDDY_DEPLOY_DIR/.env" \
  -f "$MINDDY_DEPLOY_DIR/compose.managed.yml" up -d
```

Enable the opt-in scheduler only after migrations, verification, and monitoring
are ready:

```bash
docker compose --env-file "$MINDDY_DEPLOY_DIR/.env" \
  -f "$MINDDY_DEPLOY_DIR/compose.managed.yml" \
  --profile scheduled-jobs up -d
```

### Official Supabase stack

Use `compose.full.yml` only with the upstream revision recorded in the matching
compatibility row. `scripts/fetch-official-supabase.mjs` creates an isolated
upstream checkout at the pinned commit. It refuses a non-empty target and
verifies both upstream files before Compose reads them. That checkout is an
operator-owned input, not a copy maintained in this repository.

```bash
export MINDDY_RELEASE_DIR=/srv/minddy/release
export MINDDY_DEPLOY_DIR="$MINDDY_RELEASE_DIR/deploy/self-hosted"
export MINDDY_SUPABASE_DIR=/srv/minddy/supabase
node "$MINDDY_RELEASE_DIR/scripts/fetch-official-supabase.mjs" \
  --destination "$MINDDY_SUPABASE_DIR"
cp "$MINDDY_DEPLOY_DIR/.env.example" "$MINDDY_DEPLOY_DIR/.env"
chmod 600 "$MINDDY_DEPLOY_DIR/.env"
# Configure the upstream Docker environment and minddy variables in this file.
docker compose --env-file "$MINDDY_DEPLOY_DIR/.env" \
  -f "$MINDDY_SUPABASE_DIR/docker/docker-compose.yml" \
  -f "$MINDDY_DEPLOY_DIR/compose.full.yml" up -d
```

The full profile removes every upstream host port, including Kong and
Supavisor. Caddy is the only public service. Upstream PostgreSQL and Storage
paths remain persistent exactly as defined by the official distribution; Caddy
uses the named `caddy_data` and `caddy_config` volumes for certificates and
state. Do not change individual upstream service images or make local edits in
`$MINDDY_SUPABASE_DIR`; fetch the next matrix-pinned revision during an upgrade.

## TLS and network boundary

Set `MINDDY_HOST` to the public DNS hostname and provide `CADDY_EMAIL`. Caddy
then obtains and renews certificates automatically, and publishes only ports 80
and 443. Ensure both ports reach the host and DNS resolves to it before starting
the profile. For a pre-existing TLS load balancer, bind Caddy to loopback with
`MINDDY_HTTP_BIND_ADDRESS=127.0.0.1` and configure that balancer to proxy to it.
Set `MINDDY_HOST` to `http://localhost` only for a disposable non-TLS smoke run;
it is not a production setting.

The complete profile also requires `SUPABASE_HOST`; Caddy terminates TLS for it
and sends only API traffic to the upstream Kong service. Studio, PostgreSQL,
Supavisor, and all other internal service ports are never published by the
reference profile.

## Scheduled jobs and checks

`scheduler.mjs` mirrors the schedules in [`../../vercel.json`](../../vercel.json)
and sends authenticated requests only to the internal `minddy` service. It is
behind the `scheduled-jobs` profile so restore and maintenance operators can
leave it off. `CRON_SECRET` is mandatory whenever the profile is enabled.

Routines additionally need an execution backend. The default
`AGENT_EXECUTION_BACKEND=local` supports desktop-initiated work only; it cannot
run scheduled work on the server. To enable routines, set
`AGENT_EXECUTION_BACKEND=vercel` and provide `VERCEL_TOKEN`, `VERCEL_TEAM_ID`,
and `VERCEL_PROJECT_ID` in the protected environment file. The Compose host
does not need to run on Vercel: those credentials authorize its connection to
the operator-owned Vercel Sandbox project.

Run the versioned validation before an operator smoke test:

```bash
node "$MINDDY_RELEASE_DIR/scripts/validate-self-hosted-compose.mjs"
```

It renders both Compose profiles with safe disposable values and confirms that
the pinned Caddy and scheduler images include `linux/amd64` and `linux/arm64`.
For a live smoke test, use a disposable Supabase project and a disposable DNS
name. The command starts a fresh profile, waits for health checks, proves Caddy
serves the app and redirects HTTP to HTTPS, restarts the application and proxy,
and starts scheduled jobs:

```bash
node "$MINDDY_RELEASE_DIR/scripts/smoke-self-hosted-compose.mjs" \
  --profile managed \
  --env-file "$MINDDY_DEPLOY_DIR/.env" \
  --public-url "https://tickets.example.test"
```

After creating a project and attachment, pass an authenticated, stable read URL
with `--persistence-url` to compare its response before and after the restart.
Inspect `docker compose logs scheduler` after the next schedule boundary for the
expected endpoint calls. Record the TLS certificate issuer and the preserved
project and attachment before declaring a public instance ready.
