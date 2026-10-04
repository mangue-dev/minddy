# Vercel usage audit (MIN-645)

Investigated on 2026-10-04. Hosted inspection was read-only. The change is a
client polling correction; no production deployment or team billing/settings
change was performed.

## Source and attribution

The issue attachment `vercel-costs.csv` contains 1,337 rows, with SHA-256
`64fc44a10518c42b1b0f9640b13d1481249feebe9b74925652fbcd79d5b03b97`.
Filter by **ProjectId**, not just the display name:
`prj_rFdZriK2xWtLIYjOgCKeriSX49qw`, confirmed by `.vercel/project.json`
and a read-only Vercel project lookup. This identifies Minddy across production
and previews; the CSV has no environment, route or event-type dimensions.

The entire export spans September 11 through October 10, but the Minddy rows
cover **September 11 through October 4** (24 dates). The October 4 bucket is
incomplete. Later rows include fixed team subscription charges; do not interpret
them as future application traffic or extrapolate Minddy to 30 observed days.
Daily bucket timestamps start at 07:00 UTC. Preserve the export's date labels
and numeric `Usage` values, including fractional billing quantities.

Aggregate `Charges (USD)` by `(ProjectId, Metric)`. The source does not expose
credit application or final invoiced amounts. Here, "cost" means the exported
charge valuation, not an additional amount due.

| Minddy metric | Exported usage | Cost (USD) | Share of Minddy attributed cost |
| --- | ---: | ---: | ---: |
| Observability Events | 4,292,717.61 events | 5.1513 | 33.28% |
| Fast Origin Transfer | 40.0275 GB | 2.4023 | 15.52% |
| Fluid Provisioned Memory | 200.6511 GB-hours | 2.1316 | 13.77% |
| Fluid Active CPU | 15.7096 hours | 2.0276 | 13.10% |
| Sandbox Provisioned Memory | 42.8032 GB-hours | 0.9597 | 6.20% |
| Build CPU Minutes | 8,200 minutes | 0.9539 | 6.16% |
| Speed Insights Plus Events | 467 events | 0.6500 | 4.20% |
| Snapshot Storage | 201.0329 exported GB units | 0.5287 | 3.42% |
| Function Invocations | 489,362.54 invocations | 0.2936 | 1.90% |
| Remaining Minddy metrics | Mixed units | 0.3795 | 2.45% |
| **Total attributed to Minddy** | | **15.4782** | **100%** |

Minddy contributes **95.52%** of all projects' Observability Events cost
($5.1513 out of $5.3928). The remaining projects contribute $0.2416. Minddy's
Observability valuation alone is **25.76% of a $20 credit**, which explains the
issue's observation. This comparison is arithmetic against $20, not proof of
the account's current credit entitlement or remaining balance.

Do not allocate the **$32.9376 without a ProjectId** to Minddy. These rows include
Pro ($20), Speed Insights Plus ($10), Vercel Agent ($2.5054), and storage/transfer
items. Although Minddy has Speed Insights enabled, the CSV does not identify
which project owns the unattributed fixed add-on. The observed 467 Speed
Insights events and 162 Web Analytics events are separate metrics, so removing
their client scripts would not remove the 4.29 million Observability Events.

To reproduce the main totals with Python's standard library after downloading
the attachment, run this against the unmodified CSV:

```python
import csv
from collections import defaultdict
from decimal import Decimal

project_id = "prj_rFdZriK2xWtLIYjOgCKeriSX49qw"
costs = defaultdict(Decimal)
usage = defaultdict(Decimal)
with open("vercel-costs.csv", newline="") as source:
    for row in csv.DictReader(source):
        if row["ProjectId"] == project_id:
            costs[row["Metric"]] += Decimal(row["Charges (USD)"])
            usage[row["Metric"]] += Decimal(row["Usage"])
print(dict(costs))
print(dict(usage))
print(sum(costs.values()))
```

## Current Vercel cross-check

`vercel usage --group-by project --format json`, collected on October 4 at
18:38 UTC, reports a different window: **October 1 07:00 through October 4
18:38 UTC**. For Minddy it reports **$4.6594 effective cost**, including
**$1.7225 Observability Events**, with **$0 billed Observability cost** and
effectively zero total billed cost (a sub-nanodollar rounding residual).
This supports separating credit consumption from additional billing. Do not
compare this window directly to the whole CSV or sum the two sources together.

The read-only project lookup confirms both Web Analytics and Speed Insights
are enabled. It does not establish per-event Observability attribution or
justify disabling a team-wide add-on.

`vercel logs --no-branch --environment <environment> --since 24h --limit 1000
--json` returned repeated pages. Deduplicating by record `id` leaves only:

- 51 production requests, October 4 18:35:47–18:39:00 UTC. The largest groups
  are `/api/mcp` (26), OAuth authorization-server discovery (6), and OAuth
  protected-resource discovery (6), followed by scheduled workers.
