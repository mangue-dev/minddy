# Plan: Managed forge relay for self-hosted instances

Status: implemented. All six phases are built in this repository; only the
staged rollout (runbook below) remains operational. The control plane lives IN
this repository (decision revised from the original proposal: minddy Cloud is
deployed from this codebase, so the relay API ships behind the same
`MINDDY_EDITION=cloud` + `MINDDY_MANAGED_FORGE=1` gate as managed billing and
AI).

## Problem

The Numo agent needs repository access on github.com and gitlab.com. Today that
access comes from instance-level credentials:

- GitHub: an operator-created GitHub App (`GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID/SECRET`,
  `GITHUB_WEBHOOK_SECRET`), see `lib/server/git/github-app.ts`.
- GitLab: an operator-created OAuth app (`GITLAB_OAUTH_CLIENT_ID/SECRET`), see
  `lib/server/git/gitlab-app.ts`.

Creating a GitHub App is the heaviest step of self-hosted onboarding: it
requires org-admin rights, a private key, and three callback URLs. The agent
itself is not blocked (`lib/server/agent/repo-access.ts` is credential-agnostic);
the friction is purely in obtaining forge credentials.

This plan evaluates and specifies a **managed forge relay**: self-hosted
instances may opt in to using the GitHub App and GitLab OAuth app operated by
minddy, so Numo works out of the box without operator-owned forge apps.

## Why direct credential sharing does not work

- A GitHub App has exactly one webhook URL and one setup URL. Both would point
  at minddy Cloud, so a self-hosted instance would never receive PR events or
  `@numo` mentions (`app/api/webhooks/github/route.ts`).
- Sharing `GITHUB_APP_PRIVATE_KEY` with every operator would let any instance
  mint installation tokens for *every* installation of the official app. This
  is a security non-starter.
- The GitLab OAuth redirect URI must exactly match a URI registered on the
  OAuth app. Arbitrary operator origins cannot be pre-registered.

Therefore the only sound design is a **relay**: minddy Cloud keeps the app
credentials and exposes a narrow, authenticated, audited API; instances talk to
that API and receive relayed webhooks.

## Prior art in open source

This "central app identity + hosted relay for self-hosted instances" pattern is
established:

- **Home Assistant / Nabu Casa** — open-source core plus an operated cloud
  relay (remote access, Alexa/Google) that users explicitly subscribe to; the
  core never requires it.
- **Tailscale vs Headscale** — the coordination/control plane is operated as a
  service; Headscale proves the protocol can be self-hosted, while the managed
  plane removes operational burden.
- **Discord/Telegram bots** — one central app identity, per-tenant installs,
  and the vendor delivers events to the app's server. This is exactly the
  GitHub App model, minus the single-webhook constraint, which the relay
  compensates for.
- **Renovate** — Mend operates the hosted GitHub App; self-hosted Renovate
  brings its own credentials. (Counter-example: no relay, so self-hosters bear
  the setup cost minddy wants to remove.)
- **Sentry, Codecov, Outline, Cal.com** — self-hosted editions generally
  require operator-owned OAuth apps; a relay is the differentiating managed
  service.

Conclusion: the relay is a legitimate, well-precedented managed service, and it
fits the existing editions contract as long as it stays an explicit opt-in that
the core never silently depends on.

## Design overview

Two sides, one protocol:

1. **Control plane** (minddy-operated, implemented in this repository behind
   `MINDDY_EDITION=cloud` + `MINDDY_MANAGED_FORGE=1` — decision revised from
   the original "outside this AGPL repository": Cloud is deployed from this
   codebase): holds the GitHub App private key and GitLab OAuth client secret,
   exposes the relay API, fans webhooks out to registered instances, enforces
   quotas and audit.
2. **Instance client** (this repository, AGPL): a small forge-relay client that
   authenticates the instance to the control plane and plugs into the existing
   token-resolution choke points.

The core keeps working with zero relay configuration; the capability catalog
classifies the relay as a *replaceable* provider of the `github`/`gitlab`
capabilities, never a required one.

