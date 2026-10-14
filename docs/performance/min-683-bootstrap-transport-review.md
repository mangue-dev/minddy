# MIN-683: bootstrap transport source review

This review inspects the current objectives/member coordinator, server stream,
route and preparation admission changes. It performs no test, build, browser,
benchmark, API or SQL probe. Root owns check results and measured acceptance;
the reported 52 initial server/client cases and 108 targeted cases are existing
root evidence, not fresh verification from this review.

## Retained contracts

- The route admits only a unique explicit subset of objectives/members and runs
  one live `getAuthedUser` per actual HTTP request. The exact authenticated client
  and actor reach the unchanged complete ordinary readers. There is no shared
  settled-data or permission cache, All hydration, schema or index change.
- Members retain the living-project owner/member ACL, complete invitations,
  owner-only decoding and ordinary 404/500 results. Objective RLS emptiness is
  never interpreted as a member-access grant. The server publishes each reader
  independently and hides unexpected database/exception detail.
- The client bounds each UTF-8 frame to 2 MiB and the entire body to 4 MiB,
  uses fatal UTF-8 decoding, checks version/name/duplicate/error framing and
  rejects missing/truncated frames for still-pending owners. A 30-second
  deadline covers initial session preparation, headers and body consumption
  once both owners join. These limits are explicit transport failures, never
  reduced successful collections.
- The transport captures account identity before dispatch and checks the current
  account before each frame settles. Query invalidation/removal cancels only
  that owner's accepted generation; the sibling remains independent. Query
  owners settle through their original `fetchQuery`, with no blanket cache
  publication. Already accepted independent results remain accepted when a
  later sibling/stream fails.
- The optimistic objective overlay receives the coordinator's original start
  captured before dispatch, rather than the later frame timestamp. Realtime
  still owns remote invalidation and initial subscription catch-up. The
  bootstrap grants no Page editing receipt or fresh write authority.
- Query signals, the stream abort listener and query-cache subscriptions have
  explicit cleanup on ordinary completion, cancellation and owner disposal.
  Account-keyed `AccountQueryProvider` replacement retires the old client;
  the tab preparator's effect cleanup disposes its bootstrap pairs. No old
  account payload can be accepted into a replacement pair after frame identity
  checks. Existing reader SQL already admitted before server cancellation may
  finish; its late frame is suppressed.

## Admission accounting

The preparation candidate separates query owners from HTTP transports: at most
one ordinary request and one two-reader bootstrap can occupy two transport
slots, with three exact query owners. It does not admit a second bootstrap,
increase forge concurrency, reorder prerequisites or pair with an existing
foreground fetch. Each reader retains its own options, signal, cancellation
and temporary-function restoration before cache success/error notifications.
Foreground observers can install newer ordinary options without restoration
overwriting those options.

The preparation agent is handling atomic registration of both owners before
synchronous priority/cache notifications can interrupt dispatch. Merely
counting three query owners as two transports is insufficient without this
lifetime treatment and regression coverage.

## Serialized size-limit fallback review

The later candidate distinguishes `ProjectBootstrapLimitError` from malformed,
authorization, ordinary reader and cancellation errors. Only parser size limits
may select unchanged complete ordinary readers. The bootstrap body is canceled
before its owners reject with that error. The wrappers serialize those ordinary
reads through one promise chain inside the pair's existing reserved physical
slot. One failed fallback does not hide its sibling's ordinary result. The
signal and preparator lifetime are checked before each queued fallback starts.
Ordinary objective reads retain their own fresh read start and optimistic
overlay. No capped successful collection is accepted as complete.

Pair membership persists until both exact operations finish, including ordinary
fallback work. After the first frame or fallback settles, its query owner may
leave `preparing`, but the pair still counts as one physical slot. A second pair
is excluded while that membership remains. Atomic declared owners, actual joins,
temporary option restoration and zero-dispatch retirement remain as reviewed
below.

The final source-only pass forwarded two additional concrete admission findings:

- After a size-limit rejection, the coordinator removes its generation
  subscription while the original ordinary fallback may still be pending.
  An exact inactive invalidation with `refetchType: "none"` then only clears
  the preparator attempt; it does not abort that fallback. Its late success
  can clear the newer invalidation. The fallback operation needs its own
  exact invalidate/remove fence until settlement without canceling another
  retained foreground operation or its healthy sibling.
- The preparation loop checks unrelated foreground transport before entering
  the pass. A synchronous first-fetch listener can start unrelated foreground
  work and retain an observer on the first ordinary owner. That owner correctly
  survives yielding, but admitting the next pair without checking again adds
  a third physical request. New admissions must recheck visibility, connectivity
  and unrelated foreground transport while preserving or retiring an already
  atomically declared sibling cohort explicitly.

Root and the preparation agent received these concrete cases before the
corrected candidate build. Root owns the corresponding check decisions;
this reviewer ran no tests or timing probes.

## Concrete findings and integration fixes

The reviewed coordinator starts its deadline only after both readers actually
join. A first owner whose sibling never joins otherwise waits without a timer
and retains a query-cache subscription until explicit pair disposal. This is
not hypothetical authorization reuse: a synchronous first-query cache listener
can change the listed destinations or make the sibling fresh before its query
function runs. Source admission must either guarantee both actual joins or
retire an abandoned cohort promptly. A dispatched `fetchQuery` that resolves
fresh cached data is not proof that its pair query function joined.

The revised preparation candidate adds atomic owner registration, actual-join
tracking and `finishAdmission()` retirement. A disposed zero-dispatch pair is
removed from the pair set without waiting for a nonexistent query `finally`.
The coordinator now has a bounded admission timer and disposes an unopened
cohort when its first owner cancels. A source regression covers the synchronous
fresh-sibling case. Root owns execution of that regression; this review has not
run it.

The initial HTTP-denial branch dropped ordinary message/code metadata into a
generic error. The revised client consumes at most 16 KiB inside the same
deadline, preserves ordinary message/code metadata and cleans up its body reader.
The final source includes the current-account check after consuming that body
before exposing its message/code, matching the ordinary read fence.

One further cleanup case was forwarded after rereading the fixes. The final
source now makes `join()` after explicit disposal return the already rejected
owner promise before installing another signal listener or starting work. This
prevents a newly installed listener from surviving an already settled owner.

These are source-review findings and observed source fixes, not executed checks.
The initial lifetime/error findings are addressed in source. The later
serialized-fallback/admission findings above require their integration decision
and root's final executed checks before full transport acceptance. This review
establishes no latency improvement or completed MIN-683 criterion.

This internal transport review changes no public control, configuration or
released version. The public manual remains accurate; no public article/figure
update or invented review date is required.
