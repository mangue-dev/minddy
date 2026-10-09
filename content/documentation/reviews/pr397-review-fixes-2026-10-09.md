# PR #397 review corrections

Date: 2026-10-09. Reviewer: `agent:/root`. This is a source and language review
of the additions, not an independent review, human acceptance, microphone
execution, fresh browser capture or operational rehearsal.

## Scope and reader outcomes

- A10: a member records voice, understands which surface receives draft text
  or immediate issue edits, verifies the result and recovers from failures.
  Added `voice-dictation`, `voice-limits` and `voice-recovery` to the existing
  `ai-settings-and-usage` feature guide in all six locales.
- A11: a member exports accessible issues, chooses project/status scope,
  checks completeness and understands the CSV re-import boundary. Added
  `export-issues` and `export-issues-limits` to the existing `issues` guide in
  all six locales. Account transfer remains a separate procedure.
- The coverage ledger now has 92 outcomes. All 90 original workflow IDs and
  their section destinations remain intact. These controls and recovery steps
  are described directly in text; no additional illustration is needed.

## Factual sources checked

- `components/ai-elements/dictate-button.tsx`: microphone permissions and
  device failures, locale hint, timer/waveform, stop and processing states,
  speech/empty-result checks, 20-minute safeguard, size/rate-limit messages
  and recognized-text fallback when cleanup fails.
- `app/api/transcribe/route.ts`: 10 MiB payload cap, 30 requests per account
  per hour, provider resolution, usage preflight and recording, cleanup and
  raw-transcript fallback. Public feedback and the landing demo use separate
  endpoints; the guide does not assign account limits to those endpoints.
- `lib/use-issue-dictation.ts`, `components/issue-side-panel.tsx` and
  `lib/use-objective-dictation.ts`: draft patches, follow-up instructions,
  immediate existing-issue changes and normal permission boundaries.
- `components/assistant/chat-input.tsx`, `components/issue-timeline.tsx`,
  `lib/use-feedback-dictation.ts` and
  `components/routines/routine-prompt-field.tsx`: supported text/draft surfaces.
- `components/app-shell-chrome.tsx`, `components/export-issues-dialog.tsx`
  and `messages/{en,fr,de,es,it,pt-BR}.json`: palette command label, default
  project, status choices, closed-state exclusions, disabled empty selection,
  download/error/truncation feedback.
- `app/api/me/issues/export/route.ts`, `lib/export-api.ts` and
  `lib/export/issues-csv.ts`: access-controlled scope, 20,000-row cap,
  header-only results, CSV fields and attachment/comment exclusions.
- Existing import instructions and `lib/import/minddy.ts`: creation rather
  than update, mapping review and same-batch parent references. Export does
  not promise account restoration, attached-file backup or original IDs.

## Language and retained content

Reviewed English, French, German, Spanish, Italian and Brazilian Portuguese
for equivalent prerequisites, steps, immediate-edit consequences, limits,
failure recovery and transfer boundaries. The export instructions quote the
actual localized command labels, including awkward existing labels; locale
catalogs are not changed. All five added section IDs have the same order in
every language.

The two feature guides advance their revision and English source revision
together. Previous review attribution remains, with this reviewer explicitly
named for the additions. Existing article bodies, commands, figures, alt text,
captions and capture dates are retained. Figure revision numbers advance with
their containing guide; this records continued applicability, not a recapture.
Previous procedural evidence retains its original date and qualification.

## Code and CI corrections

Markdown diagram table cells escape backslashes before pipes and normalize
CR/LF line breaks. A Markdown-parser regression verifies cell boundaries and
rendered text for backslash-plus-pipe values and a trailing backslash.

The account avatar invalidates the board through its lower-level cache-key
export instead of importing the board hook. App links read a shared lightweight
tab-session context; the original provider re-exports the same hook. This
removes the dependency path through app surfaces from public documentation
without broadening its translation catalog or weakening the namespace check.

The sharing-image metadata test checks the entire corpus with one test per
locale. It retains all assertions while avoiding a single five-second deadline
for 252 articles on a busy CI runner.

## Validation

The five targeted Vitest suites pass 97 tests, including the existing public
namespace scanner, app-tab provider behavior, all localized Markdown links,
sharing-card metadata and the new table-escaping regression. The documentation
checker tooling passes nine tests. Release validation reports 252 published
locale guides and 92/92 outcomes. Knowledge, owned-English, lint, typecheck and
diff checks pass. The retention comparison verifies all 90 original coverage
rows, existing article bodies and figure metadata except revision numbers.

No build, Docker restart, new server or browser capture is required for this
correction. The existing excluded knowledge, self-hosting runbooks, locale
catalogs, capture data and illustration bytes are untouched. GitHub CI results
are recorded in the PR conversation after the pushed commit is checked.
