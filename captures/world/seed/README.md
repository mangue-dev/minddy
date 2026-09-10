# The seed scripts arrive here, numbered and idempotent.

`015-current-cycle-completed.mjs` moves the five already completed Beacon demo
issues into the current demo cycle so its screenshot shows completion alongside
ongoing work. It preserves titles, statuses, assignees, and completion dates,
creates no records, and uses the shared write guards. The default run only
describes the change; `--apply` requires explicit user approval.

`016-routines.mjs` seeds three demo agent routines on Aurora (weekly security
review, monthly dependency inventory, daily issue triage) plus four historical
runs on the weekly one. Every routine is inserted DISABLED — `enabled: false`,
`next_run_at: null` — so the scheduler can never claim them and no real agent
passage is ever billed. Runs are seeded at rest (`completed`/`failed`, never
`queued`/`running`) with no pull request, for the same reasons as `008-agent.mjs`.
The default run applies after the plan it prints; relaunching is safe, existing
routines and runs are left as they are.