### New environment variables

Instance side:

- `MINDDY_FORGE_RELAY_URL` — control plane base URL. Presence alone does not
  activate anything (same rule as `OPENROUTER_API_KEY`).
- `MINDDY_FORGE_RELAY_INSTANCE_ID` + `MINDDY_FORGE_RELAY_SECRET` — instance
  credentials issued at registration (see below).

Cloud side (control plane only, never the open core):

- `MINDDY_MANAGED_FORGE=1` — opt-in flag on the cloud deployment, following the
  `MINDDY_MANAGED_AI` / `MINDDY_MANAGED_BILLING` pattern in
  `lib/managed-services.ts`.

## Instance identity and authentication

- Registration happens through the operator's minddy Cloud account: the
  operator names the instance, and Cloud issues an instance ID plus a secret
  (or, preferred, an Ed25519 keypair where Cloud stores only the public key).
- Every relay request is signed (HMAC-SHA256 over method + path + body +
  timestamp, or an asymmetric JWT) and replay-protected (timestamp window +
  nonce cache).
- Instances can be revoked unilaterally by the operator from the Cloud
  dashboard; revocation kills webhook fan-out and token minting immediately.

## GitHub flows

### Installation claim

The official minddy GitHub App keeps its setup URL pointed at Cloud:

1. Operator clicks "Connect GitHub" on their self-hosted instance.
2. Instance opens Cloud with a short-lived claim code (single use, 10 min TTL).
3. Cloud redirects the operator to the standard GitHub App installation page.
4. After install, the GitHub setup URL lands on Cloud; Cloud binds
   `(installation_id, account)` to the claiming instance and shows a
   confirmation.
5. Instance polls (or receives via relay) the binding result and stores the
   connection via the existing `upsertGithubConnection` path
   (`app/api/git/github/setup/route.ts`), flagged as `source: "relay"`.

Existing local-app installations remain supported. Precedence is
configuration-level for new connections: with a local app configured, new
connections are local. A connection keeps the channel it was established
through (its `source` marker) until it is reconnected via the other one.

### Token minting

New control-plane endpoint, mirroring the existing local scoping rules from
`getInstallationToken` (github-app.ts:181) and `RepoTokenAccess`
(`lib/server/agent/repo-access.ts:61`):

```
POST /relay/github/installation-token
{
  "installationId": ...,
  "repositories": ["repo"],          // required, short names only — same
                                     // constraint as the local path
                                     // (github-app.ts:128-131)
  "permissions": { ... }             // one of the fixed profiles
}
```

Note the schema matches GitHub's API and the local behavior: `repositories`
takes short names only. Cloud resolves each short name against the
installation's account (`owner/repo`) when checking the link mirror, so the
mirror check always operates on full names even though the wire format does
not carry the owner.

