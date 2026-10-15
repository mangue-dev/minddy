# MIN-683: global fluidity pass, 2026-10-15

This pass resumes PR420 after the [startup cache pass](min-683-startup-cache-pass.md).
It maps every known cause of slowness in parallel, implements bounded fixes in
isolated worktrees, measures each one in series against its control, and keeps
only fixes with a measured gain. MIN-683 stays in progress.

## Method

**Cartography.** Seventeen read-only analysts covered the nine known axes and the
blind spots (bundle, React renders, server and SQL, cache and invalidation,
realtime, Electron, request graph), followed by a completeness critic. They
reported 61 quantified causes with file and line evidence. Each implementing
agent first re-verified its findings adversarially against the current source;
none was refuted at that stage, and measurement rejected several afterwards.

**Production-like transport.** `next start` serves HTTP/1.1 without compressing
API JSON. Chrome's six-socket pool queued the global board read for 620–1017 ms
before it was sent, and lazily loaded code waited behind API bursts. Earlier
local A/B results were therefore transport-confounded in both directions.
`scripts/performance/h2-proxy.mjs` now serves the local product over HTTP/2,
TLS and brotli on port 3443. All results below use it.

**Sealed relaunch path.** Earlier collectors closed every window at readiness,
before the query cache was sealed, so no retained figure described a real
relaunch within a day. With `MINDDY_PERF_SEALED_SNAPSHOT=1`, web warm reloads
and native launches open the sealed snapshot first. Web cold runs stay
unsealed.

**Protocol.** One product per build, labelled by commit and
`.next/min683-product.json`, served from an isolated root so builds never
overwrite it. Each comparison is ABBA (control, candidate, candidate, control),
each arm a warm-up, 3 cold + 3 warm web profiles and 5 native launches: n=6 web
cold, n=6 web warm and n=10 native per side. Fixes are stacked: each candidate
is compared with the previously accepted product. Nothing else runs during a
measurement. Navigation fixes use dedicated collectors (below).

## End-to-end result

One ABBA comparison in the same session, same transport and protocol: the
original control `6413d75f2` (build `rfraESeJrLvSMt6LNdxuD`) against the final
source `688ed5486` (build `mekGoFTlLEwpijeY4soay`). Milliseconds to the complete
restored All destination.

| Client | Control (min–max, median) | Final (min–max, median) |
| --- | --- | --- |
| Web cold, n=6 | 2034–2377, 2186 | 1597–1858, 1720 |
| Web sealed reload, n=6 | 2212–2651, 2391 | 1639–1832, 1759 |
| Native sealed launch, n=10 | 2680–3018, 2790 | 1917–2148, 2031 |

The ranges do not overlap on any client: about −21% web cold, −26% web reload
and −27% native. The global board read starts at a median of 443 ms instead of
717 ms and ends at 1677 ms instead of 2219 ms; startup API requests fall from
43.5 to 39 per run. Evidence: `min683-h2-end-to-end-*.json` under ignored
`output/playwright/performance/`.

## Production finding

Production functions run in **iad1** (`x-vercel-id: cdg1::iad1`) while Supabase
is in **eu-west-1**. Every serial Supabase round trip crosses the Atlantic
(about 70–80 ms), and an unauthenticated 401 already takes about 190 ms from
Paris. Moving functions to `dub1` would remove most of that, but dub1 Fluid
Active CPU and provisioned memory cost about 31% more than iad1 (0.168 against
0.128 USD per CPU-hour; 0.0139 against 0.0106 USD per GB-hour, Vercel regional
pricing, 2026-09-14). The region is not changed in this PR; it is the owner's
cost decision. Local Supabase round trips (about 25–50 ms) are shorter than
production ones, so serial-round-trip fixes measured here likely gain more in
production.

## Retained fixes

Startup values are medians in milliseconds to the complete restored All
destination (web cold / web sealed reload / native sealed launch), candidate
against its stacked control.

| Commit | Fix | Measured result |
| --- | --- | --- |
| `65ed87cb2` | Board and app-tabs RLS reads overlap the live session/MFA check behind a request-scoped authorization gate | 2216→2124 / 2334→2276 / 2844→2676 |
| `8922b2d62` | The global issue read loads its two UUID ranges concurrently | 2100→1835 / 2337→2104 / 2786→2439 |
| `b7bb7261d`, `be997c12c`, `3e1b76856` | App-tab no-op location writes skipped, write echo reconciles once, provider not remounted on first auth resolution | Latency neutral (1778→1780 / 2054→2060 / 2471→2480); 41→37.5 startup requests |
| `b5a34008c` | Startup reads no longer wait for the sealed snapshot open | 1812→1692 / 2034→1768 / 2444→2153 |
| `769f019e8` | The retained Home surface no longer re-renders with the shell | 1830→1734 / 1806→1742 / 2173→2088 |
| `78ce1ddde` | The dashboard summary is read only while onboarding needs it | 1736→1714 / 1805→1773 / 2119→2065; summary reads 1.1→0 |
| `7669b29f0` | A board column's first window mounts one neighbour row | 1655→1672 / 1704→1691 / 2128→2036 (second pass −12 / −147 / −77) |
| `c36ba16da`, `dc6acd750`, `d6965a179`, `2651099ce` | Own Page write echoes skip refetches; snapshot saves skip the unpersistable board; Page activity warms once; presence publishes only real changes | Typing long tasks 97.5→67.5 ms (first bundle 102→75.5); startup neutral, sealed 6/6 |
| `1247ab2e6` | Triage and Objectives start their predicted detail with the list | Triage first access web 800→667, native 1027→654 |
| `4c6a7e387`…`2f453e9f1` | Six route fixes (Routines, views, Feedback detail, PR count, models, project icon) | Route latency below; startup 1806→1680 / 1736→1726 / 2055→2033 |
| `1c0df2bfb`, `10272be63`, `639116295` | Rare code grammars on demand, zod kept out of the composer, per-variant brand marks | First-load JS /home 5.09→3.51 MB, /all 4.57→3.70 MB; startup 1762→1700 / 1702→1676 / 2007→2014 |
| Task54 (two commits) | One fresh-destination resolver for Feedback `?post=` | Cold `?post=` activation 1347→784 ms and keeps the post 4/4 (control 0/4); first Feedback activation 973→470 ms |
| E server (four fixes, two test follow-ups) | Inbox attribution and agent-run pins overlap their primary reads; local snapshot access in one round trip per page; one shared signing-key fetch; snapshot saves throttled to one per 30 s while data changes | `agent-runs` 264→190 ms, `notifications` 299→272 ms; startup neutral over two ABBA runs (+84 / +1 / +52, then −64 / +48 / −53), sealed 6/6. The signing-key and throttle effects need a 10-minute boundary or minutes of typing and are covered by tests only |
| E renders (seven commits) | Stable auth identity, palette typing and model reuse, TOC and mention catalog stability, lazy updater, Windows/Linux first frame | 1696→1664 / 1709→1658 / 2029→1969; typing long tasks 67→61.5 ms |

