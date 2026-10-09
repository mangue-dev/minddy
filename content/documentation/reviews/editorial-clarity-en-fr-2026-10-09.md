# English and French editorial clarity review

Reviewed on 2026-10-09 by the dedicated EN/FR editorial subagent, using the
public documentation editorial guide and the UX writing skill. The scope was
all 42 feature guides in each locale, including their openings, procedures,
references and recovery sections: 84 article files. The audience remains the
members, owners, integrators and operators identified by each guide. Existing
workflow coverage and compatibility conditions remain the basis of the review.

The review changed nine article pairs and four additional French guides. Other
guides were retained where their length supplied useful task detail rather than
filler. There was no word-count target. Titles and summaries already described
their features clearly and did not require changes.

| Guide | Editorial decision |
| --- | --- |
| Accounts | Number the signup sequence, preserve password and confirmation requirements, and remove the repeated sign-out instruction. |
| AI settings and usage | Keep the detailed cost/quota contract in its budget section and link to it from personal-key setup instead of repeating it. Define BYOK alongside personal keys. |
| API and webhooks | Present issue field limits in a lookup table. Consolidate feedback fields and moderation in the ingestion section, preserving optional `user.name`, identity requirements, boolean `analyze` and rejection of the string "false". Link to the existing vote endpoint and limits. |
| First project | Move the existing-project invitation alternative before the tutorial. Split project setup and its finishing step so the beginner can follow each stage. Align the French manual-assignment instruction with the English source. |
| Issues | Separate deterministic Smart Triage rules into readable bullets while retaining blocking tiers, objective grouping, tie-break order and the limits of the ranking. |
| Objectives | Separate the forecast prerequisites from the two target-date/history cases and retain warnings about sparse history, changing scope and unattached work. |
| Self-hosted diagnostics | Replace the dense symptom paragraph with a five-row symptom/check table. Keep migration, Storage and secret-handling precautions beside the relevant symptom. |
| Task notebook | Put the AI prerequisite before promotion and number the request, destination, submission and verification stages. Preserve the distinction between opening Numo and creating an issue. |
| Views | Replace the repeated general sharing explanation with a link to the guide's publication and revocation procedure. |
| Architecture and data flows (French) | Replace telegraphic wording with complete sentences identifying durable data, request authorization and external destinations. Retain the infrastructure and sandbox boundaries. |
| Encryption and data boundaries (French) | Clarify server-side decryption, readable metadata and coordinated recovery without weakening the limits on operator access or historical copies. |
| Instance administration (French) | Clarify administrator prerequisites, conditional panels and operator duties. Preserve role identifiers, MFA requirements and fail-closed checks. |
| Numo (French) | Describe durable execution and reconnection in natural French, retaining every state identifier, uncertain-write rule and ownership boundary. |

## Preserved detail and limits

The review retained complete backup, restore, installation and upgrade
procedures. Their safeguards about stopped writes, matching database/Storage
data, encryption keys, blank targets and release-specific workarounds remain
necessary. Permission boundaries, publication revocation, signed-file expiry,
uncertain writes and import recovery were also retained where readers need
them independently in each task.

This is an editorial review of the existing documented behavior, not a new
release acceptance test or an approval of every current product claim. It did
not rerun operator procedures or change their recorded compatibility. The
visual review, capture replacement and publication revision updates are handled
separately. Frontmatter, image lines, captions, fenced executable examples and
explicit anchors were left unchanged in the initial prose pass. The other four locales are
reviewed separately against the same behavior.

## Collection-diagram caption follow-up

A final file-only pass replaced the ten collection-layout diagram captions in
English and French, across nine guides per locale. Each caption is now one
sentence explaining the relationship or practical consequence of the diagram,
rather than repeating every card label after a generic responsibilities sentence.
The captions retain the distinction between public and private services,
publication and file-link expiry, durable data and matching recovery keys,
server decryption and external data protection, and local service lifecycle.

This follow-up changed only caption values in article frontmatter. Other fields,
article bodies, revisions, image references and source identifiers were
preserved. It used no browser, server, Docker workflow, build or test run; the
coordinating agent handles the final checks under the local resource limits.

## Verification of the initial prose pass

- `npm run check:owned-english` passed.
- `npm run check:documentation` passed: 252 locale articles and all 90 workflows
  published in all six languages.
- `git diff --check` passed.
- A comparison with the starting Git revision across all 84 EN/FR files
  confirmed unchanged frontmatter, image lines, fenced examples and explicit
  anchors. No application source or excluded path was edited by this subagent.

These checks establish structural preservation; they do not replace language
judgment, reader testing or the separate review of updated illustrations.
