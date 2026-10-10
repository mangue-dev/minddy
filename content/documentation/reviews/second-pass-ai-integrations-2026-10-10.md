# Second lightweight pre-merge review: AI, integrations and account controls

Reviewed on 2026-10-10 by `agent:/root/second_ai_integrations` at the owner's
request before PR #397 merges. This is an independent source and saved-asset
review after correction commit `6c62fa7b4`, not human reader acceptance or a
new operational rehearsal.

## Complete reading coverage

Read the complete article bodies, integrated alternative text, all figure
captions and responsive diagram definitions for these 14 guides in English,
French, German, Spanish, Italian and Brazilian Portuguese (84 article variants):

- `numo`, `minddy-mcp`, `git`, `code-work`, `repository-skills`.
- `scheduled-routines`, `automation-settings`, `ai-settings-and-usage`.
- `feedback`, `api-and-webhooks`, `integration-troubleshooting`.
- `accounts`, `applications`, `notifications-and-inbox`.

Reading used bounded chunks; sections hidden by a truncated tool result were
read again separately. Examined availability, charging boundaries, credentials,
consent, account/project permissions, controls, recovery instructions and
limitations, alongside localized meaning and phrasing.

Visually inspected all 29 referenced saved PNGs per locale (174 assets) in 24
private diagnostic contact sheets. Compared the 36 responsive diagram
specifications with the text of their SVG fallbacks, ignoring inline-code
markup and line wrapping. Git sequence titles are also present in each SVG's
accessible title. The stages, boundaries and localized wording agree.

The PNGs provide readable context and controls for the documented procedures.
No additional essential illustration mismatch was identified. Previously
recorded transient labels, generic fixture names and minor edge framing do
not represent new verification or prove a live action occurred.

## Source checks and correction

One remaining scope contradiction was confirmed in
`integration-troubleshooting`, workflow `T08`, sections `oauth` and `webhooks`.
The article covers both an external assistant connecting to minddy and Numo
connecting to a personal external MCP server. English, French, German and
Spanish stated the public HTTPS/private-network restriction without naming
the personal connection. All six variants stated the outbound MCP size and
time limits without naming that connection. This could incorrectly rule out
the self-hosted LAN/localhost paths documented in `minddy-mcp#network-access`.

Corrected all six variants to explicitly identify Numo's personal MCP servers,
retain their public HTTPS requirement, scope the 30-second deadline, 1 MiB
transport cap and 64 KB result cap, and link incoming minddy MCP users to the
network-access guidance. No figure is attached to this article, so no
illustration change is needed. Article, source and review revisions are 5;
compatibility objects and evidence paths remain identical across all locales.

Evidence:

- `lib/server/mcp-http.ts`: outbound `mcpFetch`, HTTPS enforcement, 30-second
  timeout constant and 1 MiB cumulative response cap.
- `lib/server/safe-fetch.ts`: public-routability enforcement rejects localhost
  and private addresses for outbound calls.
- `lib/server/mcp-client.ts`: personal-connection client, timeout and bounded
  tool result/arguments; `lib/mcp-client-tools.ts` defines the 64 KB cap.
- `app/api/mcp/route.ts`: separate incoming minddy MCP handler with OAuth
  authorization, rather than the personal outbound client policy.

Other source comparisons found no new essential contradiction in the reviewed
claims:

- `lib/repository-skills.ts`: supported repository skill roots and precedence,
  up to five selected skills, repository and prompt boundaries.
- `lib/billing-plans.ts`: candidate plan capacities and included AI credit.
  The guides distinguish these references from the live purchasing screen.
- `lib/server/agent/model.ts` and `lib/server/agent/control-plane.ts`: worker
  model/provider matching and frozen personal-key failure without changing the
  payer; routine and worker budgeting are described separately.
- `lib/analytics-consent.ts`: declined consent suppresses capture and retained
  context, consistent with the device/account distinction in the guide.
- `app/api/transcribe/route.ts` and `app/f/[token]/voice/route.ts`: separate
  signed-in/public transcription limits and public-board restrictions.
- `app/api/v1/issues/route.ts` and `app/api/v1/feedback/route.ts`: accepted
  fields, key kinds, limits, response shape and server-side identity.
- `lib/server/webhooks.ts`: raw-body HMAC and best-effort delivery semantics.
- `lib/feedback/sso-jwt.ts`: separate SSO secret, HS256, required expiry,
  short lifetime, clock-skew allowance and one-time token protection.
- `lib/server/mfa.ts`: recovery disables factors and remaining recovery codes,
  rather than restoring an already configured second factor.

## Additional Italian and Portuguese operations reading

Read the complete prose, integrated alternative text, captions and diagram
labels of these 14 additional guides in Italian and Brazilian Portuguese
(28 article variants), supporting the operations reviewer's English, French,
German and Spanish coverage:

- `choose-an-instance`, `architecture-and-data-flows`,
  `authentication-and-email`, `backups-and-restoration`.
- `encryption-and-data-boundaries`, `install-locally`, `installation`.
- `instance-administration`, `instance-configuration`,
  `self-hosted-diagnostics`, `storage-and-attachments`.
- `transfer-between-instances`, `update-an-instance`, `workspace-encryption`.

Operational code examples in this additional assignment remain the operations
reviewer's responsibility. The Italian backup examples were also read, but
this record does not claim independent execution or verification of all
operations examples. The current localized prose preserves distinctions among
historical v0.11.0, the identified candidate, explicit runner adaptations,
managed Supabase, logical/physical recovery and operator responsibilities.
No additional essential localized prose issue was identified. No operations
article was edited by this reviewer.

## Verification limits

No Docker, server, browser session, build, live provider request, account
mutation or operational procedure ran. Contact sheets establish inspection of
saved illustrations, not fresh desktop/mobile responsive acceptance. SVG text
parity does not claim an independent render of every fallback or a browser
layout test. Source review does not prove production encryption migration,
provider availability, purchases, delivered notifications or restoration.
Earlier procedural evidence remains distinct and unchanged.

The coordinating agent runs the required documentation, knowledge,
owned-English, release-documentation and diff checks after consolidating
corrections, then waits for all GitHub checks before the authorized merge.
This supporting record does not claim those checks passed before they run.
