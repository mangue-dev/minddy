# MIN-683: independent project bootstrap server increment

This candidate follows the bounded strategy recorded in plan task 58 before
implementation. The server change is limited to objectives and members. Root
owns transport integration, checks, control/candidate products and UI clocks;
this server agent has run no browser, benchmark, test, build, API or SQL probe.

## Hypothesis and retained evidence

The retained server attribution records complete primary project objectives
at 30,842 decoded bytes / 197.5 ms and members with invitations/owner state at
255 bytes / 213.7 ms. Ordinary requests each performed a live session/MFA
admission around 60–67 ms. Sharing that Next admission inside one HTTP request
is a plausible saving. These historical observations do not establish a
bootstrap saving under the two-slot client preparator and must not be added
together as a predicted result.

The large primary issue response remains outside this increment. No Page
body, forge request, All slice, cache, index, migration or production setting
changes. The retained startup reservation and selected-read cancellation
protection remain unchanged.

## Exact protocol and authorization

`GET /api/projects/:id/bootstrap?readers=objectives,members` accepts one explicit
`readers` parameter containing a unique subset of those two reader names. Empty,
duplicate, unsupported and repeated parameter lists return HTTP 400 before
any reader starts. Reversing the names changes no reader contract.

Every actual request invokes `getAuthedUser` once. Ordinary authorization
denials remain their existing HTTP response, including error codes. Both
readers receive that exact authenticated client and actor. PostgREST still
performs its ordinary live pre-request authorization/MFA checks; this is no
authority reuse across requests or permission grace period.

The successful transport response is `application/x-ndjson; charset=utf-8`
with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
Each requested reader publishes exactly one version-1 frame when its ordinary
complete reader finishes:

```json
{"version":1,"reader":"objectives","ok":true,"data":[]}
{"version":1,"reader":"members","ok":false,"status":404,"error":"localized ordinary error"}
```

Success data are unchanged ordinary DTOs. Objective cursor pagination,
remaining counts, decryption, creation ordering and authenticated RLS remain
in `loadProjectObjectives`. The living-project owner/member ACL, complete
memberships and invitations, owner-only invitation decoding, identity/avatar
enrichment and error outcomes remain in `loadProjectMembers`. An RLS-empty
objective result does not establish member access. Each reader retains its own
error outcome even if its sibling succeeds.

Only two readers can start, concurrently and within one request. Useful
objectives can finish before a slow member lookup and members can finish before
slow objectives. There is no whole-response JSON barrier. Expected reader
failures preserve their ordinary localized 404/500 errors. Unexpected reader
exceptions produce a localized database-error 500 frame without private SQL or
exception text. A transport serialization failure remains an explicit error
rather than a silently complete partial collection.

There is no completion marker. The client must validate one frame for every
requested reader and the final stream boundary, reject duplicates, malformed
or missing frames, apply size/deadline limits and verify account identity before
acceptance. A frame does not confer Page editing or fresh write authority.

## Cancellation and lifetime

Request abort or body-consumer cancellation prevents future frame delivery and
removes the request abort listener. Already admitted ordinary database reads
may finish because those existing loaders do not accept an abort signal. They
remain bounded to the two requested readers, with no downstream publication
after disposal. A pre-aborted signal admits no reader at all. Normal completion
also removes the listener. No settled DTO or authorization state survives this
stream.

Client ownership must continue to isolate each TanStack query and its
invalidation generation. Only an already admitted shared cohort may use the
same in-flight request. Original request start, optimistic objective overlay,
initial realtime catch-up and newer accepted versions remain client contracts.
These are checked in the root agent's client increment rather than asserted
from the server route alone.

## Validation and admission

The new server tests cover explicit bounded reader sets, one live authorization
with the exact request-local client, preserved HTTP authorization failures,
unchanged complete DTO delivery, independent completion in both orders,
per-reader ordinary 404/500 and unexpected error isolation, no cross-request
reuse, pre-abort, request abort, consumer cancellation and listener cleanup.
Root runs these tests and relevant integration/English checks outside any UI
measurement window.

Retain this candidate only after matched immutable control/candidate products
on the same current fixture show a useful targeted result without displaced
startup or first-click cost. Root records sample sizes, usable content, loading,
request admission/bytes, main-thread work and independent first activations.
No latency or MIN-683 acceptance criterion is claimed by this source change.

This is internal performance investigation and an internal read transport. It
adds no public control, configuration, contributor workflow or released version;
the public manual remains accurate. No public article/figure IDs or invented
review dates are required. Root runs documentation, knowledge, owned-English
and diff checks before publication.
