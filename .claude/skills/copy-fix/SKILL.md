---
name: copy-fix
description: >-
  Apply a validated copy audit to an application's source code — rewriting, removing, splitting, or
  restructuring user-facing text, and implementing display changes (info-icon tooltips for
  progressive disclosure, length limits with truncation + tooltip). Use this AFTER `copy-audit` has
  produced copy-audit.json and the user has reviewed it and answered any questions. Trigger on
  "apply the copy audit", "apply copy-audit.json", "fix the copy", "implement the audit",
  "clean up the strings now". This skill EDITS the real source files directly (i18n JSON, hardcoded
  JSX/TSX strings, components). It refuses to run if any audit finding is still an unanswered
  question, and it never invents replacement text.
---

# copy-fix

Phase 2 of the `copy-audit` → `copy-fix` workflow. It edits source files directly (that's the
point — it's running inside a coding agent). Review afterwards is via `git diff`; do not auto-commit.

## Step 0 — Preconditions and the hard gate

1. Load `copy-audit.json`. If it's missing, stop and tell the user to run `copy-audit` first.
2. **Hard gate**: scan for any finding with `action == "NEEDS_ANSWER"` that has no resolution. If
   even one is unresolved, **STOP**. List those questions and ask the user to answer them (or to
   explicitly skip them). Never apply an unresolved finding, and never fill in the answer yourself.
   This gate is non-negotiable — it's what keeps the AI from inventing.
3. Confirm the repo is clean-ish (uncommitted changes exist? warn, so `git diff` stays readable).

Answered questions: the user's answer becomes the `proposed` text (or "remove"/"skip"). Apply it
verbatim as decided; still never invent beyond what they said.

## Step 1 — Apply findings by action

Work file by file to keep edits localized and diffs clean. Only touch human-facing **values** and,
for display changes, the minimal JSX around them. Never rename keys/ids or change program logic.

- **rewrite** — replace the text in place. For i18n, edit the value at its key. For hardcoded,
  replace the string literal / text node. Keep surrounding code and formatting intact.

- **remove** — delete the string. If it's an i18n key, remove the key **and** every reference to it
  (grep the `code_refs`); if that leaves a dangling/empty element (e.g. an empty `<p>`), remove the
  element too. If it's a hardcoded string, remove the element it rendered when the element has no
  other purpose. Don't leave empty wrappers.

- **info_overload split** — keep the primary element's text minimal; move the secondary idea to
  helper text or a tooltip per the audit's `proposed`. This may require a small, local JSX edit.

- **to_tooltip** (progressive disclosure) — replace the inline explanation with an info `(i)` icon
  that reveals the text on hover/tap. Use the project's existing tooltip primitive; see
  `references/patterns.md`. If no primitive exists, don't hand-roll one silently — note it in the
  report and leave the text inline.

- **truncate_tooltip** — apply truncation (CSS) and expose the full text on hover/tap. See
  `references/patterns.md`.

## Step 2 — i18n discipline (never silently translate)

If the app has multiple locales and the audit only covered some:

- Edit only the audited locale file(s).
- For every key you changed, find the same key in the **other** locale files. Do **not**
  machine-translate them — that's inventing. Instead, list them in the report as "à retraduire",
  so the other-language copy doesn't silently drift out of sync. Offer to audit those locales too.

## Step 3 — Report

Write `copy-fix-report.md`:

- **Applied**: grouped by file, each change as `current → new` (or "supprimé"), with the category.
- **Blocked / skipped**: unresolved questions the user chose to skip, missing tooltip primitive,
  other-locale keys needing translation, anything you declined to touch and why.
- **Review**: tell the user to run `git diff` to review, and that nothing was committed.

Keep edits reviewable: prefer many small precise edits over sweeping rewrites, so the diff reads
cleanly and any single change can be reverted on its own.