# Security — minddy

This document describes the security architecture of minddy: how to
authentication, authorization, encryption and public surfaces
are designed, and what to do in the event of an incident. It completes the decisions
recorded over time in migrations and code — it does not replace them.

**Stack:** Next.js (App Router) + Supabase (PostgreSQL, Auth, Storage). Minddy
Cloud is operated on its managed infrastructure; self-hosted operators select
and secure their own supported hosting stack. The edition and data-flow boundary
is documented in [docs/editions.md](docs/editions.md).

## Supported versions

Before the first public release, only the latest commit of `main` receives
fixes. After publication, the latest stable version and `main` are taken
in charge; Earlier versions may receive a patch at
discretion of the maintainers, without guarantee. The safety bulletin indicates the
affected and corrected versions.

---

## 1. Authentication

- **Provider:** Supabase Auth (GoTrue). Email/password, magic link, and
OAuth Google/GitHub. OAuth and SMTP configuration lives in the Dashboard
Supabase; its versioned trace is in [.env.example](.env.example).
- **JWT verification:** route handlers resolve the user via
`getClaims()` and not `getUser()` ([lib/server/api-auth.ts](lib/server/api-auth.ts)).
With **asymmetric** (ES256) signing keys in place, verification
is **local** (WebCrypto + cached JWKS) — no network round trip to
GoTrue by query.
- **Lifespan:** short access token (1 hour), rotating refresh token. A
Unreachable Supabase instance is treated as 503, never disguised as 401
(“disconnection”).
- **Second factor (MFA / TOTP):** TOTP enrollment + recovery codes
already in place. The `aal2` denial is **global** and lives in `getAuthedUser`: a
account that has enrolled a factor is only served in `aal2`. This choice avoids the
classic flaw in the list of sensitive routes that we forget to complete.
Only `/api/account/mfa/recover` passes `allowAal1` (the case “more than
phone ").
- **Admin privilege (`/admin`, `/api/admin/*`):** two sources, and only one
gate — `isAdminUser` ([lib/server/admin.ts](lib/server/admin.ts)), called
in **each** exported handler, never assumed from a previous pass.
(1) `app_metadata.role === "admin"`, not writable by the user;
  (2) the `ADMIN_EMAILS` allowlist, which since MIN-344 requires the address to be
**confirmed** — checked on `auth.users.email_confirmed_at` in service key,
never on a claim (the `email_verified` of `user_metadata` is written by
the user himself, therefore forgeable). Without this requirement, register with
the address of an admin listed but not yet registered was enough to obtain the
highest privilege of the product. Fail-closed reading, memorized for 60 s.
`/api/me/admin` is purely informative: it tells the sidebar whether to
show the entry, it doesn't open anything.
- **A link received does not open a session (MIN-345).** Three surfaces posed a
session on a simple `GET` navigation, without anything to prove that the person
requested **this** round of authentication — this is session fixation:
the attacker requests a link for his account, sends it, and then reads everything
that his victim wrote there. Each is treated according to its own measure:
- **Email link** (`/auth/callback?token_hash=…`): the token is no longer
consumed on navigation. It waits in a cookie `httpOnly`
`SameSite=Lax` ([lib/auth-otp-pending.ts](lib/auth-otp-pending.ts)) and the
session is only born from `POST` of `/auth/confirm`. No nonce in the link:
the GoTrue template composes the URL, and one email opens legitimately on another
device than the one who requested it (invitation, confirmation read on
phone).
- **OAuth Tour**: unchanged, it was already linked to its initiator — the
PKCE verifier is a cookie set initially, and the exchange fails without it.
- **Desktop deep link** (`minddy://auth`): nonce pulled by the app at the start of the
turn ([lib/desktop/auth-turn.ts](lib/desktop/auth-turn.ts)), reported by the
link, consumed on return. A link that the system delivers without us having anything
requested is ignored; an email token, which cannot carry a nonce, is
confirm by hand in the window.
- **Board SSO** (`/f/<token>/sso?jwt=…`): lifespan ceiling imposed
**to the verifier** (he only lived in our signer, that the client
does not execute) and **single-use** token, consumed in base
    ([lib/server/feedback/sso-replay.ts](lib/server/feedback/sso-replay.ts)).
- **Origin of writes.** API routes are authenticated by cookie, and a
cookie leaves by itself: a writing which **declares** itself of another origin is
refused in 403, in `getAuthedUser` — global, for the same reason as the refusal
`aal2`. A query which declares **no** origin passes, on purpose: it
cannot come from a third-party page (the browser would have set the header), and
refusing it would cause callers to be left without a page (probes, tests, CLI). THE
complete reasoning and the two levels of custody are in
[lib/server/same-origin.ts](lib/server/same-origin.ts). Two surfaces are more
strict and **require** the header, because they are only reached by a
app form: `/api/oauth/authorize` (consent) and
  `/auth/confirm/complete` (session opening).
- **Re-authentication before irreversible.** `DELETE /api/account` takes
cascade the owned projects, their tickets, their files and the access of their
members: copying your address protects against clumsiness, not from someone
else. The route therefore asks for the password again — or, for an OAuth account which
does not have one, an authentication less than 15 minutes old, dated by the
claim `amr` of the JWT ([lib/server/reauth.ts](lib/server/reauth.ts)). There
password verification is charged per user, so as not to become
an oracle in the hands of a stolen session.
- **Password policy:** the interface applies the same rules as
the Supabase configuration in [lib/password-policy.ts](lib/password-policy.ts)
(8 characters, lowercase, uppercase, number). The Supabase Dashboard remains
the authority which imposes them; the “Auth Hardening” block of
[.env.example](.env.example) also logs protection against
leaked passwords and rate limits Auth.

## 2. Authorization — a service-role monolith, RLS as the second line

The actual code model: most writes go through the **service
client** (`getServiceClient()`), and the authorization lives in **TypeScript**
(`getProjectAccess`, `requireProjectMember`, `is_project_owner`). This is the
first line of defense, tested and explicit.

**RLS is the second line**, not an ornament: any logged in user has
the public anon key + its JWT and can talk to PostgREST (`/rest/v1/…`) in
directly. RLS is what prevents it from reading or writing data from another tenant
through that path.

- **RLS enabled on all `public` tables.** Some tables are
**deny-all volunteers** (RLS activated, no policy): all their access passes
by customer service (e.g. `oauth_clients`, event logs, tables of
billing techniques). This is intentional — not “correcting” by adding a
policy without understanding the consumer.
- **Least privilege:** read/write policies are based on
`auth.uid()` and `can_access_project()`. Since MIN-118, all policy aims
explicitly the `authenticated` role (no more on the `public` role, which
would have included `anon`) — structural guard documented in
  [20260926091000_policy_tightening.sql](supabase/migrations/20260926091000_policy_tightening.sql),
replayed by [20261220090000_tenant_isolation.sql](supabase/migrations/20261220090000_tenant_isolation.sql)
(MIN-338: nine policies written since then came back without `TO` clause).
- **`project_id` is frozen** on any partitioned table that the RLS allows to be set
day from the client. A `with check` only sees the NEW line: it
checks that the destination is accessible to me, not that I have not moved the
line. A member of two projects could therefore release a ticket, an objective or
a page from one — without basket and without trace. It's a trigger
`before update of project_id` (`public.freeze_project_id`), set by a loop
on the catalog, which refuses (MIN-338).
- **Author Binding:** Client inserts require the author to be the caller
  — `created_by = auth.uid()` (`issues`, `issue_relations`), `author_id =
  auth.uid()` (`comments`). No author spoofing.
- **No PostgREST hard delete** on `issues`/`objectives`/`attachments`/`pages`:
the deletion goes through the recycle bin and the server-side storage cleanup
  ([lib/server/trash.ts](lib/server/trash.ts), [lib/server/pages.ts](lib/server/pages.ts)).
  `pages_delete` had reopened this door — a direct DELETE carried away
the history of the page and left its files orphaned (MIN-338).
- **Secret columns partitioned by column privileges** (not only by
RLS, which filters rows and not columns): `git_connections`,
  `git_user_identities`, `user_ai_keys`, `api_keys`, `oauth_grants`, `integrations`,
`billing_accounts` — Stripe tokens/hashes/IDs are not in
the white list readable by `authenticated`. See
  [20260926090000_security_grants.sql](supabase/migrations/20260926090000_security_grants.sql).
⚠ Consequence: a column ADDED later to one of these tables is not
  unreadable until an explicit `grant select (col)` adds it.
- **SECURITY DEFINER functions:** reserved for `service_role`, except the seven
  policy helpers: `can_access_project`, `is_project_member`,
  `is_project_owner`, `can_watch_agent_run`, `can_watch_numo_comment`,
`can_watch_pr_review` and `can_watch_pull_request`. They only respond on
caller access, and RLS policies cannot call them without
EXECUTED. The rule is applied by a loop on `pg_proc`
  ([20260926093000_definer_grants_sweep.sql](supabase/migrations/20260926093000_definer_grants_sweep.sql)),
  not function by function.
⚠ **Supabase Trap:** `revoke … from public` IS NOT ENOUGH. The bootstrap pose
  `alter default privileges … grant all on functions to anon, authenticated`,
so each function is born with an EXECUTE **explicit** for these two roles;
only `revoke … from public, anon, authenticated` removes them. Nine functions of
repo (admin dashboard, AI costs, usage, `claim_agent_run`) were in fact
callable without any session with only the public anon key. The trap has
reserved: `get_ai_run_spend` (20261118090000) was written with this form
and left open until MIN-338 — hence the replayed broom, and the guardrail
(§10) which now refuses the insufficient form of writing.

## 3. Encryption

- **At rest:** Supabase encrypts the base (AES-256) and storage via its
infrastructure. `auth.users` (email, metadata) is managed and encrypted by
  Supabase.
- **Application secrets:** reversible secrets are encrypted **on the app side** in
AES-256-GCM (envelope) before writing. They are not included in the answers
ordinary, with an explicit exception: an owner can obtain the SSO secret
of its board from the configuration endpoints or the MCP in order to install it
in the backend of its site. It should never go into client code or
in version control.
  - tokens OAuth GitLab → `GIT_TOKEN_ENCRYPTION_SECRET` /
    `GITLAB_TOKEN_ENCRYPTION_SECRET`
- **GitLab webhook secret, one per repository** (MIN-333) → same envelope and
same derivation secret as the tokens above, stored in
`project_git_links.webhook_secret_encrypted`. By deposit and not global:
GitLab displays the token of a hook to anyone who can edit it, therefore a unique secret
written at each tenant left any maintainer of a linked deposit forging
events for other people's repositories.
- “BYOK” AI keys → `AI_KEY_ENCRYPTION_SECRET`
  - feedback board SSO secrets → `FEEDBACK_SSO_ENCRYPTION_SECRET`
(MIN-119). Encrypted and not hashed because they are **shared** with the
backend of the editor, which must be able to reread them; who owns them can
forge the identity of any visitor to the board.
- API keys / OAuth grants → stored in **sha256** (never reversible).
- **No pgcrypto column:** useless here — the secrets are already encrypted
app side, and email/name live in `auth.users` (encrypted by Supabase).

## 4. Transport & headers

Defined in [next.config.mjs](next.config.mjs), on all routes:

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` |
| `Content-Security-Policy` | `frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |

- `preload` is in the header but the domain **is not subject** to
hstspreload.org (almost irreversible for the entire domain).
- **One exception:** `/oauth/authorize` (the consent screen) serves the
same CSP **without `form-action`**. Its POST form to
`/api/oauth/authorize`, which responds 303 to the MCP client's `redirect_uri` —
cross-origin by construction. Chrome and Safari apply `form-action` to the
target of the redirection following a form POST (Firefox not):
`form-action 'self'` would block the entire MCP OAuth flow there.
- The CSP is limited to `frame-ancestors`/`base-uri`/`form-action`. A CSP to
`script-src` strict (nonces) would require rewriting the rendering string (scripts
inline Next + theme-init-script) — **separate site** if desired.
- Microphone authorized in `self`: the assistant's dictation uses it.

## 5. Fichiers (Supabase Storage)

- **Private Buckets** (`attachments`): reading by signed URLs minted in key
service ; upload spoiled by path prefix
(`projects/{project_id}/…` → project member, `chat/{user_id}/…` → self).
- **Buckets publics** (`project-icons`) : lecture via `/object/public/…` ;
no **listing** policy (the anon listing has been removed, MIN-118).
- **Size limits** placed on buckets (`file_size_limit`) — the only one
bound that the direct-to-storage client cannot bypass:
  `attachments` = 20 MB, `project-icons` = 25 MB. See
  [20260926092000_storage_limits.sql](supabase/migrations/20260926092000_storage_limits.sql).
- The public bucket `avatars` (orphan) is removed via
  [scripts/drop-avatars-bucket.mjs](scripts/drop-avatars-bucket.mjs).

## 6. Input Validation

- Most route handlers validate manually: each string is
bounded in length, each enum passes through an allowlist
  ([lib/issue-validation.ts](lib/issue-validation.ts),
  [lib/objective-constants.ts](lib/objective-constants.ts),
[lib/category-colors.ts](lib/category-colors.ts)), each finite and bounded number,
each array capped. Dynamic registration of OAuth/MCP clients
(`/api/oauth/register`) uses a Zod schema. A malformed JSON body
  produces a 400, never a crash.
- **SQL injection:** Supabase/PostgREST parameterizes; no raw query
concatenated.
- **XSS:** comments and rich content are markdown, not text
raw. The rendering component only enables `rehype-raw` upon request; when
this door is used, `rehype-sanitize` immediately follows it.
The TipTap Page Editor configures `html: true`.
- **PAGES Editor: `html: true`**
  ([components/pages/page-extensions.ts](components/pages/page-extensions.ts)).
Markdown has no flyers or subpages; both project in minimal HTML
(`<details>`, `<div data-type="subpage">`), and without this option they
would leave as escaped text. What cleanses, in its place:
- the DIAGRAM. The reading path is markdown-it → HTML → `parseHTML` of
ProseMirror, which only keeps declared nodes and attributes: a `<script>`
or a `onerror=` has no node, it falls. Nothing is ever returned
    `dangerouslySetInnerHTML` ;
- the WRITE gate ([lib/page-content-schema.ts](lib/page-content-schema.ts),
MIN-350): `page.content` is refused if it carries any type of node or mark
unknown, or a `src`/`href` whose protocol is not `http`, `https` or
`mailto` — a `javascript:` would otherwise come out in the `href` of a real anchor
(file block). The unknown attributes are removed;
- the markdown projection escapes what it interpolates into a tag or into
the destination of a link
    ([components/pages/blocks/escape.ts](components/pages/blocks/escape.ts)).
- **The storage prefix `projects/{id}/pages/…` cannot be written by the
  client** ([20261230090000_pages_prefix_server_only.sql](supabase/migrations/20261230090000_pages_prefix_server_only.sql)) :
a page file is created on the server side, with its `page_files` line.

## 7. Rate limiting

- Rate limit **in-memory** per user+route
([lib/server/session-rate-limit.ts](lib/server/session-rate-limit.ts)) on the
expensive routes (dictation, assistant, imports, creations, comments, etc.).
- **Known limit:** in-memory = **per instance** (reset on deploy,
is not shared between regions/Fluid instances). Acceptable without users.
**Criteria for moving to Upstash Redis:** abuse noted, or need for a cap
strict cross-instance. Not deployed until this criterion is met.
- **Login / signup / reset / OTP** speak to GoTrue **live** from the
navigator: our routes do not see them. Their rate limit is set in the
  **Supabase Dashboard** (see [.env.example](.env.example)).

## 8. Public surfaces and their protections

| Surface | Protection |
| --- | --- |
| Crons (`/api/cron/*`) | `Authorization: Bearer ${CRON_SECRET}`, compared to `timingSafeEqual` ([lib/server/cron-auth.ts](lib/server/cron-auth.ts)) |
| GitHub Webhook | HMAC signature of the App (`timingSafeEqual`); **fail-closed** — secret missing → 503, nothing processed; anti-replay on `X-GitHub-Delivery` |
| GitLab Webhook | Token **specific to the repository**, resolved to `project.id` then compared to `timingSafeEqual` (this is not an HMAC signature). If encryption and historical fallback are both absent, the route responds 503; an absent or unrecognized token responds 401, including when no secret from this repository has been loaded. Anti-replay on `X-Gitlab-Event-UUID`. |
| Stripe Webhook | Stripe signature verified; idempotence in **two steps** (MIN-344) — the `stripe_webhook_events` line is a reservation, the `processed_at` is only set after successful processing, so a transient failure remains replayable |
| Supabase Webhook (new user) | Shared secret `x-minddy-webhook-secret`; fail-closed 503 |
| OAuth 2.1 / MCP (`/api/oauth/*`, `/api/mcp`) | Public clients PKCE S256 mandatory, opaque hashed tokens, single-use codes |
| Public boards (`/f/<token>`, `/share/<token>`) | Served on the server side using a service key; password option; OTP email to vote/comment |
| Integration API (`/api/v1/*`) | Integration API key (sha256), scoped to the project |
| microVM Control Plane (`/api/agent-vm/*`) | OIDC Vercel Sandbox, holding expected Vercel and sandbox name deriving from the run; separate local channel by reduced range HS256 token |
| Administration (`/admin`, `/api/admin/*`) | Supabase session then `isAdminUser` in each handler; confirmed email allowlist or `app_metadata` role |
| Forge callbacks (GitHub setup, GitHub user authorization, GitLab OAuth) | `state` signed and callback session linked to the same user before any code exchange or writing |

## 9. The code agent — what its microVM holds

The microVM of a run (Vercel Sandbox) executes the shell decided by a model, with
an open outgoing network. We consider it **compromised by hypothesis**: the
The question is not to prevent her from doing wrong, it is to limit what she holds.

- **She does not receive the secrets of the minddy platform.** Nor LLM key
root (the firewall sets the `authorization` header *after* the exit of the
VM), neither Supabase key nor identity token. The control plan recognizes the
VM by the OIDC that the platform signs, and verifies the tenant
(`team_id`/`project_id`) before the name (MIN-331). See
  [lib/server/agent/network-policy.ts](lib/server/agent/network-policy.ts).
- **It nevertheless holds a forge secret when the run must clone or
  pousser.** `git clone`
writes it in `.git/config` — that's what the VM clones and pushes with, it doesn't
can't work without it. What is limited is what it opens
  ([lib/server/agent/repo-access.ts](lib/server/agent/repo-access.ts),
  `RepoTokenAccess`) :

| Who owns it | Scope | Power |
  | --- | --- | --- |
| Our roads (PR, review, merge, issues) | the linked deposit | installation permissions |
| microVM of a ticket / notebook run | the linked deposit | `contents: write` (clone + push) |
| microVM of a pull request **replay** | the linked deposit | `contents: read` |

Replay is the only anchor whose content comes from an **unknown fork**:
it does not write anything in the repository, and `/repo-auth` **refuses** any token to it
costs. Before MIN-327, the minted token was not valid for anything — it was valid for everyone
the installation repositories — and a proofreader received one in writing.
- **⚠ GitLab does not have this gradation.** The token given is the OAuth access token
connection, scope `api` on the entire account: GitLab does not know
down-scope an OAuth token for use, and its only mechanism with reduced scope
(project access token) is a persistent token for at least one day. A
GitLab rereading therefore runs with a token that can write. Constraint of the
platform, assumed and said — such as the absence of bot identity (MIN-146).
- **The token does not appear in the logs.** The substitution of
[lib/server/agent/redact.ts](lib/server/agent/redact.ts) removes it from everything
which exits the loop (tool exit, error message, checkpoint) *before* the
pattern: `git remote -v` and `cat .git/config` render `[redacted]`.
- **What remains possible**, and which is limited elsewhere: exfiltrate the **content**
of the repository (open network, assumed — a whitelist would break `npm install`
among our users), and spend outside ledger on the credited LLM route
(limited by the key per run to hard ceiling, held by the supplier).

## 10. Outillage

- **CI GitHub** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) : tests,
typecheck and audit on each pull request and each push, in a runner
disposable **without any secrets** (`pull_request` trigger, never
`pull_request_target` ; `permissions: contents: read`). This is what allows
to open the deposit for contributions: before MIN-335, `deploy.sh` was the only
pipeline, so the code of a PR could only be verified by running it on
the maintainer's station, next to the production `.env`. The depot performs
code to the first `install` and to the first `vitest` — it is said in
  [CONTRIBUTING.md](CONTRIBUTING.md).
