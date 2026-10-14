# MIN-683: selected-read handoff final source review

Reviewed on October 14, 2026, against `1f4156520e2b3ace0103ffbc18420af8ab64cf59`.
This audit owns only this report. It runs no tests, builds, browser, benchmark,
database query or account probe; current execution and UI validation belong to
the root's bounded merge-readiness pass.

## Decision

Retain Task56 as a narrowly justified cancellation correctness fix. Do not
describe it as an accepted latency optimization or as completion of MIN-683.
Removing it would restore a behaviorally demonstrated race between selection
and observer adoption. No concrete regression introduced by the retained
handoff was identified in the reviewed ownership, invalidation or retirement
paths. Current focused checks and the root's runtime review remain the final
validation gate for the pass.

## Reviewed behavior

- `AppTabsSession.select` sets the target and emits the active tab before
  `navigate`. The real `AccountTabSync` subscribes to that synchronous emission
  and calls `preparation.visit`; the exact selected prerequisite hashes are
  therefore installed before navigation and subsequent child foreground reads.
- `createPrTabPreparation.yieldRead` protects only a read already owned in its
  finite `preparing` map whose exact query hash belongs to the selected
  destination. It requires a live, visible and online owner. Other unobserved
  reads still yield, and foreground transport still blocks speculative refill.
- A new visit replaces the hash set. A ready new destination may leave useful
  listed work running under the existing scheduler contract; later foreground
  demand can cancel it. A cold destination yields unrelated reads immediately.
  Disposal clears the set before yielding, and visibility/offline transitions
  revoke the unobserved exception.
- Observed queries retain their foreground consumer ownership, including during
  preparation retirement. QueryClient cancellation and invalidation do not
  consult the handoff exception. Its canceled operation is observed separately
  so a reverted cached result cannot certify Page preparation or consume a
  successful preparation attempt.
- No reader, response projection, request count, pagination, RLS context,
  timestamp, version, permission, receipt or fresh write basis changes. The
  handoff extends neither cache freshness nor a preparation lease.

## Independent regression evidence

`lib/pr-tab-foreground-handoff.test.ts` contains seven cases using the real
QueryClient and, for invalidation, a real QueryObserver: selected issue/Page
reads survive unrelated foreground before observer adoption; next activation,
disposal, hidden and offline paths revoke unobserved ownership; explicit
invalidation cancels and replaces the cached selected read. The eighth case in
`lib/app-tabs-foreground-handoff.test.ts` mounts the real provider, session and
preparation owner and asserts one selected transport, cancellation of its
sibling, eventual successful data and no unexpected writes.

The retained red/green evidence records five behavioral failures on the
reference, including that mounted lifecycle. These assertions are necessary
behavior guarantees and must not be weakened to facilitate removal.
`lib/pr-tab-preparation.test.ts` additionally covers the two-slot limit,
foreground joins, observer departure, cancellation settlement, invalidated Page
retries without stale-body certification and observed ownership on retirement.
This audit read those cases; it does not replace a current test execution.

## Runtime evidence and limits

The existing identified handoff products have complete 55-observation ordinary
web and native runs, real approximately 16-second focus absence/return and
complete content/version/ten-tab/Git preservation. The native comparison is
recorded in `min-683-cold-session.md`: first project 456→737 ms, first primary
Page 310→389 ms, complete PR 2,616→3,143 ms, Feedback 1,236→1,025 ms. These mixed
single observations establish neither causal regression attribution nor a
general speedup. Later failed web focus-window runs retain their failed outcome;
they do not erase the earlier complete handoff run or certify current web focus.

The already validated v8 typing/fresh-read/merge/held-save departure checks are
separate correctness evidence. This source-only review found no handoff change
to their write contract that would require repeating their 75-second protocol.

Preactivation hover remains a separate possible cancellation path: it starts
before the session selects the target, so the selected-hash exception cannot
protect that intent. This bounded fix does not promise otherwise. Dynamic
secondary details absent from the selected manifest at visit are subsequently
owned by their ordinary foreground observers, rather than granted additional
handoff authority. Cold readiness, complete ten-tab preparation and the
100/300 ms navigation criteria remain open.
