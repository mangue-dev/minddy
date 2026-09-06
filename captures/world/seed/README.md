# The seed scripts arrive here, numbered and idempotent.

`015-current-cycle-completed.mjs` moves the five already completed Beacon demo
issues into the current demo cycle so its screenshot shows completion alongside
ongoing work. It preserves titles, statuses, assignees, and completion dates,
creates no records, and uses the shared write guards. The default run only
describes the change; `--apply` requires explicit user approval.