- **Vulnerability gate** ([scripts/audit.mjs](scripts/audit.mjs)): threshold
high/critical on the **three** lockfiles (`pnpm-lock.yaml` — the one that
actually installs —, `package-lock.json`, `desktop/package-lock.json`),
**entire tree**. `--omit=dev` has been removed: `esbuild` produces the bundles
delivered and `tailwindcss` the CSS served, without being `dependencies`.
- **deploy pipeline** ([deploy.sh](deploy.sh)): replays these same gates, more
the CI verdict for the deployed commit. Last trickle, not source of
truth.
- **Live authorization probe** ([scripts/security-probe.mjs](scripts/security-probe.mjs)):
manually verifies a deployed Supabase project's RLS, column grants, and Storage
policies. It checks cross-tenant issue reads and writes, privileged RPC denial,
secret-column denial, foreign Storage listing and uploads, immutable project
keys, and page hard-delete denial. It is deliberately outside Vitest and is
never run by CI.

### Live probe fixtures and invocation

Run the probe only after an operator has created **dedicated disposable probe
fixtures**. They may be in production only when they contain no customer data,
no usable credential, and may safely be changed or deleted if a control has
regressed. Do not use a service-role key: the probe must use the public anon key
and ordinary user access tokens, otherwise it would bypass the controls under
test. Do not place these values in tracked files or pass them on the command
line.

