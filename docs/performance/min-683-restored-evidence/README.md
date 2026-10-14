# Restored-tab performance evidence

The compressed JSON files preserve successful runs, rejected experiments and
failed attempts. They contain request paths/status/timings, renderer work,
complete-content observations, source/build identity and cleanup results.
Screenshots and restoration journals containing fixture documents stay in the
ignored local output directory.

The audit rejects response bodies, document content, auth values and common
credential patterns. Duplicate fixture paragraphs become SHA-256 hashes; cookie
metadata becomes counts. Original, audited and compressed file hashes are listed
in [`min-683-restored-results.json`](../min-683-restored-results.json).

Regenerate the report and evidence from completed local runs:

```sh
node scripts/performance/summarize-restored-evidence.mjs
node --test scripts/performance/summarize-restored-evidence.test.mjs
```

First activations, repeated alternation, renderer startup, executable startup and
focus return remain separate. A visible shell never satisfies complete-content
readiness. Five warm observations produce p50/max, with p95 omitted; one first
activation or executable launch cannot establish a population percentile.

Paired conclusions require matching runtime, viewport, workload, protocol and
runner source hash. Historical v1 ordinary hashes cover the runner and three
prerequisite helpers; historical v1 executable hashes cover their own runner.
Later protocols record their dependency lists explicitly and verify they stay
unchanged during measurement. Failed and diagnostic runs
are excluded. Focus results require an actual observed loss of focus; historical
focus-emulation failures remain visible in the report. Native ordinary focus
return does not by itself verify remote changes, permission recovery or saves.

The old cohort had empty triage, feedback and objective collections. It cannot
establish readiness for populated secondary views. The populated cohort records
its manifest, content fingerprints and source counts separately. Its predicates
require exact collection identities, editable selected details and confirmed
fixture activity. Detail switching follows the ordinary tab loops and is reported
separately, including the default eight open feedback rows and the explicit
ten-row All filter. Triage counts stay separate from kanban counts.

One historical failed native launcher incorrectly recorded a newer Git HEAD
against the unchanged baseline build. Its declared SHA remains in the audited
raw file; the report documents that exact correction and excludes the run.
Unknown or mismatched product provenance is never silently repaired.
