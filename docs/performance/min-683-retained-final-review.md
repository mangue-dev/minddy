# MIN-683: retained-code review for PR 420

This bounded static review examines retained application code at
`1f4156520`, against merge base `738e2bc3fe3317b80e3b625c266234063f41ee68`
with `origin/main`. The application diff contains 87 non-test files under
`app`, `components`, and `lib` (3,417 added and 868 removed lines). Performance
artifacts, raw archives, tests, and documentation are excluded from that source
inventory. This review does not treat the artifact count as application scope.

No actionable correctness or account-isolation defect was confirmed in the
contracts below. This is a targeted static review, not a claim that every
possible runtime interaction or every global MIN-683 latency criterion passes.
The two provisional admission/handoff optimizations have separate decisions
and runtime evidence from the coordinating pass.

## Contracts reviewed

| Contract | Retained implementation and assessed boundary |
| --- | --- |
| Account ownership | `AccountQueryProvider` keys the query provider by user identity; `AppTabsProvider` separately keys descendant surfaces and owns a distinct session. Authentication retirement clears query state and increments the local-snapshot generation. Page receipts, optimistic layers, quota deadlines, and navigation working sets belong to Query/QueryClient identities rather than a shared protected payload cache. |
| Device persistence | `query-persistence.ts` selects complete queries within the unchanged snapshot budget. It never truncates a collection into a supposedly complete query. Oversized/unacceptable snapshots retire previous stored state; callbacks and queued writes are fenced by revision and account generation. `local-snapshots.ts` stores server-sealed envelopes, and `window-selection-persistence.ts` additionally verifies the expected owner and prevents an obsolete in-flight selection from installing over the latest queued selection. |
| Page display and write authority | `createPageSurfaceRead` distinguishes cached display, an actual scoped GET/creation receipt, cancellation, invalidation, and read failure. `PageView` retains failures even if an optimistic cache update clears Query.error. Cached body display alone does not authorize a versioned body save. A failed/acquired mismatched read leaves the draft pending and navigation guarded. |
| Page versions and optimistic ordering | `use-page-autosave.ts` merges cached-base/local-screen/fresh-remote documents before dispatch, serializes body writes and conflict replays, retains pending edits on failure, and prevents a retired Activity generation from starting a queued request or replay. `use-pages-query.ts`, `page-read-receipts.ts`, and `optimistic-page-writes.ts` preserve a newer accepted Page body/ordinary metadata when an older ACK or GET settles and reapply only owned pending fields. Database schema/revision/value fields keep their separate settlement domain. |
| Page retention and departure | Retained documents are bounded to a small eligible previous document plus the active document; draft/large/database documents do not gain ordinary small-document eligibility. React Activity suspends inactive effects; reactivation rebinds the reconciled screen to the recreated editor. The ordinary app-tab departure guard awaits autosave and refuses departure with unresolved pending/in-flight work. Browser unload is a best-effort last-chance write with an unsaved-change guard, not a delivery guarantee. |
| Complete project/global reads | `complete-scoped-rows.ts` and `global-board-issues.ts` use stable UUID keysets, exact remaining counts, duplicate/nonadvancing guards, and late-error rejection, including a server row cap below 1,000. Issue/objective readers retain the ordinary encrypted projections, authenticated RLS client, final display order, and complete resource-count traversal. Resource counts remain explicitly best effort as before. The service-role members reader authorizes a living project owner/member before returning identity enrichment; only the owner receives decrypted pending invitations. |
| Board interaction lifecycle | `BoardWindowedItems` pins focused rows, drag sources/destinations, open popovers, card-owned dialogs, and unfinished uploads. Height geometry belongs to a mounted column, is refreshed for windowed rows, and includes bounded estimates for offscreen drag-bundle members. Manual target discovery refreshes mounted nodes during autoscroll. Keyboard Tab can admit/focus the adjacent offscreen row; small columns retain natural flow. Windowing changes mounted work, not the complete source query. |
| Secondary selection/query parity | Extracted objective/routine/triage/Feedback selection functions and query options retain foreground keys and scoped DTOs. The Feedback requested-post optimization reuses only an already healthy exact normal query containing the requested scoped post and matching the actual filters/review control. Otherwise the ordinary full-scope key is used; no filtered array is promoted under the full-list key. |
| PR quota and unavailable state | Retry-After deadlines use the account query client and survive transient refetch error clearing. Partial readiness batches retain completed rows, mark remaining rows unavailable, and carry the deadline without manufacturing readiness. Controlled server batch reads stop admission once a qualifying quota response is observed; already-started requests may finish. A missing/private PR remains an access-boundary result, not proof of a forge outage. |

## Evidence and limits

The review inspected the source diff and the relevant existing test contracts;
it launched no tests, builds, browsers, SQL, API requests, or benchmarks and
introduced no source changes. The coordinating pass owns executable checks,
matched web/native observations, final CI status, and any removal of the two
provisional optimizations. Historical successful write/focus proofs and failed
collector records keep their original provenance.

No new release-wide documentation behavior was introduced by this review. A
bounded incremental merge can be assessed independently of the still-open
2–3 second/100 ms/300 ms product targets. Those targets and real private-PR
quota diagnosis remain open until their own evidence satisfies the contract.