- Cloud verifies the instance owns the claimed installation **and** that the
  requested repo is linked to that instance (`project_git_links` equivalent on
  the Cloud side, mirrored from instance link events — see "Link lifecycle
  sync" below).
- Cloud enforces per-instance rate limits, records every mint in an audit log,
  and returns a short-lived token (~1h, as today). The instance-side in-process
  cache behavior is preserved.
- The private key never leaves Cloud.

### Link lifecycle sync

The Cloud-side link mirror is the authorization check for token minting, so it
must track link/unlink events that happen after the initial claim. Without a
sync channel, Cloud would mint tokens for repos the instance has since
unlinked (over-grant) or refuse valid mints.

- **Event channel**: the instance pushes signed link events to
  `POST /relay/links` over the authenticated relay channel:
  `{ event: "linked" | "unlinked", connectionId, repo }`. Cloud applies them
  to its mirror idempotently (last-write-wins by timestamp).
- **Reconciliation**: on instance startup and on a periodic heartbeat, the
  instance pushes a full snapshot of its current links; Cloud diffs and
  repairs its mirror. This heals any lost events (at-least-once delivery means
  the event channel alone is not sufficient).
- **Fail-safe direction**: if the mirror is stale, Cloud errs toward refusing
  mints (fail-closed) rather than granting for an unlinked repo; the
  reconciliation snapshot resolves the discrepancy.

### User authorization (human gestures)

`lib/server/git/github-user-auth.ts` uses the app's client ID/secret for
per-user OAuth so human gestures are attributed to humans (MIN-144). The
user-callback URL is also fixed on the app, so Cloud must broker this flow too:

1. Instance redirects the user to `GET /relay/github/user-authorize` on Cloud
   with instance auth + a signed state containing the instance callback.
2. Cloud runs the standard OAuth code exchange and POSTs the resulting identity
   (or an exchange code for it) back to the instance callback.

### Webhook relay

- Cloud receives all official-app webhooks at its single webhook URL.
- Cloud resolves the target instance(s) from the installation ID, re-signs the
  payload with a dedicated relay webhook secret issued at instance
  registration (derived from `MINDDY_FORGE_RELAY_SECRET`, distinct from
  `GITHUB_WEBHOOK_SECRET`), preserves the `X-GitHub-Delivery` GUID (the
  instance dedup at `app/api/webhooks/github/route.ts:673` keeps working
  unchanged), and POSTs to the instance's registered webhook endpoint.
- Delivery semantics: at-least-once with retry/backoff (e.g. 5 attempts over
  1h), dead-letter after exhaustion, per-instance delivery dashboard on Cloud.
- Instance verification: the GitHub webhook route gains a second accepted
  secret — when a relayed delivery arrives (identified by a relay-specific
  header, e.g. `X-Minddy-Relay: 1`), it verifies against the relay webhook
  secret instead of `GITHUB_WEBHOOK_SECRET`. Local deliveries keep verifying
  against `GITHUB_WEBHOOK_SECRET` exactly as today, so the editions fixture's
  "must never read local app variables" rule stays intact: relay mode reads
  only relay variables.

## GitLab flows

GitLab is standard OAuth (no app-store model), so the relay is an OAuth broker
plus webhook relay:

### OAuth broker

1. Instance redirects the user to `GET /relay/gitlab/authorize` on Cloud with a
   signed state.
2. Cloud completes the OAuth code exchange with the official GitLab app
   (redirect URI registered on Cloud), then delivers the token pair to the
   instance over the authenticated relay channel.
3. The instance stores tokens encrypted as today (`token-crypto.ts`), and the
   lazy refresh in `getGitlabAccessToken` keeps working: for a connection
   marked `source: "relay"`, the refresh grant runs Cloud-side
   (`POST /relay/gitlab/refresh`) — refresh grants require the OAuth app's
   client credentials, which the instance deliberately does not hold. Cloud
   only refreshes tokens whose lineage traces to a delivery it handed to that
   instance (`forge_relay_refresh_lineage`, SHA-256 of the last refresh
   token, fail-closed and audited).

### Webhook relay

- `ensureGitlabIssuesHook` (gitlab-app.ts:496) registers per-repo hooks. In
  relay mode the hook URL points at Cloud instead of the instance origin.
- **Hook migration**: the existing hook lookup matches by exact URL
  (`h.url === webhookUrl`), which would not recognize an instance-pointed hook
  once the URL changes to Cloud — creating a duplicate hook and duplicate
  deliveries (one failing signature verification at the instance). In relay
  mode, hooks must be identified by a stable marker (the hook's
  name/description set at creation, not its URL): if a marker-matching hook
  exists, its URL is updated to Cloud's instead of creating a new hook.
- Cloud maps repo → instance (learned when the connection is claimed) and
  re-signs `X-Gitlab-Token` with the instance's per-repo relay secret. The
  instance verification path (`app/api/webhooks/gitlab/route.ts:551`) is
  unchanged.
- The per-repo secret generation/rotation logic (MIN-333) stays in the core.
  It is shared with Cloud at hook-registration time **and on every rotation**:
  when the instance rotates a per-repo secret, it pushes the new secret to
  Cloud over the authenticated relay channel (`POST /relay/gitlab/hook-secret`)
  so Cloud's signing key stays in sync; the hook itself needs no URL change at
  rotation time.

## Core-side abstraction

Introduce a token-provider seam so relay mode is one implementation behind an
interface. The scoping, caching, and error-handling logic in `repo-access.ts`
stays untouched — only the token source behind the interface is swapped:

```ts
// lib/server/git/forge-provider.ts
interface ForgeProvider {
  getInstallationToken(input: InstallationTokenRequest): Promise<string>;
  getGitlabAccessToken(connectionId: string): Promise<string>;
}
```

Scope note: `resolveForgeActor` (`forge-actor.ts`) resolves *human* gestures
via user tokens, not installation tokens, so it does not fit this interface
and is **out of Phase 1 scope** — it keeps its local behavior until the
Phase 3 user-authorization broker lands, at which point the interface gains a
user-identity method.

- `LocalForgeProvider` — current behavior, default.
- `RelayForgeProvider` — active only when the relay is configured **and** the
  connection was created through the relay (`source: "relay"`).
- Selection happens per connection, not per instance, so mixed setups (local
  GitHub app + relayed GitLab) work.

## Security model

- Least privilege: tokens are minted per-request, scoped to one repository and
  one permission profile (already implemented client-side in MIN-327; the relay
  enforces the same server-side).
- No long-lived forge secrets on instances: no GitHub private key; no OAuth
  client credentials. GitLab tokens stay on the instance only because the
  agent needs them for clones. Caveat: the GitLab refresh token (scope `api`,
  full account) transits Cloud once at OAuth handoff, so Cloud has transient
  access to it, and every later refresh grant runs Cloud-side over the signed
  channel — Cloud keeps only a SHA-256 of the current refresh token
  (`forge_relay_refresh_lineage`) to refuse refreshes of tokens it never
  issued to the asking instance.
- Transport: HTTPS only; pinned relay origin; request signatures + replay
  protection both directions (webhook fan-out is also signed).
- Abuse control: per-instance quotas, audit log of every mint and delivery,
  operator-side revocation, Cloud-side kill switch for a misbehaving instance.
- Blast radius: a compromised instance secret exposes only that instance's
  claimed installations and linked repos — never other installations of the
  official app. Conversely, a compromised Cloud can forge webhook deliveries
  to every relayed instance (it holds the per-repo webhook secrets) and mint
  tokens for claimed installations; this is inherent to the trust boundary and
  is why Cloud-side hardening (audit, kill switch, key rotation) is a launch
  requirement, not a follow-up.
- Incident response: rotating the GitHub private key or GitLab secret affects
  Cloud only; instances re-mint tokens transparently.

## Contract and editions changes

- `lib/managed-services.ts` gains a `forge` entry gated on
  `MINDDY_EDITION=cloud` + `MINDDY_MANAGED_FORGE=1` + relay configuration.
- `lib/capabilities.ts`: `github`/`gitlab` gain a `replaceable` relay provider;
  the doctor (`scripts/self-hosting-doctor.mjs`) reports "using managed forge
  relay" vs "operator-owned app" vs "disabled".
- `docs/self-hosting.md`, `docs/editions.md`, `docs/public-core-boundary.md`,
  `.env.example`, and `deploy/self-hosted/.env.example` are updated. The rule
  "an absent optional integration stays disabled; it does not fall back to
  Minddy infrastructure" is preserved verbatim: the relay activates only with
  explicit operator configuration and a completed claim.
- New editions CI fixture `managed-forge.env`: relay configured, local apps
  absent — instance must start and report the relay provider, and must never
  read local app variables.
- Chain-of-rights review per `docs/licensing.md` before launch: the relay is a
  business service operated outside the AGPL core, which the boundary
  explicitly allows ("use documented protocols").

## Implementation phases

Phase 0 — Contract (this document, decisions)
- [x] Validate the flag name and protocol shape; chain-of-rights review.
  Decided: the instance-side variables are `MINDDY_FORGE_RELAY_URL`,
  `MINDDY_FORGE_RELAY_INSTANCE_ID`, `MINDDY_FORGE_RELAY_SECRET`; the cloud-side
  opt-in is `MINDDY_MANAGED_FORGE=1` (implemented in `lib/managed-services.ts`
  and `lib/capabilities.ts`). Chain-of-rights: the relay is a business service
  operated outside the AGPL core over a documented protocol, which
  `docs/licensing.md` allows; recorded in `docs/public-core-boundary.md`.
- [x] Decide instance auth: HMAC secret vs Ed25519 keypair (recommend Ed25519).
  Decided: Ed25519 keypair — the instance keeps the private key, Cloud stores
  only the public key; requests are signed over method + path + body +
  timestamp with a replay window + nonce cache. The `MINDDY_FORGE_RELAY_SECRET`
  variable carries the instance's signing key material at registration time.

Phase 1 — Core seam (ships value independently)
- [x] Extract `ForgeProvider` interface (`lib/server/git/forge-provider.ts`);
  route `repo-access.ts` through it. `pr-actions.ts` and `pr-link.ts` consume
  tokens exclusively via `repo-access.ts` (`resolveRepoCloneTarget*`), so the
  seam covers them without direct changes. (`forge-actor.ts` is deferred to
  Phase 3 — it needs user tokens, not installation tokens; see the interface
  scope note.)
- [x] Unit tests proving local behavior is unchanged
  (`lib/server/git/forge-provider.test.ts`), plus fail-closed selection for
  `source: "relay"` connections until the Phase 3 relay client exists.

Phase 2 — Control plane MVP (in this repository, cloud-gated)
- [x] Instance registration + revocation: `POST/GET
  /api/admin/forge-relay/instances` and `DELETE
  /api/admin/forge-relay/instances/[id]` (admin-guarded, 503 unless the
  managed forge is enabled). Ed25519 public key accepted at registration; the
  private key never leaves the instance.
- [x] `POST /relay/github/installation-token` (`app/api/relay/github/installation-token/route.ts`)
  with claim checks, link-mirror check (fail-closed), fixed permission
  profiles, per-instance hourly quota, and an append-only audit ledger
  (`forge_relay_audit`).
- [x] Request authentication: Ed25519 signatures over method + path +
  timestamp + nonce + body hash (`lib/server/forge-relay/protocol.ts`), replay
  protection via the timestamp window and the `forge_relay_nonces` unique
  constraint.
- [x] Link lifecycle sync endpoint `POST /relay/links` (events + snapshot
  reconciliation) — pulled forward from the "Link lifecycle sync" section
  because the mint authorization depends on the mirror.

Phase 3 — GitHub claim + user OAuth
- [x] Claim-code flow and setup-URL binding: `POST/GET
  /api/git/github/relay-claim` (instance), `GET /api/relay/github/claim`
  (Cloud browser entry), setup-URL branch in `app/api/git/github/setup` that
  binds the installation to the instance (`lib/server/forge-relay/claims.ts`).
  The claim code is single-use, 10 min TTL, stored hashed; the poll is
  idempotent for its author.
- [x] `RelayForgeProvider` on the instance (`lib/server/git/forge-provider.ts`);
  connection rows flagged `source: "relay"` (`git_connections.source`,
  written by the claim poll). GitLab tokens stay instance-side, so the relay
  provider delegates GitLab locally.
- [x] Link lifecycle push (pulled forward — the mirror check needs it):
  `bindRepo`/`unlinkProject` push the event AND a reconciliation snapshot of
  the instance's relayed links over the signed channel
  (`lib/server/forge-relay/link-push.ts`).
- [x] User-authorization broker: `GET /api/relay/github/user-authorize` +
  `GET /api/relay/github/user-callback` + `POST
  /api/relay/github/user-delivery` on Cloud, `GET
  /api/git/github/relay-user-callback` on the instance
  (`lib/server/forge-relay/user-broker.ts`). The instance signs the
  authorization request with its Ed25519 key; Cloud runs the OAuth exchange
  with its registered callback URL and parks the token set as an encrypted,
  single-consumption delivery; the browser carries only a random delivery id.
  User tokens KEEP living on the instance — Cloud sees each token once,
  transiently. `isGithubUserAuthConfigured()` reports relay mode so the UI
  offers the authorization button, and the start route
  (`POST /api/account/git-identities`) branches to the broker when the relay
  is configured.
- [x] Extend `ForgeProvider` with a user-identity method and route
  `forge-actor.ts` through it. RESOLVED AS A NO-OP: user tokens stay stored on
  the instance in relay mode, so `resolveForgeActor`'s token resolution is
  identical for both providers — adding an interface method would be dead
  abstraction. The only relay-dependent step of the human-gesture chain is how
  the token was OBTAINED (the broker above), not how it is resolved.

Phase 4 — GitHub webhook relay
- [x] Fan-out with per-instance signing, retry, dead-letter, delivery
  dashboard (`lib/server/forge-relay/fanout.ts`, `POST
  /api/relay/webhook-secret`, `GET|POST /api/cron/forge-relay-deliveries`,
  `GET /api/admin/forge-relay/deliveries`). The GUID is preserved, the payload
  re-signed in GitHub's header format plus `X-Minddy-Relay: 1`; at-least-once
  with 5 attempts over ~2h, then dead-letter. Signing deviation from the
  original sketch, decided with the Phase 0 Ed25519 choice: Cloud cannot
  derive a shared secret from `MINDDY_FORGE_RELAY_SECRET` (it holds only the
  public key), so the INSTANCE generates `MINDDY_FORGE_RELAY_WEBHOOK_SECRET`
  and pushes it — with its endpoint URL — over the authenticated channel,
  mirroring the GitLab hook-secret pattern. The instance receiver accepts a
  second secret for deliveries marked `X-Minddy-Relay: 1` and reads ONLY relay
  variables in that mode.
- [x] End-to-end chain test: GitHub delivery → Cloud receipt (claimed
  installation → enqueue, local handlers skipped) → fan-out worker (valid HMAC,
  preserved GUID) → instance receiver verifies against the relay secret and
  triggers the `@numo` review handler (`lib/server/git/webhook-routes.test.ts`,
  `lib/server/forge-relay/fanout.test.ts`).

Phase 5 — GitLab broker + relay
- [x] OAuth broker endpoint and token handoff: `GET /api/relay/gitlab/authorize`
  + `GET /api/relay/gitlab/callback` + `POST /api/relay/gitlab/delivery` on
  Cloud, `GET /api/git/gitlab/relay-callback` on the instance
  (`lib/server/forge-relay/gitlab-broker.ts`). Same Ed25519-signed-state
  pattern as the GitHub broker; the token pair transits Cloud ONCE as an
  encrypted single-consumption delivery, then lives on the instance and
  refreshes through the relay-brokered grant (`POST /api/relay/gitlab/refresh`,
  lineage-checked; see "GitLab flows" — refreshes need the managed app's
  client credentials, which instances do not hold).
- [x] Hook registration pointing at Cloud; `X-Gitlab-Token` re-signing:
  `ensureGitlabIssuesHook` points the hook at `/api/relay/gitlab/webhook` in
  relay mode and identifies hooks by the stable `GITLAB_HOOK_MARKER`
  description (no duplicate hook when flipping local ↔ relay); the per-repo
  secret is shared via `POST /api/relay/gitlab/hook-secret` at registration
  AND on every rotation (MIN-333 stays in the core); Cloud verifies incoming
  deliveries against it and the fan-out worker re-signs with the SAME secret,
  so the instance verification path is unchanged. Repo → instance resolution
  rides the link mirror pushed since Phase 3.

Phase 6 — Hardening and rollout
- [x] Doctor checks: `forgeAccessFinding` (scripts/self-hosting-doctor.mjs)
  reports "managed forge relay" / "operator-owned app" / "disabled", fails on
  a relay configuration missing `GIT_STATE_SECRET` or a webhook secret under
  32 characters.
- [x] Docs: editions.md configuration contract + fixture table,
  self-hosting.md relay section, public-core-boundary.md inventory row,
  `.env.example` + `deploy/self-hosted/.env.example` variable blocks.
- [x] Editions fixture: `managed-forge.env` in the CI matrix with build +
  HTTP smoke — instance starts with the relay configured, local apps absent,
  and reports the relay provider.
- [x] Load/abuse tests (`lib/server/forge-relay/abuse.test.ts`): signature
  fuzzing without state consumption, hard timestamp-window edges, quota
  boundary, per-mint repository cap, bounded fan-out worker, retention of
  finished deliveries. Delivery-queue retention added alongside
  (`pruneFinishedRelayDeliveries`, called by the cron route).
- [ ] Staged rollout (runbook below) — operational, not code.

## Rollout runbook

The relay becomes critical infrastructure for every opting-in instance; the
rollout is deliberately staged and each stage has an explicit exit criterion.

1. **Internal instance** (minddy team only).
   - Deploy Cloud with `MINDDY_MANAGED_FORGE=1` + `MINDDY_FORGE_RELAY_URL`;
     register one internal instance from the admin API; connect GitHub via the
     claim flow; link one repository; trigger a `@numo` mention.
   - Exit: end-to-end mention latency under a few seconds; delivery dashboard
     shows delivered rows; one deliberate endpoint outage produces backoff
     then recovery, no lost event.
2. **Beta operators** (hand-picked, documented expectations).
   - Onboarding runbook per operator: register instance → receive
     `MINDDY_FORGE_RELAY_*` credentials → set env incl. generated
     `MINDDY_FORGE_RELAY_WEBHOOK_SECRET` → start → claim → link.
   - Exit: two weeks with zero dead-lettered deliveries attributable to the
     relay; token-mint p95 within budget; revocation drill executed once
     (revoked instance stops receiving events immediately).
3. **General availability**.
   - Announce as strictly optional in the self-hosting docs; keep the
     "absent configuration stays disabled" rule verbatim everywhere.
   - Operational commitment before GA: on-call rotation covering the relay,
     status-page entry, SLA expectation documented, kill-switch drill
     (`MINDDY_MANAGED_FORGE=0` must degrade to 503 on relay routes without
     touching anything else).

## Risks and open questions

- **Operational commitment**: the relay becomes critical infrastructure for
  every instance that opts in — on-call, status page, and an SLA expectation.
- **Vendor trust**: some operators self-host precisely to avoid minddy-operated
  infrastructure; the relay must remain strictly optional and clearly labeled.
- **GitHub App visibility**: all relayed instances share one app identity
  (`minddy[bot]` commits, one app on the org's installed-apps page). Acceptable
  for most, but worth documenting.
- **Latency**: webhook fan-out adds one hop; PR-mention agent triggers should
  stay under a few seconds end to end.
- **Token-mint latency and availability**: `repo-access.ts` mints a fresh
  token before each clone/push of a long run, so relay mode puts Cloud on the
  agent's core hot path — added round-trip per mint, and Cloud downtime means
  no clones or pushes at all for relayed instances. The instance-side
  in-process cache mitigates but does not remove this dependency; it belongs
  to the same operational commitment as the webhook fan-out SLA.
- **Resolved**: Cloud mirrors `project_git_links` (claim + link-sync pushes)
  AND the instance asserts the linked repository per token request; Cloud
  checks both (claim binding + link mirror), fail-closed.
- **Open question (operational)**: quota/pricing for the relay (free tier vs
  paid managed service, mirroring managed AI). The technical quota — 120
  mints per instance per hour — is enforced; the commercial decision is not.