- `SECURITY_PROBE_CROSS_TENANT_TOKEN` belongs only to
  `SECURITY_PROBE_SOURCE_PROJECT_ID`; it must not be a member of
  `SECURITY_PROBE_FOREIGN_PROJECT_ID`.
- `SECURITY_PROBE_DUAL_MEMBER_TOKEN` belongs to both dedicated projects. The
  reassignable issue and disposable page are in the source project, so the
  probe reaches the tenant-key trigger and the no-delete policy rather than an
  unrelated membership check.
- `SECURITY_PROBE_FOREIGN_ISSUE_ID` is a disposable issue in the foreign
  project. `SECURITY_PROBE_REASSIGNABLE_ISSUE_ID` and
  `SECURITY_PROBE_HARD_DELETE_PAGE_ID` are disposable records in the source
  project.
- `SECURITY_PROBE_SECRET_CONNECTION_ID` is a probe-only `git_connections`
  record owned by the cross-tenant user. Its encrypted-token columns must be
  null or non-secret test values.
- `SECURITY_PROBE_FOREIGN_STORAGE_PATH` is an existing non-sensitive sentinel
  file beneath `projects/${SECURITY_PROBE_FOREIGN_PROJECT_ID}/`; it confirms
  that an unrelated user cannot list the foreign prefix.