- 50 preview requests, 18:34:46–18:36:37 UTC. The largest group is
  `/api/me/local-snapshots` (9), followed by version, triage and PR-count reads.

These are short recent samples, not 24-hour totals, traffic proportions or
Observability event counts. A separate preview `/live` log search returned no
records. That is not evidence that live polling never occurs. The selected
correction is supported by a reproducible source-level lifecycle defect, not
by claiming that this endpoint caused most of the exported cost. Raw logs,
attachment URLs, private content and the original multi-project CSV are not
committed.

## Why the correction reduces events

[Vercel's event model](https://vercel.com/docs/observability) counts edge
requests, middleware, function invocations, external API requests and AI
Gateway requests. One incoming request can produce several events. Application
console messages are not the counter behind this metric.
[Vercel's usage guidance](https://vercel.com/docs/manage-and-optimize-observability)
distinguishes Observability from Web Analytics, Speed Insights and log drains.
Sampling those products does not sample the application's Observability
request events.

`subscribeRun` in `lib/use-agent-run-live.ts` previously used an unconditional
500 ms interval while an agent ran. Unlike React Query's default background
behavior, it kept fetching `/api/agent-runs/:runId/live` in hidden documents.
Retained application views could also keep subscribing after their route was
hidden. Each read reaches a dynamic, uncached route that authenticates the
caller, checks access to the run and reads/decrypts its live snapshot. Avoiding
the read avoids its incoming request and associated downstream work.

The correction:

- Suspends snapshot polling while the document is hidden, cancels the browser
  fetch/body read and catches up immediately when visible again.
- Unsubscribes inactive retained views through `useAppTabActive`. A different
  visible subscriber can continue using the same per-run poll and channel.
- Keeps one in-flight read and a 500 ms minimum interval between visible read
  starts. Cancellation must settle before a rapid return starts another read.
- Ignores abandoned responses and retains retry behavior after HTTP/network
  failures. No server access checks, cache policies or encrypted payload
  boundaries change.
- Replays the in-memory stream/diff to a resumed subscriber when another view
  already owns the poll. Persisted Realtime events invalidate provisional text
  so an obsolete stream is not replayed.

The private Realtime channel remains connected when only the browser document
is hidden. Persistent event queries and agent/worker heartbeat behavior are
unchanged. Aborting a browser request cannot undo backend work already started;
the reliable savings come from preventing subsequent hidden reads.

Local fake-time tests measure **120 scheduled reads avoided per hidden minute
per subscribed run per browser document**: 121 reads over a visible minute
(including the initial read), then no additional reads over a hidden minute,
then an immediate catch-up. Inactive retained views issue no snapshot reads.
This is a request-count result, not a production dollar forecast. Actual
savings depend on hidden-view time, active runs, response latency and the
external work performed per read.

## Verification and next measurements

The initial change passed 31 focused Vitest tests across visible polling, React hook lifecycle,
live route authorization, encrypted snapshots, stream state and local diffs.
Coverage includes shared subscribers, retained view reactivation, cancellation
during JSON decoding, rapid hide/show, failure recovery and request counts.
Typecheck, targeted lint, owned-English and whitespace checks passed for that
initial change. The additional authorized scope is described below.

After the normal authorized release, compare matching Minddy-only windows in
Vercel Usage and Observability, separating preview from production. During an
active run, verify that the live route stops when the browser document or app
view is hidden and immediately shows the latest stream/diff when restored.
Measure request counts and external API events before attributing dollar
savings. Use cost valuation and final billed cost as distinct measures.

Other worthwhile investigations need more evidence before changing behavior:

- Attribute the late-September/October traffic increase by event type, route
  and deployment. MCP and local snapshot reads appear in the recent samples,
  but their billing-period contribution is not established.
- Review the $10 unattributed Speed Insights Plus subscription separately if
  performance reporting is no longer needed. Sampling its small event volume
  will not remove its fixed subscription or Observability charges.
- The twelve original cron schedules produce 4,994 scheduled requests per day
  on one production deployment, before downstream work. Queue recovery,
  delivery and automation latency depend on those schedules; do not reduce
  them without measuring their idle rate and required recovery latency.

Do not weaken live authorization, cache private responses at the CDN, remove
error reporting or disable Observability for other projects to save these events.

## Additional approved optimizations

PR polling, prefetching, Numo and the compact agent conversation remain active.
The changes below reduce per-request work and snapshot frequency while keeping
the existing background conversation updates and two-second event poll.

- **Query snapshots:** the bounded batching interval grows from one to five
  seconds. Explicit visibility/pagehide flushes remain immediate. Only one
  encryption request runs at a time, with one latest waiting snapshot; identical
  content shares a pending request or skips a completed save. Account-generation
  and revision fences prevent obsolete responses from reaching local storage.
  Decrypted data remains memory-only. Draft persistence is unchanged.
- **Agent event history:** ordinary polls use the existing `after` cursor and
  merge new events by ID and sequence. First reads, remounts, invalidation,
  recovery after errors and a 30-second reconciliation request full history.
  Full reads repair late commits, corrections and retention deletions. Reads
  are paged beyond the database's 1,000-row default cap and every page retains
  the authorized run/project filters. Realtime invalidations can still cause
  full reads, so transferred-byte savings depend on the workload.
- **OAuth activity:** live token-hash, grant revocation, key revocation and expiry
  checks remain per-request. Two post-response activity updates become one
  service-role-only RPC, reducing this path from three database HTTP requests
  to two. The transaction updates only the grant's actual key and uses monotonic
  timestamps. It touches no encrypted key names/agent content or token values.
  The migration adds no table or plaintext column; affected migration, SQL and
  TypeScript consumer inventories are updated. Apply migration
  `20270109200026_oauth_activity_bookkeeping.sql` before the application release.
- **Relay retention:** delivery/retry processing stays minutely. Finished
  delivery deletion runs hourly at minute 35 on Vercel and the self-hosted
  scheduler, retaining the seven-day cutoff and excluding pending deliveries.
  This changes retention scans from 1,440 to 24 per day (98.3% fewer), with up
  to one additional hour before removal. It adds 24 maintenance invocations;
  the 13 Vercel schedules now total 5,018 scheduled requests per day. This saves
  downstream work rather than reducing the number of scheduled invocations.

These are deterministic local changes, not measured production cost savings.
160 focused Vitest tests pass across 21 files, including the initial lifecycle
checks. Typecheck, targeted lint, owned-English, encryption consumer inventory,
scheduler syntax and whitespace checks pass. Tests exercise persistence races/logout, incremental ordering and reconciliation,
background polling, OAuth checks and cron authorization/separation. The isolated
PostgreSQL integration test uses the baseline OAuth/key table definitions and
checks execution grants, mismatched keys, monotonic timestamps, revoked grants
and transaction rollback. Existing key/name encryption and live authorization
remain unchanged. Locale catalogs, Numo/FAB components and PR query settings
are untouched.

## Speed Insights replacement assessment

[PostHog Web Vitals](https://posthog.com/docs/web-analytics/web-vitals) provides
LCP, INP, CLS and FCP in Web Analytics. Collection is independent of DOM
autocapture and session replay. Its `$web_vitals` events consume the ordinary
analytics quota (the first one million monthly events are free), so it is not
unconditionally free. Sampling is available. TTFB is not among its four built-in
metrics, so this is not exact feature parity with Vercel Speed Insights.

Minddy already loads `posthog-js` 1.434.13 in `components/posthog-init.tsx`, with
its existing consent/opt-out handling, disabled DOM autocapture and disabled
session recording. It does not set `capture_performance`; collection may follow
the remote project setting. No live PostHog account access was available to
confirm actual `$web_vitals` ingestion. Recommend enabling/confirming Web Vitals
in that project, verifying populated reports on representative routes, then
removing the appropriate Vercel subscription once ownership is established.
Neither provider's settings nor the Speed Insights integration are changed here.

### PR review and collection follow-up

The full CI run identified three failures in `query-provider-lifecycle.test.ts`:
its complete local-snapshot mock omitted the newly used account-generation API.
The mock now retains the real generation/invalidation functions and replaces
only snapshot storage. All five lifecycle tests pass, including logout/account
isolation. The shared live replay cache now applies `liveAfterEvent`, preserving
provisional files across tool events and clearing them for closing events.
Regression tests cover retained-view reactivation and unchanged timestamps.
49 focused tests across seven files, typecheck and targeted lint pass.

A read-only check on October 4 of production's public runtime configuration and
the matching PostHog SDK configuration confirms EU ingestion is configured, but
the remote configuration delivers `capturePerformance.web_vitals: false` with
`network_timing: true`. A cache-busted read agrees. The configuration advertises
a five-minute cache lifetime; both Web Vitals script variants are reachable and
the application CSP does not restrict their script origins. This identifies a
configuration blocker, not a confirmed analytics ingestion delay. No private
PostHog event data or hosted settings were accessed or modified.

Enable **Web vitals autocapture** for the project whose public key Minddy uses;
allowed toolbar URLs and network timing are separate settings. Then reload the
page after configuration refresh, interact with it and switch away from the tab.
Look for `$web_vitals` in the event feed before interpreting a blank dashboard.
The SDK groups available metrics for up to five seconds; some metrics finalize
on interaction or when the document becomes hidden. SPA route changes do not
start a new page-load measurement with the default Web Vitals configuration.
