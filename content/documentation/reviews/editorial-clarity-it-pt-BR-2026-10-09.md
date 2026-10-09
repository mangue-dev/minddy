# Italian and Brazilian Portuguese editorial clarity review

Reviewed on 2026-10-09 by `agent:/root/editorial_it_pt`.

## Scope and reader brief

Reviewed the 42 public feature guides in each of `it` and `pt-BR` (84 locale
articles), following `docs/documentation-editorial-guide.md` and the UX writing
skill. Member guides help readers complete account, project, issue, page and
Numo tasks; operator guides explain installation, configuration, backup,
restoration and integration boundaries. Existing workflow IDs and edition,
release and platform conditions remain the scope of each article. The retained
English guides were the meaning reference for edited passages. This review
covers editorial usefulness and language, not fresh acceptance of the stated
release or installation profile.

## Decisions

- Replace repeated inventories such as “here you find” and “the following
  sections describe” with the feature's scope, responsible actors and useful
  next action. Keep export, access, deletion and billing conditions beside the
  relevant task.
- Split long paragraphs when they combine different checks or procedures:
  account creation versus email confirmation, local-launch diagnosis versus
  recovery, objective forecast inputs versus interpretation, deterministic
  triage ordering versus its limits, and release flags versus runtime behavior.
  Retain technical thresholds and exceptions.
- Consolidate feedback API fields and moderation behavior under the existing
  `#feedback-ingestion-and-sso` section. Link from `#send`, and make issue field
  limits a three-row lookup table. Preserve optional fields, boolean validation,
  unchanged-text behavior, identity checks, visibility conditions and examples.
- Replace the identical second sandbox-storage explanation in installation
  with a link to `#known-runner-limits` and a reminder about isolation and the
  dedicated worker image. The complete `noexec`, musl, UID/GID and mount-security
  explanation remains in the same guide.
- Link page import and device-notification references to their actual local
  procedures. Clarify that downloaded public copies cannot be withdrawn;
  avoid Portuguese wording that could suggest file-recovery failure.
- Correct project-key parity: keys use two to five ASCII letters, not digits.
  This matches `lib/project-key.ts:4-16` and the `isValidKey` rejection in
  `app/api/projects/route.ts:102`. This was checked in source, not by rerunning
  project creation in the application.

Changed 19 Italian and 20 Brazilian Portuguese articles. Shared edited guide
IDs: `accounts`, `ai-settings-and-usage`, `api-and-webhooks`, `applications`,
`databases`, `feedback`, `install-locally`, `installation`, `issues`,
`navigation`, `notifications-and-inbox`, `numo`, `objectives`, `pages`,
`personal-statistics`, `projects`, `self-hosted-diagnostics`, `views`, and
`workspace-encryption`. Brazilian Portuguese additionally changes
`encryption-and-data-boundaries` to explain the operator boundary naturally.
The remaining guides retain their useful task detail without an arbitrary
shortening target.

## Verification and limits

Before handing the locale files back to the visual pass:

- `npm run check:owned-english` passed.
- `npm run check:documentation` passed: 252 locale articles and all 90 workflows
  published in six languages.
- `git diff --check -- content/documentation/it content/documentation/pt-BR`
  passed.
- A comparison of all 84 locale files against `HEAD` confirmed unchanged
  frontmatter, explicit anchors, fenced executable examples and image Markdown.
  The editorial edits do not modify figure metadata, captions, review metadata
  or article revisions; the main review handles those separately.

No installation, provider integration, backup, restore or account workflow was
rerun during this pass. Source and translation comparison do not certify
production behavior or replace a qualified human language review or reader
acceptance. Screenshot quality and illustration suitability are outside this
editorial assignment.

## Follow-up: collection diagram captions

On 2026-10-09, shortened the ten collection-layout diagram captions in each
locale to one idiomatic sentence explaining the relationship or reader action.
Removed repeated card-label inventories from architecture, encryption boundaries,
glossary, local installation, managed/source installation, optional providers,
network/jobs, public-link permissions, Storage, and workspace encryption.
Only the caption strings were edited in the locale articles; bodies, figure
identifiers and references, other metadata, and revisions remain unchanged.
This follow-up used file edits only, without browsers, servers, Docker, builds
or tests. The root review handles subsequent lightweight verification.