Sequential route latency (median of 30 authenticated GETs per side):

| Route | Before | After |
| --- | --- | --- |
| `/api/routines` | 694 | 224 |
| `/api/projects/{id}/views` | 221 | 143 |
| Feedback post / comments / events | 308 / 308 / 305 | 238 / 210 / 202 |
| `/api/pull-requests/count` | 664 | 445 |
| `/api/assistant/models` | 446 | 254 |
| `/api/projects/{id}/icon/content` | 299 | 196 |

A second pass confirms the route gains (for example Routines 620→208 ms).

## Rejected after measurement

| Candidate | Result |
| --- | --- |
| `d65c3d11a` owner identity read before the members barrier | Board end unchanged (1821→1818 ms); no gain |
| `5f5aeb2a1` All reads started on a pending activation | +379 / +425 / +263 ms: the early read is cancelled about 35 ms later and restarted, so the server runs two board reads |
| `733e5fb1e` retained Page body beyond its 60 s collection | Page after 65 s away 87→86.5 ms: the eviction never shows in the real journey |
| `519431387` trailing snapshot debounce | No snapshot sealed within 7 s of readiness (0/6), which delays exit durability; replaced by a throttle measured in round E |
| `9ff6e81e5` PR detail read alongside the pinned list | Web −359 ms, native +278 ms under GitHub API variance; inconclusive |
| Five global issue cache commits (`e03306f8e`, `482d5cd4e`, `234b34f4e`, `429b9be75`, `a44fd357f`) | Not retained: one ABBA showed startup +75 / +40 / +71 ms, and their benefits (undo, relations, remote edits, resume) need writes the fixture forbids. A single ABBA can move ±80 ms (see E server), so this needs a write-capable protocol and a repeat before a verdict |
| `bundle-imports#3` framer-motion duplicate | Deferred: requires a mangue-ui dependency change |

Rejected candidates never reached the published branch. Their commits remain on
local worktree branches for a follow-up: `worktree-wf_5a021be1-8fc-1`
(`d65c3d11a`), `worktree-wf_1fc4d2f7-768-1` (`733e5fb1e`, `519431387`),
`worktree-wf_1fc4d2f7-768-2` (`5f5aeb2a1`), `worktree-wf_0e747944-62f-1`
(`9ff6e81e5`) and `worktree-wf_0e747944-62f-2` (global issue cache).

## Collectors added

- `scripts/performance/h2-proxy.mjs`: local HTTP/2, TLS and brotli transport.
- `scripts/performance/measure-page-journey.mjs`: project → Page → project,
  Page after 65 s away, scrolling and typing; Page writes are held in the
  browser and never reach the server.
- `scripts/performance/measure-route-latency.mjs`: sequential authenticated
  route latency with TLS validation kept on.
- `scripts/performance/measure-feedback-return.mjs`: Feedback `?post=` warm
  return and cold activation (Task54).
- `profile-restored-startup.mjs` and `measure-native-restored-all-startup.mjs`
  accept an https base and the sealed relaunch variant;
  `diagnose-independent-first.mjs` accepts an https base.

## Limits

- Local only: one machine, one fixture, local HTTP/2 proxy rather than Vercel's
  edge, home link to Supabase rather than a datacenter link. No production or
  packaged-shell result.
- n=6 / 6 / 10 per side for startup, n=4 per side for journeys, n=2 per side
  for first-activation diagnostics; medians and ranges only, no p95.
- A single ABBA comparison can move about ±80 ms on one client: the E server
  bundle measured +84 / +1 / +52, then −64 / +48 / −53. Decisions on effects
  under that size rest on repeated runs, consistent direction across the three
  clients, or a deterministic observable (requests, selection, bytes).
- Stacked comparisons attribute each increment against its own control; sums
  across sessions are indicative, not a single controlled comparison (see the
  end-to-end comparison below).
- Bundle-level render and Page fixes are attributed by bundle where no
  collector isolates them; their per-fix evidence is the regression tests.
- Windows/Linux window creation is covered by tests only.
- One independent web run dropped a project-tab click at 3 s; it is kept as
  failed evidence and two reruns completed.

## Documentation impact

Internal performance work only: no documented behaviour, control or
configuration changes, so the public manual needs no update.
