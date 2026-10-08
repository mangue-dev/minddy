# S/W/P illustration audit and capture requirements

Reviewer: Codex agent `review_documentation_locales`, 2026-10-08.
This is an actual agent visual/source audit, not human approval.

## Inspected legacy candidates

Opened the following existing image files and read the visible content:

| Candidate | Actual visible observation | Reuse decision |
| --- | --- | --- |
| `public/captures/workflowIssue-it-light.webp` | Italian creation controls, but English title and description in the unsent modal and English board issue prose behind it. | Replace the draft text in Italian and capture the relevant controls; the English modal prose is essential to its instructional use. |
| `public/captures/pagesEditor-de-light.webp` | German page-navigation chrome, but English page titles and the entire release-procedure body. | Replace visible page text with a faithful German display adaptation, keeping the seeded structure and states. |
| `public/captures/featureCycle-es-light.webp` | Spanish cycle/status controls, but English issue titles/descriptions and category names. | A generic overview cannot prove selection, carry-over or cycle configuration. Capture those controls with necessary readable text localized. |
| `public/captures/scratchpad-pt-BR-light.webp` | Brazilian Portuguese placeholder, but English notebook headings and task prose. | Replace with a Portuguese display adaptation before instructional publication. |

This sample demonstrates concrete language gaps; it is not a claim that all
216 legacy assets were visually reviewed. The filenames and marketing manifest
prove existence only. Historical captures must still match the candidate
release and exact article step. Source references and the approved matrix
identify required captures below; a broad screenshot cannot replace every
row-specific operation.

## Required illustrations from the accepted matrix

| Workflow | Article | Required illustration | Current publication gap |
| --- | --- | --- | --- |
| S01 | `first-project` | New onboarding; reuse workflowIssue and heroBoard | Current six-language instructional evidence is not yet approved. |
| S02 | `account-access` | New auth flow with disposable identity | Main agent owns the new anonymous authentication captures; recovery/security outcomes still need specific evidence. |
| S03 | `account-recovery` | New security controls without secrets | Main agent owns the new anonymous authentication captures; recovery/security outcomes still need specific evidence. |
| S04 | `navigation` | New current desktop/mobile navigation | Current six-language instructional evidence is not yet approved. |
| S05 | `project-settings` | New project general settings | Current six-language instructional evidence is not yet approved. |
| S06 | `project-members` | New invitation/member controls | Current six-language instructional evidence is not yet approved. |
| S07 | `choose-an-instance` | Diagram of responsibility split | Responsibility diagram needs visual approval. |
| W01 | `create-an-issue` | Reuse workflowIssue; new detail/property focus | Current six-language instructional evidence is not yet approved. |
| W02 | `issue-statuses` | Reuse heroBoard; new status control | Current six-language instructional evidence is not yet approved. |
| W03 | `triage-incoming-work` | New triage and sorting controls | Current six-language instructional evidence is not yet approved. |
| W04 | `bulk-issue-actions` | New selected rows and bulk controls | Current six-language instructional evidence is not yet approved. |
| W05 | `issue-dependencies` | New relations in all locales; existing relation shots are candidates only | Current six-language instructional evidence is not yet approved. |
| W06 | `sub-issues` | New parent menu; current candidate lacks six variants | Current six-language instructional evidence is not yet approved. |
| W07 | `implementation-plans` | New localized plan controls; existing en/fr candidate | Current six-language instructional evidence is not yet approved. |
| W08 | `issue-discussion-and-resources` | New comments/resource controls | Current six-language instructional evidence is not yet approved. |
| W09 | `recurring-issues` | New recurrence settings | Current six-language instructional evidence is not yet approved. |
| W10 | `objectives` | New objective create/detail | Current six-language instructional evidence is not yet approved. |
| W11 | `objective-dependencies-and-momentum` | New objective relations plus localized diagram | Current six-language instructional evidence is not yet approved. |
| W12 | `personal-cycle` | Reuse featureCycle; new settings | Current six-language instructional evidence is not yet approved. |
| W13 | `views-and-filters` | New views/filter controls | Current six-language instructional evidence is not yet approved. |
| W14 | `share-a-view` | New share controls and anonymous result | Current six-language instructional evidence is not yet approved. |
| W15 | `search-and-shortcuts` | Reuse featurePalette; new cheatsheet/detail controls | Current six-language instructional evidence is not yet approved. |
| W16 | `notifications-and-inbox` | New Inbox and settings | Current six-language instructional evidence is not yet approved. |
| W17 | `task-notebook` | Reuse scratchpad; new promotion | Current six-language instructional evidence is not yet approved. |
| W18 | `personal-statistics` | New demo statistics | Current six-language instructional evidence is not yet approved. |
| W19 | `trash-and-recovery` | New trash/recovery | Current six-language instructional evidence is not yet approved. |
| P01 | `create-and-organize-pages` | Reuse pagesEditor; new tree controls | Current six-language instructional evidence is not yet approved. |
| P02 | `page-editor` | New editor/block menus | Current six-language instructional evidence is not yet approved. |
| P03 | `page-comments-and-collaboration` | New comments/presence/conflict | Current six-language instructional evidence is not yet approved. |
| P04 | `page-files` | New attachment controls | Current six-language instructional evidence is not yet approved. |
| P05 | `page-history` | New version picker and restore | Current six-language instructional evidence is not yet approved. |
| P06 | `publish-a-page` | New publish dialog plus anonymous result | Current six-language instructional evidence is not yet approved. |
| P07 | `import-export-and-print-pages` | New export/import controls | Current six-language instructional evidence is not yet approved. |
| P08 | `create-a-database` | New setup/type chooser | Current six-language instructional evidence is not yet approved. |
| P09 | `database-cells-and-entries` | New cells and entry panel | Current six-language instructional evidence is not yet approved. |
| P10 | `change-a-database-schema` | New conversion warnings and column controls | Current six-language instructional evidence is not yet approved. |
| P11 | `import-a-database` | New localized import preview | Current six-language instructional evidence is not yet approved. |

## Candidate capture contract

`captures/shots/documentation-product/shot.mjs` runs only against a local
candidate with the existing demo session. Its checked-in translation fixture
maps exact existing page-title and text values in successful GET responses.
All IDs, mention IDs, block types, checked states, hierarchy, timestamps,
provider configuration and results remain unchanged. The fictional release
procedure visible in the demo page is content, not proof of a real deployment.
An unsent issue draft is typed locally and never submitted. Business-write
requests are aborted. Navigation-only `/api/me/app-tabs` writes may persist
application tabs and are recorded separately. Capture records list successful
read-response adaptations and any blocked writes.

The resulting PNGs are candidates. Their provenance records do not set article
publication state or figure approval. Each image must be visually inspected,
paired with a specific article step, and given localized alt text and caption.
A visible menu or form proves only that observed state, not a completed save,
import, restore, publication or revocation. Missing controls/data must be kept
as a gap rather than replaced by fabricated API success or a generic diagram.