Load the values from the operator's secret store, then run the following from a
clean shell. The explicit confirmation is required; missing or malformed
configuration stops the probe before it makes a request.

```sh
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="…"
export SECURITY_PROBE_CROSS_TENANT_TOKEN="…"
export SECURITY_PROBE_DUAL_MEMBER_TOKEN="…"
export SECURITY_PROBE_SOURCE_PROJECT_ID="…"
export SECURITY_PROBE_FOREIGN_PROJECT_ID="…"
export SECURITY_PROBE_FOREIGN_ISSUE_ID="…"
export SECURITY_PROBE_REASSIGNABLE_ISSUE_ID="…"
export SECURITY_PROBE_HARD_DELETE_PAGE_ID="…"
export SECURITY_PROBE_SECRET_CONNECTION_ID="…"
export SECURITY_PROBE_FOREIGN_STORAGE_PATH="projects/<foreign-project-id>/security-probe/listing-sentinel.txt"
node scripts/security-probe.mjs --confirm
```

The probe prints only check names and failure HTTP statuses, never configuration
values or response bodies. A failed unauthorized upload, write, reassignment,
or delete is expected to leave no change. If a probe detects a regression,
treat the dedicated fixtures as potentially altered, stop, preserve the output,
and follow the incident procedure below before reseeding them. Local HTTP is
refused unless `SECURITY_PROBE_ALLOW_INSECURE_LOCAL=true` is set for a localhost
Supabase instance.
- **Migration guardrail** ([lib/schema-guardrails.test.ts](lib/schema-guardrails.test.ts)),
him in the sequel: he rereads the migrations written since the last broom and
fails if one creates a policy without `TO` clause, a table without RLS, a
definer which does not close on `anon`/`authenticated`, or an UPDATE policy
on a partitioned table without the `project_id` gel. This is the answer to what
produced MIN-338: four regressions written in good faith, each correct
taken alone, by people who had no reason to open the file where the
rule was written.

