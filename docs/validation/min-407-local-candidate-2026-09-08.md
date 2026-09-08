# MIN-407 local candidate validation — 2026-09-08

Status: PASS for the local engineering lifecycle; public/human acceptance remains open. Engineering validation for PR #155, performed as one local
fix/test loop at the operator's request. This report does not replace the
[immutable public attempt](min-407-public-clean-room-2026-09-08.md) or the
[independent published-documentation replay](min-407-documentation-replay-2026-09-08.md).
No first-time human operator was available. Corrected public release acceptance
still requires publication and an unmodified replay.

The [sanitized machine-readable evidence](min-407-local-evidence-2026-09-08.json)
and this report are sealed by [SHA-256 checksums](min-407-local-2026-09-08.sha256).

## Environment and identities

The free, isolated Lima VM `min407-clean` runs Ubuntu 26.04 ARM64, Docker 29.8.0,
Compose 5.5.1, Node 24.11.1 and pnpm 10.28.0. It has 4 CPUs, 8 GiB RAM and a
60 GiB sparse disk, with no host mounts or inherited credentials. A temporary
4 GiB swap file supports image compilation; it is not an application prerequisite.
Playwright uses downloaded Chromium inside this disposable VM; its launch
configuration disables Chromium sandboxing because Ubuntu rejects its user
namespace sandbox. This test-tool setting is not an application installation step.
Host Docker build-cache cleanup freed space without deleting host database
volumes. The original immutable failure checkout and its data were retained.

The verified public source bases are v0.10.25 at
`a233e7fb07a881dcdf4ba01c228ecb1448b4cb10` and v0.10.26 at
`19cd2868e9611eacabc5e333dd3b4b6573936999`. Their application source and migrations
are identical; release metadata differs. The local images apply the corrections
below to those bases. This exercises OCI replacement and bootstrap, but not a
new schema migration or an upstream Supabase version upgrade.

| Local artifact | Actual Docker image ID |
| --- | --- |
| Initial v0.10.25 candidate | `sha256:85e92a85e89ba82e8992653a1bf28cc6a77d42335405be236b8f1a18be4e2042` |
| First v0.10.26 update | `sha256:1a912584eb7f47c4cd1dc073f9b2962e08c1209bb40f999c31491f3af1a91f94` |
| Final v0.10.26 candidate, including private HTTP and analytics corrections | `sha256:438a4310e6047ca7577b022a1a71c69b23e1885097407f2d61ee4267fd8be37c` |
| PostgreSQL, unchanged for physical restores | `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00` |

The upstream checkout is `549db119c44c25167461812041ba198bde2b31a4`
(`self-hosted/v0.7.2`). Images were preloaded. The local fixture uses
`--skip-pull` / `--pull never` and an explicit shell `MINDDY_IMAGE` override
containing the actual local image ID. Environment files retain the previously
verified public pins for comparison. The doctor's immutable-digest wording
therefore describes configuration, not publication of these candidate images.

## Findings reproduced and corrected

| Finding | Correction and observed result |
| --- | --- |
| Edge Runtime cannot fetch JSR on the internal network | Compile unchanged, checksum-pinned upstream main with frozen jose 6.2.3 inside the pinned runtime image, with networking disabled. Fresh startup and retry pass. |
| Docker cannot publish a port from the internal-only database network | A dedicated TCP bridge publishes database/API maintenance on host loopback. PostgreSQL and Kong remain internal. Bootstrap and doctor work while Caddy is stopped. |
| Server-side localhost Supabase requests point into the application container | Route only server HTTP transport to Kong. Preserve public SDK origins, cookie names, response URLs and the existing auth timeout policy. |
| Retry reports its own listeners as conflicts | Check running Compose project ownership before rejecting occupied ports. A real retry with lsof installed preserves the environment exactly. |
| Maintenance switches to a different source app / CLI Supabase instance | Use one Compose context throughout. Read the existing environment without mutation. Back up cold PostgreSQL, raw Storage and database keys together; restore into separate data and volumes. |
| Default upstream SMTP values cannot deliver confirmation | Document an explicit disposable Mailpit inbox and empty test SMTP credentials; keep production provider instructions separate. A real confirmation email is received. |
| Authentication redirects use `0.0.0.0:3000` | Build redirects from the configured public origin. Signup confirmation and subsequent password/MFA login succeed. |
| Auth email footer points to Minddy Cloud | Use GoTrue `SiteURL` in both templates. The received HTML contains no Minddy Cloud URL. |
| Disabled managed services still show Billing and analytics consent/settings | Guard these surfaces with runtime capabilities. Billing is absent; clearing local consent no longer shows an analytics banner when analytics are disabled. |
| Private HTTP fails after login with `crypto.randomUUID is not a function` | Use native UUIDs when available, otherwise cryptographic `getRandomValues` with UUID v4 bits. Update client callers, including project drafts and uploads. The same private-LAN browser subsequently renders the project and downloads its attachment without errors (`isSecureContext=false`, native UUID unavailable, `getRandomValues` available). |

## Browser-created acceptance data

All initial account, MFA, project, issue, attachment and integration creation was
performed through the application UI. No SQL role assignment or data seeding was
used. SQL queries below the UI were read-only verification.

| Object | Identifier / result |
| --- | --- |
| Confirmed administrator | `28dc1136-c267-4550-9b63-928a5ee91fd1` |
| Project `Clean Room` / `ROOM` | `2a499b65-cd1f-4e0b-b88a-44576ecdff8c` |
| `ROOM-1`, Survives update and restore | `63aab531-3cea-41c1-bbe3-bdd36a1d0cec` |
| `ROOM-2`, Integration survives restore | `d18400ae-4d11-47e1-a1dd-4796faea9bea` |
| Attachment row | `cb973388-9317-43ed-9f3a-647b167f630e` |
| Storage object | `c9eb82d6-b547-4ae2-872b-e886105575df` |
| Integration `Clean room caller` | `8ec12f5b-e54a-443b-b300-5590b2fdf42b` |

