# The seed scripts arrive here, numbered and idempotent.

`015-current-cycle-completed.mjs` moves the five already completed Beacon demo
issues into the current demo cycle so its screenshot shows completion alongside
ongoing work. It preserves titles, statuses, assignees, and completion dates,
creates no records, and uses the shared write guards. The default run only
describes the change; `--apply` requires explicit user approval.

`016-routines.mjs` seeds three demo routines on Aurora (weekly security
review, monthly dependency inventory, daily issue triage). Every routine is
inserted DISABLED — `enabled: false`, `next_run_at: null` — so the scheduler can
never claim them and no real run is ever billed. It no longer seeds run history:
those rows lived in the coding agent's table removed in MIN-721. The default run
applies after the plan it prints; relaunching is safe, existing routines are
left as they are.

`019-manuel-captures.mjs` adds the demo data of the remaining manual
screenshots: an incoming Aurora ticket in triage created by Alice, one Aurora
ticket in the trash deleted by Camille, and a short "Feedback guide" page
published read-only and shown as a tab of Aurora's public feedback board. The
publication is a public share of that demo page, anchored by the page in the
guards. The default run only describes the change; `--apply` requires explicit
user approval.

`017-cycle-recal.mjs` realigns the demo cycle world for the `featureCycle`
screenshot: AUR-18 — auto-captured into Camille's current fortnight by the
app — leaves the cycle and is reassigned to Alice Fontaine so the auto-
capture pool never pulls it back, and the three most recent closed demo
cycles are recalibrated to 80 completed points so the velocity factor stays
1 and the capacity ring reads ~45 % instead of a floored 93 %. It creates no
records; every update goes through the shared write guards, and the default
run only describes the change before applying it.

`018-statistiques.mjs` fills the demo account's statistics ledger from its
existing history for the profile statistics screenshot (MIN-737): one
"issue created" event per demo issue the demo owner created, at its creation
date, and one "issue completed" event per completed issue assigned to it, at
its completion date. It invents nothing, copies no title or project name, and
never adds an event twice. The default run only describes the change;
`--apply` requires explicit user approval.

`014-pages-aurora.mjs` also gives the "Aurora 2.0 launch" page a page mention
of "Release process" (MIN-777), so a capture can open that page in the side
panel from a mention. The seed rewrites the seven Aurora pages with their
existing ids and fixed dates; run `--dry-run` first, and the write requires
explicit user approval.

`020-objectifs.mjs` seeds Aurora's four objectives (Public launch, Onboarding
revamp, Search v2, Legacy importer) for the objective picker, pill and palette
screenshots (MIN-785), and files five open Aurora tickets and the two oldest
feedback requests under the two open ones. Aurora has a content key, so the
seed encodes each new objective with the application's own codec through
`captures/lib/encrypted-content.mjs`, and decodes the existing ones to
recognize them by name; that module refuses the production database and
non-demo projects, and never creates a key. The default run only describes
the change; `--apply` requires explicit user approval.

`021-commentaires-pr.mjs` mirrors a short pull request discussion into Aurora's
AUR-8 for the ticket-timeline screenshot of mirrored PR comments (MIN-802): a
code review comment with its diff excerpt, a reply threaded under it, and an
edited conversation comment, each with its GitHub provenance (login, thread,
dates). No pull request, repository link or forge account is created, so
nothing can reach GitHub. Aurora has a content key, so the comment bodies are
encoded with the application's comment codec through
`captures/lib/encrypted-content.mjs`. A comment already mirrored keeps its
identity and has its text realigned with the script. The default run only
describes the change; `--apply` requires explicit user approval.