## 11. Incident procedure (short)

In case of suspected compromise:

1. **Revoke exposed keys.** Run in the Supabase Dashboard:
`SUPABASE_SERVICE_ROLE_KEY`, anon key if necessary. Rotate the
env secrets on Vercel (`*_ENCRYPTION_SECRET`, `CRON_SECRET`,
`*_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, Stripe keys). Redeploy.
2. **Purge sessions.** Supabase Dashboard → Auth → disconnect all
users (invalidates refresh tokens). The move to signing keys
asymmetric does not invalidate current access tokens — purging
sessions + their 1 hour expiration closes the window.
3. **Revoke compromised OAuth grants / API keys**
   (`oauth_grants.revoked_at`, `api_keys.revoked_at`, `integrations.revoked_at`).
4. **Observe the extent.** Vercel + Supabase logs, table
`stripe_webhook_events` and activity logs (`issue_events`) to trace
actions.
5. **Replay the probe** ([scripts/security-probe.mjs](scripts/security-probe.mjs))
after remediation.

## 12. Report a vulnerability

Never publish a vulnerability, proof of exploitation or data
exposed in a public issue, discussion or pull request.

Prioritize **Security → Report a vulnerability** on GitHub, which creates
a private opinion. If this option is not visible, write to
[hello@minddy.app](mailto:hello@minddy.app). Encrypt sensitive items or
ask for a suitable channel first. Include:

- the version or commit affected and the deployment mode;
- the prerequisites and minimum reproduction steps;
- the impact, the data or privileges concerned and the known exploitability;
- redacted logs or evidence, and a suggested correction if you have any
a ;
- your credit expectations and coordination of disclosure.

We acknowledge receipt within seven calendar days, then confirm the
scope and agree on a correction and publication schedule. We
may request a reasonable period of time before disclosure in order to protect the
users. The reporter is kept informed at important stages; none
bonus program is promised.

Good faith searches that avoid persistent access, exfiltration,
destruction, unavailability and third party data will not be subject to
retaliation on our part. Stop the test as soon as real data is
encountered and report it without keeping it. Tests on the managed service do not
must only use your own accounts and data; social engineering,
Spam and denial of service attacks are outside the scope.
