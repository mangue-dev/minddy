# MIN-683: startup query-cache pass, 2026-10-15

This pass resumes PR420 after the [native/bootstrap pass](min-683-native-bootstrap-pass.md).
It first corrects forced-quit draft recovery (`ab8f2a319`, recorded in that
report), then targets initial load.

## Startup criterion

Earlier `/home` startup observations race tab restoration: the fixture's active
tab is All, so Home can render completely before the restored navigation
commits, or never become complete when restoration is fast. This pass measures
the restored destination instead: open `/home` and wait until `/all` satisfies
the board readiness check on the full global card set. A transient Home does
not count. The criterion is in `scripts/performance/profile-restored-startup.mjs`
(web, three cold contexts plus a same-context reload each) and
`scripts/performance/measure-native-restored-all-startup.mjs` (unpackaged
Electron, five natural launches). The second file is the existing native startup
collector with only the readiness predicate and run count changed.

## Diagnosis

A cold web profile of control `ab8f2a319` (build `Ae6KdM_T1pZh7A1RwmFit`) shows
JavaScript complete by about 200 ms and roughly 110–180 ms of long tasks, while
the restored destination completes after 2.6–3.1 s. Startup is network and
server bound. Seven startup reads were issued twice about 60 ms apart.

`AccountQueryProvider` keyed `AppQueryProvider` by `user?.id ?? "signed-out"`.
Auth starts with a null user, so the whole tree mounted under `"signed-out"`,
sent its reads with the session cookie, then remounted with a new QueryClient
when that same session resolved. A fetch/QueryCache trace on the candidate
confirms a single QueryClient for the whole startup.

## Change

`6413d75f2` adopts the startup cache on the first auth resolution. Every later
identity change (sign-out, account switch, a null first resolution later
recovering an account) still mounts a fresh provider. Three jsdom cases count
provider mounts across those sequences, and they fail on the previous source.

## Results

Same fixture, same environment files, local `next start` on port 3111, one
warm-up profile before each measured session. Values are milliseconds to the
complete restored All destination.

| Client | Control `Ae6KdM_T1pZh7A1RwmFit` | Candidate `rfraESeJrLvSMt6LNdxuD` |
| --- | --- | --- |
| Web, n=6 / n=12 | 2648–3073, median 2838 | 2396–2642, median about 2530 |
| Native, n=5 each | 3160–3342, median 3183 | 2528–3225, median 2977 |

The web ranges do not overlap. Native improves at the median, with a wider
candidate spread and one observation inside the control range. Startup API
requests fall from 41–47 to 38–42. The change is retained. This establishes no
p95, packaged-shell or production result.

## Remaining startup gaps

- **Realtime catch-up refetch.** Around 900 ms the `SUBSCRIBED` catch-up
  invalidates every user-scope key, refetching reads that completed a few
  hundred milliseconds earlier. It closes the gap between the first GET and the
  subscription, so removing it needs a baseline/watermark handshake rather than
  a timestamp shortcut.
- **Restoration waits on `/api/me/app-tabs`.** The All navigation commits only
  after that read returns (about 850 ms) while it competes with about 20 other
  startup reads. The global board read then starts at about 1 s.
- **Global board payload.** `/api/me/board` returns about 2.4 MB for 1,206
  issues, including 951 KB of descriptions and 347 KB of plans decrypted on the
  server, and takes about 1.4 s locally. The prior server attribution already
  requires a consumer parity review before removing protected fields.
- **`app-tabs` self-echo.** Each tab activation write is followed by a full
  `app-tabs` refetch (four or five per startup).
- **Local transport.** `next start` serves HTTP/1.1 and does not compress
  these API responses, so connection queueing and wire bytes are exaggerated
  locally compared with Vercel's HTTP/2 edge.

## Evidence and products

Raw profiles, traces and logs remain in ignored `output/playwright/performance/`:
`claude-initial-load-restored-{ab8f,6413,6413-b}.json`,
`claude-native-restored-all-{ab8f,6413}.json`,
`claude-startup-duplicates-6413.json` and the earlier `/home` profile
`claude-initial-load-home-ab8f.json`. The control product is retained under
`min683-built-products/Ae6KdM_T1pZh7A1RwmFit/.next`; the candidate is served
from `.next`. The public manual is unaffected.
