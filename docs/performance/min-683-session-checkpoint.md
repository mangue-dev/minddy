# MIN-683: session checkpoint, 2026-10-14

Work stopped at the user's explicit request to sleep. No further UI, API test,
measurement or content mutation is scheduled. MIN-683 remains in progress. No
merge, release, deployment or `work:done` is authorized.

## Retained source and fixture

- Branch: `codex/min-683-instant-navigation`; draft PR #420.
- Latest compiled application: `c1ec2b80e1d33ebc87df885cc5180b59de9c9cd4`,
  build `ZiBY2UkSzHhI8dl5J1UxZ`. Its explicit product manifest is retained in
  `.next/min683-product.json` and the ignored performance output directory.
- Task46 earlier admission is rejected and reverted (`cd56d5502`). Preserve its
  measured source/history; do not layer new experiments on it accidentally.
- Retain bounded whole-query persistence, Task47 latest-selection writer, and
  Task48 newer-Page ACK/rollback correction. Writer transport improvement is
  provisional until real rapid-refresh correctness is verified.
- Verified tester only: `captures-demo+min540@minddy.app`, user
  `86df71f9-44a7-4cc1-8085-5baa6c744490`. Ten stable tabs, 120 triage issues,
  120 private feedback posts, 30 objectives with 15 tasks each; 1,440 comments.
  Complete global/project issue counts are 1,206/670 and kanban counts 1,086/550.
  Main account and primary Git connection remain unchanged.
- Frozen scaled journal SHA-256:
  `431c744f478b39c6824cadc49a8f9f3b3422a7234777b1f489d42b5cc7be48c7`.
  Do not reseed or replay `--apply` over this immutable migration proof.

## Last completed observations

The writer comparison reduces recorded snapshot POST starts during 100
alternations from 284 to 34 native and 286 to 35 web. Slots are not recorded;
these cannot all be described as window-tab seals. CPU observations are mixed.
Its one natural unpackaged Electron restart reaches the complete global board
in 2,961.7 ms. First openings and three-second all-tab preparation still fail
the requested targets. See the full report and audited indexes.

The final Page-correctness build's native restored run passes its complete
content/preservation gates. Its first project/Page/foreign-Page/PR observations
are 456/405/444/2,548 ms. Its independent natural executable restart reaches the
complete global board in 3,030.27 ms. These are sparse observations, not p95.

The final web run is **failed**: first visits and alternation pass, but the
focus-return foreign-Page click leaves the primary Page selected for ten seconds.
There is no loading or resource start. The frozen runner records neither the
hit-test nor pointer target, so input misdispatch versus product failure remains
unresolved. All cleanup/content/Page-version/tab/Git checks pass. Preserve
`min683-restored-after-scaled-page-coherence-web-1.json`; do not relabel it as
successful because `errors` is empty. Ordinary web actual focus loss is also
unvalidated by that protocol.

## Resume in order

1. Read AGENTS.md, issue/plan, this checkpoint and the current reports. Preserve
   local changes; fetch references and reuse the existing branch. Servers were
   stopped. Reuse the explicit compiled product only while application sources
   match; new application changes need a new identified build.
2. Attribute the failed web activation with a separately excluded pointer-target,
   hit-test, busy/guard and tab-identity diagnostic. Keep frozen ordinary hashes
   intact. An unresolved failure is not grounds for silently rerunning to success.
3. Finish the final native/web broad primary, deep and forge checks. Their planned
   one-loop coverage does not establish warm p95 or match ten-loop warm statistics.
   Respect actual GitHub Retry-After; the earlier 403/failed forge run is retained.
4. Run excluded real rapid-refresh selection checks on both runtimes, then an
   excluded long-absence native read-only check beyond the Page payload lifetime.
   No such proof has run yet. Do not claim hard-unload snapshot durability.
5. Only after all read-only comparisons finish, explicitly reserve the sole UI
   owner for `verify-restored-navigation.mjs --verify` on native and web. Require
   its actual 75-second observed focus absence. This mutates only journaled fixture
   records and must restore content; legitimate versions/timestamps advance.
   Never export restoration journals containing original bodies.
6. Synchronize plan states and publish measured outcomes through `npm run work:pr`
   with matching-author DCO. Keep the ticket in progress until cold preparation,
   common-navigation limits, genuine resume and daily feel are validated.

The principal architectural gap remains late discovery plus many serial scoped
reads. The shared authorized bootstrap design is documented but unimplemented.
Feedback's one-time repeated-navigation delay is also a scope transition:
normal unresolved 96 results become the separate unfiltered 120-result key when
returning to a published `?post=` tab. Active destinations are excluded from
preparation, so that extra key starts after departure. It is not payload GC or
proof of expiry. Preserve full scopes, direct-link selection and freshness when
addressing it; never insert a 96-row subset under the 120-row key.

Focused checks pass for the retained increments: 143 writer/integration tests,
93 Page/receipt/autosave/database tests and 87 preparation tests (overlapping
sets, not a unique combined count), plus full types, scoped lint and English.
The applications cache paragraph is updated in all six locales at revision 10;
workflow A12 and section `desktop-renderer-recovery` have an actual agent review
record. Documentation, static release-documentation and knowledge checks pass.
