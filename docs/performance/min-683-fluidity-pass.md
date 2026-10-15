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
| `44e0846a7`, `1f8bdee21`, `847eba630`, `c0c99490e` | Global issue cache, re-evaluated with writes (below): unchanged project reads keep board rows, undo/relations/trash settle from the acknowledgement, remote ticket changes read only those tickets, resume keeps joined channels | Resume board fresh 3446→1511 ms (board reads 5→1); trash 1788→124 ms; remote edit 1530→807 ms; startup neutral over two ABBA runs |

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
| `a44fd357f` issue-counter project updates patched in place | No gain against the real broadcast: a remote creation still triggers the same project list, Smart Assign warning and triage count reads (2/2 per side), so the counter-only update is never recognized. Its unit fixture assumes full old and new rows. The other four global issue cache commits are retained after the re-evaluation below |
| `bundle-imports#3` framer-motion duplicate | Deferred: requires a mangue-ui dependency change |

Rejected candidates never reached the published branch. Their commits remain on
local worktree branches for a follow-up: `worktree-wf_5a021be1-8fc-1`
(`d65c3d11a`), `worktree-wf_1fc4d2f7-768-1` (`733e5fb1e`, `519431387`),
`worktree-wf_1fc4d2f7-768-2` (`5f5aeb2a1`), `worktree-wf_0e747944-62f-1`
(`9ff6e81e5`) and `worktree-wf_0e747944-62f-2` (`a44fd357f`).

## Global issue cache re-evaluation

The five global issue cache commits were first set aside after one startup
ABBA (+75 / +40 / +71 ms) because their benefits need writes. They were
cherry-picked onto `906af1cb7` and re-measured; control and candidate products
were built in the same isolated worktree, so the shared checkout never
switched branches.

**Startup.** The slowdown does not reproduce. Two serial ABBA runs of
`906af1cb7` (build `7atK2nndM9pZBwS2rWd4c`) against the five commits
(`5b00d0969`, build `3U0d6WHAlrofYiFX3WHO3`) moved −103 / +38 / −8 ms, then
+14 / −83 / 0 ms. Pooled medians are 1714→1674 ms web cold (n=12), 1728→1719 ms
web reload (n=12) and 1975→1979 ms native (n=20), sealed 6/6 in every arm. No
bisection was needed.

**Write protocol.** `measure-board-writes.mjs` acts on a disposable project
created for each run under the fixture account and purged afterwards, with the
owner's approval: one project and six issues per run, four for the ABBA, all
verified absent afterwards. Fixture projects, tabs and Pages are never written.
The read-only paths ran alone in a separate ABBA (n=6 per side); the write ABBA
has n=2 per side, with identical request counts within each side.

| Scenario | Fix | Control | Four retained fixes |
| --- | --- | --- | --- |
| Resume after 16.5 s away | `c0c99490e`, `847eba630` | Board fresh after 3446 ms (3089–4038); 5 board reads, 4 cancelled; 13 channel leaves and rejoins; 1 all-issue snapshot | 1511 ms (1457–1558); 1 board read; no rejoin; no snapshot |
| All after a project read | `44e0846a7` | 622–1206 board rows replaced when the project read; activation 112 ms | 0 rows; 104 ms (ranges overlap) |
| Undo and redo of a priority on All | `1f8bdee21` | 1 board read each | None |
| Relation added, then removed, on All | `1f8bdee21` | 2 board reads each, 1 cancelled | None |
| Card moved to trash on All | `1f8bdee21` | Card leaves the board after 1788 ms (1774–1802); 2 board reads | 124 ms (124–125); none |
| Remote ticket edit | `847eba630` | Applied after 1530 ms (1396–1663) through a board read | 807 ms (787–827) through one ticket read |
| Remote ticket creation | `847eba630` | Applied after 1522 ms (1484–1559) through a board read | 802 ms (764–839) through one ticket read |
| Its project counter update | `a44fd357f` | Project list, Smart Assign warnings, triage counts | The same three reads: rejected |

Every board read is the 2.44 MB aggregate, and a cancelled read still runs to
completion on the server. The write ABBA confirms resume (4312→1460 ms). Resume
is simulated with window blur and focus events, the desktop path, not a
suspended socket. One early candidate smoke run, before the realtime timeline
was recorded, showed 26 rejoins; nine later candidate resumes showed none.
Network quiet times are not used, because Page and pull request warming keeps
the network busy. The startup result covers the five commits; `a44fd357f` only
handles project update broadcasts, which do not occur during startup. Evidence:
`min683-h2-cache5-r{1,2}-*`, `min683-cache-readonly-*` and `min683-cache-writes-*`
under ignored `output/playwright/performance/`.

## Collectors added

- `scripts/performance/h2-proxy.mjs`: local HTTP/2, TLS and brotli transport.
- `scripts/performance/measure-page-journey.mjs`: project → Page → project,
  Page after 65 s away, scrolling and typing; Page writes are held in the
  browser and never reach the server.
- `scripts/performance/measure-route-latency.mjs`: sequential authenticated
  route latency with TLS validation kept on.
- `scripts/performance/measure-feedback-return.mjs`: Feedback `?post=` warm
  return and cold activation (Task54).
- `scripts/performance/measure-board-writes.mjs`: undo, relations, trash,
  remote edits and creations on a disposable project removed by the collector
  (`--cleanup` finishes an interrupted run), plus resume and All after a project
  read on the fixture (`--read-only`).
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