`ROOM-1` retains its description `MIN-383 acceptance marker`, In progress
status, Urgent priority and M effort. Smart Assign and Smart-fill were disabled
for manual entry without an AI provider. The attachment contains
`clean-room-storage-marker` followed by a newline, 26 bytes, SHA-256
`4f6b1311cb74fa4beee9f545660f4018a7b0ba887ed9f485c577a32043235d9f`.
Actual browser downloads after update and restore match the source bytes.

The account enrolled and verified TOTP, downloaded ten recovery codes, signed
out and signed in again with password plus MFA. Admin dashboard access appears
through the configured administrator email. The integration's UI-generated
local endpoint accepted an issue with HTTP 201; its issue appeared in triage
with the integration's attribution. After UI revocation, reuse returns 401,
including after update and restore. The revoked request creates no extra issue.

The preserved counts are one Auth user, one project, two issues, one attachment
row and one Storage object. Sorted UUID sets also match, including integration
identity; counts alone are not the persistence assertion.

## Lifecycle execution

| Stage | UTC / outcome |
| --- | --- |
| Fresh candidate install | 12:18:29 → 12:19:35, 66 seconds; 16 services and bootstrap/doctor pass |
| Inject `compose stop minddy`, rerun installer | 12:43:58 → 12:44:15, 17 seconds; environment SHA-256 unchanged, project and counts retained |
| First OCI replacement | 12:48:55 → 12:50:21, 86 seconds for image startup and reopening; target bootstrap had already passed with Caddy stopped |
| First blank restore | 12:53:04 → 12:54:32, 88 seconds for startup; doctor, UUIDs and counts pass |
| Private-LAN replay | Login/MFA succeeded; UI exposed the UUID defect. Final image fixes it, preserving the restored data and downloaded bytes. OAuth/MCP discovery uses `http://192.168.5.15`. |
| Final-image blank restore | 13:07:41 → 13:09:09, 88 seconds; same final application and PostgreSQL images, 16 healthy services, counts and UUID sets match the sealed backup; fresh-browser password/MFA login passes |

The first cold backup contains the complete stopped upstream `docker` directory,
the `/etc/postgresql-custom` named-volume contents, protected environment,
deployment files, image identities and expected counts. SHA-256 checks pass in
the VM and in an independent file copy on the Mac. This disposable test backup
is access-restricted, not a production encrypted/off-host backup solution.

The first restore used `restored-supabase`, `restored.env` and new
`minddy-restored-*` volumes. Before extraction, PostgreSQL data and Storage files
were absent and the target database-configuration volume did not exist. Source
containers were removed without `--volumes`; original data remained untouched.
The PostgreSQL image ID was compared before it read restored physical files.
Public origins changed from localhost to the VM's private address. All password,
JWT, Vault, application encryption and MFA state was retained.

After fixing the private-HTTP defect, the final image passed another sealed cold
backup and blank restore without modifying that image. The final target uses
`final-restored-supabase`, `final-restored.env` and four new
`minddy-final-restored-*` volumes, all absent before extraction. Its origin moves
from the private address back to localhost. The attachment hash, revoked-key
response and OAuth/MCP origins pass again after fresh-browser MFA login.
The runbook contains the actual command sequence and requires retaining the
restore-volume override for all later mutations.

## Network observations and limits

Baseline browser requests targeted localhost and localhost:8000. A 180-second
metadata-only VM capture during the private-LAN restore/login replay observed
143 service/destination/port combinations, including internal traffic. Its only
external container destination was Supabase Auth over HTTPS, alongside the DNS
query for `api.pwnedpasswords.com`, the configured compromised-password check.
No application or scheduler external destination appeared in that window.
Host/browser-tool traffic is excluded from container attribution.

A second 240-second capture covers the final cold startup (including an empty
Edge Runtime cache) and fresh-browser login. It observes the application,
scheduler and infrastructure containers; only Supabase Auth has an external
container connection. Browser page requests contain only localhost (63 entries)
and localhost:8000 (3 entries). TCP handshake counts include both directions and
are not HTTP request counts. Raw DNS capture also contains the automation
browser's own Google traffic and npm tooling traffic; these are not attributed
to application containers.

This bounded observation does not prove every future optional feature is free
of external requests. The full CI egress policy suites also pass; fixture-based
policy tests are not presented as a complete live packet capture. Disabled forge
connections, local email, local integration URLs and restored OAuth/MCP discovery
were checked separately. No production account or optional external AI, payment,
email or analytics provider was configured.

## Regression checks and remaining gates

The final complete Vitest run passes: 708 files / 6,996 tests, with the
repository's existing 9 files / 27 tests skipped. Node suites pass: 29 self-hosting
tools tests, 9 bootstrap tests, 8 Compose contract tests, 15 clean-room tests and
one smoke-harness test. TypeScript, targeted Oxlint, owned-English, local
documentation links and `git diff --check` pass. The final Docker build also
passes. No migrations, translations or production configuration were changed.

Remaining release gates are explicit: publish the corrected artifacts (MIN-503
and MIN-504 publication tasks), verify their immutable identities and repeat the
published-documentation AI path, then obtain a first-time human operator's run.
The local engineering run does not waive those gates. No release or deployment
was performed. Private VM artifacts retain credentials, email tokens, cookies,
TOTP material and recovery codes; none are committed or included in this report.
