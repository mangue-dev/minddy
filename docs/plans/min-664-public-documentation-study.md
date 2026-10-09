# Public documentation scope and publication study

MIN-664 needs a public manual that lets a member finish product work, an operator
run an instance, and an integrator understand the relevant contracts without
searching the repository. Use one versioned public corpus, organize it by reader
tasks, and require equivalent articles and necessary illustrations in all six
languages. The existing knowledge articles are useful source material, but do
not constitute that manual.

**Review status:** the issue owner accepted this study, the
[coverage matrix](min-664-coverage.md), and the
[source inventory](min-664-source-inventory.md) in the 2026-10-08 conversation.
Repository Markdown in the existing Next.js application is the selected
publication approach. The owner also required useful, well-balanced articles
with natural prose; the [editorial guide](../documentation-editorial-guide.md)
defines the authoring and review contract for all six languages. No product
implementation or documentation publication is included in this lot.

## Version and evidence boundaries

- Inventory date: 2026-10-08. Repository snapshot:
  `89ebb59a502884e79e3c5fc459403d26bad1f8f0` on `origin/main`.
- Latest non-draft GitHub release inspected with `gh release view`:
  [v0.11.0](https://github.com/mangue-dev/minddy/releases/tag/v0.11.0), published
  on 2026-09-30. `package.json` is already at `0.11.1`; its changelog is a draft.
  The production Cloud commit has not been established by this repository read.
- Routes, components, knowledge, changelog, configuration, and runbooks are
  evidence for scope and behavior to verify. A route existing on main is not
  proof that its current UI is released. In particular, database editors, PR
  review, Numo, Inbox, settings, and keyboard shortcuts changed after v0.11.0.
- No installation, backup, restore, or representative-reader acceptance is
  claimed here. Those checks need an identified release and disposable instances
  during the implementation lots.
- Repository inventories include locally present internal material. Their
  inclusion in the inventory does not authorize copying their contents or
  images into the public manual.

## Existing content and gaps

The public self-hosting page and installation wizard already have explicit
localized routes. The page is an entry point and overview; detailed operations
still link to tagged repository files. Preserve its URLs and guided installer,
and make essential operations readable inside the manual.

`content/knowledge/` contains 14 product articles plus its README. Numo's
`get_help` uses `lib/server/assistant/knowledge.ts`; the public FAQ also reads
that catalog. Most articles summarize several features in a few paragraphs.
They lack a consistent task structure, procedure-specific permissions, expected
results, recovery steps, and illustrations. They are English only, despite the
assistant's ability to answer in other languages.

The loader has ID, title, summary, category, audience, tags and review date. It
has no publication visibility, locale, translation revision, compatibility,
owner, figure, related-link or stable-section contract. Its ASCII query
tokenization also cannot serve six-language public text search unchanged.
`check:knowledge` checks basic frontmatter and body length, not coverage,
translated parity, links, section IDs, figures, or factual correctness.

`docs/` contains 102 Markdown files before this lot. Some runbooks are directly
useful to operators, while architecture notes need a public explanation written
for their audience. Audits, validation reports, historical plans, security
evidence and Cloud configuration records must not be discovered by a recursive
public loader. The inventory assigns an adaptation or exclusion disposition
to each source.

### Duplication and migration risks

| Sources | Current overlap | Required treatment |
| --- | --- | --- |
| `docs/self-hosting.md`, knowledge `self-hosting`, public page and wizard | Installation prerequisites, topology, encryption, optional services | Keep the wizard as an interactive tool. Adapt canonical procedures once and link the overview and Numo to the same published articles. Preserve old runbook/tag links until their versioned replacements are available. |
| `docs/self-hosting-operations.md`, logical operations and knowledge operations | Backups, upgrades, restore, rollback | Separate installed reference Compose procedures from source/managed logical procedures. Do not splice their commands together. |
| Knowledge `core-tracker` and `productivity` | Cycles, views and triage concepts | Shared concept articles plus separate task guides; avoid repeating normative definitions. |
| Knowledge `agents-and-mcp`, `plans-and-agents`, `repository-skills`, `integrations` | Numo, code workers, Git and agent integrations | Distinguish conversation setup, delegated work, routine occurrences, external Minddy MCP clients, and personal MCP servers used by Numo. |
| Knowledge `desktop-and-speed`, download pages and desktop docs | Installation, updating, dictation and CSV import | Platform setup and import map to their feature guides; voice capture is retained explicitly as A10 in `ai-settings-and-usage#voice-dictation`. Issue CSV export is retained as A11 in `issues#export-issues`, separately from account transfer. Historical local-agent designs are not current product instructions. |
| Knowledge `plans-and-billing`, public pricing and plan configuration | Plans, limits and AI consumption | Use the current pricing/plan definitions for numeric limits. Article revisions must identify the applicable edition and release. |

### Facts that prevent misleading instructions

1. Inbox is a popover and Numo is a shared panel. Their legacy `/inbox` and
   `/numo` routes do not imply separate current destinations. Use the actual
   controls, and include mobile entry points.
2. A personal cycle spans projects and belongs to a user. It is not a team
   project sprint or an objective.
3. Project wiki publication uses secret links and currently remains `noindex`
   through `proxy.ts`. Official documentation must have a separate indexed
   publication path; do not make users' `/p/`, `/share/` or `/f/` links indexable.
4. `self-host:update`, `self-host:backup` and `self-host:restore` are read-only
   preflight wrappers for the logical operations runbook. They do not carry out
   the complete operation. The guide must include the actual procedure.
5. Reference full-profile physical backups require a stopped consistent stack
   and the matching architecture/PostgreSQL image. Logical or provider backups
   have a different recovery contract. Both need Storage bytes and configuration
   as well as database data.
6. `docs/self-hosting-auth.md` explicitly identifies
   `docs/auth-supabase-config.md` as historical Cloud maintenance evidence.
   Adapt the former; exclude the latter from public content discovery.
7. The public core is common to Cloud and self-hosted. Managed billing/AI,
   provider credentials, scheduler and optional integration configuration change
   availability. Do not invent a reduced self-hosted feature tier.
8. Content encryption is at rest, not end-to-end encryption. Root-key
   preservation and matching-key restore belong in operator guides. Internal
   rollout/audit evidence is not a substitute for those guides.
9. Older version literals in logical-backup examples and reasoning-model notes
   need compatibility review. They are not instructions to use those versions
   for a new installation.
10. The PR template still mentions only English/French catalogs. Documentation
    maintenance must cover all six locales and associated illustrations.
11. Smart Triage now uses deterministic sorting rules. Its former settings
    component and experimental AI mode were removed after v0.11.0. Some existing
    summaries still describe configuration surfaces too broadly; check the
    current sort controls and released version before adapting their wording.

## Comparison of documentation references

The table separates observed presentation from choices for minddy. Reference
pages were read on 2026-10-08. Linear, Notion and the ChatGPT collection were
also inspected at a 390 by 844 viewport. This is a focused comparison, not a
complete accessibility audit or a test of every translated article.

| Reference | Article types and navigation | Search and illustrations | Mobile and translation | Practice for minddy |
| --- | --- | --- | --- | --- |
| [Notion help](https://www.notion.com/help), [sharing guide](https://www.notion.com/help/sharing-and-permissions) | Feature groups, introductory articles, task sections, permissions reference and FAQ; related next article and section links. | Search input on the article; UI images open in a lightbox; video supplements the steps. | Mobile collapses the global menu; paragraphs and numbered steps remain readable. The language menu retains the sharing article; the French version was opened. It signals possible AI translation. | Keep tasks, permission conditions, expandable screenshots and related guides. Validate translations rather than treating a language menu as proof of parity. |
| [Linear docs](https://linear.app/docs), [start guide](https://linear.app/docs/start-guide) | Feature-oriented sidebar, beginner guide, concepts, admin/integration sections, breadcrumbs, anchored contents and next article. | Search opens a command dialog. An anonymous query for `sub-issues` returned matching articles with excerpts. Introductory video and copy-as-Markdown controls. | Mobile moves sidebar navigation into a menu and keeps readable article width; the desktop contents rail disappears. The inspected guide exposed no language switcher. | Use strong feature navigation, textual search excerpts, keyboard access and portable article content. Keep mobile contents and language selection directly available. |
| [Blender manual](https://docs.blender.org/manual/en/latest/), [writing guide](https://docs.blender.org/manual/en/latest/contribute/manual/guides/writing_guide.html), [translation guide](https://developer.blender.org/docs/handbook/translating/translator_guide/) | Reference-manual organization with getting started, interface, technical reference, troubleshooting and glossary. Writing guidance emphasizes useful, concise and maintainable coverage. | Indexed official content exposes illustrated reference pages and version/language selectors; glossary terminology supports translations. | Live manual access was blocked by the site's challenge and web-reader errors, so current mobile layout and search interaction are unverified. Official translation guidance describes glossary use and review. | Keep explicit compatibility, glossary and troubleshooting. Do not infer current responsive behavior or translation completeness from indexed content. |
| [ChatGPT collection](https://help.openai.com/en/collections/3742473-chatgpt), [data export article](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data) | Collections and platform subcollections; task guides, settings and FAQ. The export guide separates availability, steps, expected delivery and failure recovery. | Text article search and article summaries; the sampled export procedure works without screenshots. | The mobile collection shows search, breadcrumbs and a language control above the article list. After dismissing cookies, the browser returned a site error; search results and language switching were not verified. | Put prerequisites, availability and expected results before troubleshooting; use screenshots only where they clarify the action. Make search failures recoverable without removing navigation. |
| [Diataxis](https://diataxis.fr/) | Separates tutorials, how-to guides, explanation and reference according to reader needs. | Editorial structure rather than a product search requirement. | The framework does not select a renderer or translation pipeline. | Add troubleshooting as a findable task category. Article type controls structure, while reader goal controls navigation. |

The additional references support editorial choices, not a requirement to copy
their engines, assets, exact layout or content. No reference establishes the
cost or maintenance fit of a publishing tool for this repository.

## Proposed navigation and article structure

Offer three audience entrances: **Use minddy**, **Run your own instance**, and
**Integrate and understand**. These are curated starting pages over one catalog,
not independent copies of the same articles. Search and a full topic tree are
always available. Tutorials link to task guides; task guides link to concepts,
reference and troubleshooting when needed.

The stable article IDs and retained workflows are in the coverage matrix. The
navigation groups below are proposed labels to translate with the product
glossary. Groups are not a license to reduce coverage to one article each.

| Group | Articles and paths covered |
| --- | --- |
| Get started | First project to first completed issue; sign-in/confirmation/recovery; navigation; inviting a collaborator; choosing Cloud or self-hosted. |
| Projects and issues | Project/member settings; create and triage issues; properties, statuses, bulk actions, recurring issues, dependencies, sub-issues, plans, comments/resources; objectives and progress. |
| Plan and find work | Personal cycle; saved and shared views; filters/sort/grouping; global search and shortcuts; Inbox/mentions; notebook; statistics; trash/recovery. |
| Pages and databases | Wiki hierarchy; blocks and mentions; comments/presence; attachments; history/conflicts; public sharing/revocation; page export/print/import; database schema, cells, entries, conversion and import. |
| Feedback | Publish/configure board; visitor submission/votes/My feedback; moderation, private discussion, public response, duplicates, promotion/status sync; pages/views; ingestion/SSO. |
| Numo and automation | Conversation/context/model; actions and permissions; delegated work; run recovery and PR review; routines/caps; repository skills; personal MCP connections; external Minddy MCP clients. |
| Settings and data | Profile/preferences/security; notifications/devices; AI keys and usage; project automation; Git connections/sync; issue import; instance transfer; subscription; analytics/privacy. |
| Apps | Web/mobile differences; PWA install and notification conditions; desktop setup/server picker/tabs/shortcuts/updates. |
| Self-hosting | Compatibility/topology; guided local/server install; managed/full/source profiles; configuration, auth/email, Storage, proxy/jobs, encryption; optional providers; update/backup/restore; diagnostics and instance administration. |
| Technical concepts and reference | Glossary/data model; access/public-link boundaries; architecture/data flows; encryption; Numo execution; MCP/API/webhooks and Git sync. |
| Troubleshooting | Account/email, lost access, import failures, public links/files, MCP authentication, unavailable AI/budget, failed or interrupted runs, install/update/restore and network failures. |

### Article templates

| Type | Required structure |
| --- | --- |
| Tutorial | Goal and demo scenario, audience/edition/version, prerequisites, ordered steps, checkpoints, final result and next tasks. |
| Task guide | Outcome, permissions and prerequisites, entry point, steps, expected result, limits, relevant failures and linked reference. |
| Explanation | Question answered, concepts and boundaries, concrete example or diagram, edition/provider differences, links to tasks and reference. |
| Reference | Applicable release/profile, exact fields/options/limits/permissions, examples, related operations and source provenance. |
| Troubleshooting | Observable symptom, safe diagnostic checks, cause/condition, recovery, verification and escalation with sanitized evidence. |

## Illustrations and language coverage

The public marketing catalog has 12 screenshot slots, each with six locales and
both themes: 144 exact slot/locale/theme WebP variants. There are 216 WebP files
under `public/captures/` including 72 additional focused variants. These counts
describe files, not approval for documentation use. The source inventory lists
capture groups and locale gaps, including plan and keyboard screenshots present
only in English/French and newer relation/PR/database examples with narrower
coverage.

Two published images were visually inspected: `pagesEditor-en-light.webp` and
`numoPanel-fr-light.webp`. They use the Aurora demonstration world. The French
Numo image has French chrome but English prompt/answer and issue content. It
cannot illustrate a French procedure that depends on reading the conversation
without a new localized capture. The wide page screenshot is useful context
but needs a closer crop or dedicated shot for specific controls.

Reuse the capture tooling and demonstration data after checking its target
against the chosen release. The slot catalog itself warns that historic capture
intentions described nonexistent UI. A screenshot file or a translated shell
does not prove that every label, conversation, data value or depicted workflow
matches the procedure.

Each required figure needs an ID, article/section association, source revision,
capture date, viewport, locale, theme policy, caption and alternative text.
Textual UI evidence must use the article locale, including demo conversations
and labels that readers need. Neutral diagrams can share their geometry; any
visible labels need all six translations. Capture light mode by default and
verify contrast in both site themes. Never shrink a full desktop screenshot
until its instructional detail is unreadable on mobile; allow expansion and
use a focused mobile illustration where the entry point differs.

Articles, headings, navigation, search excerpts, empty/error states, glossary,
alt text and captions need `en`, `fr`, `de`, `es`, `it`, and `pt-BR`. Each
translation records the source revision reviewed. Publication requires all six
variants at that revision and all mandatory figures; completeness cannot be
inferred from matching filenames, word counts, or copied English placeholders.
Future locale-specific prose is intentional runtime content in explicit locale
directories. Adapt the English-prose checker only for that narrow boundary,
keeping source comments and contributor documentation English.

## Publication options after the inventory

The scope needs anonymous server-rendered articles, explicit locale URLs,
stable anchors, product styling, typed metadata, text search, image validation,
release compatibility and a shared Numo source. Compare tools on those needs.

| Option | Fit to the observed needs | Maintenance consequences |
| --- | --- | --- |
| Repository Markdown rendered by the existing Next.js app | Reuses marketing layout, public routes, six catalogs, theme controls and Markdown dependencies. One article catalog can drive navigation, sitemap, search and Numo. | Requires a documentation loader, safe renderer, explicit sections/figures and checks. Avoid creating a general-purpose CMS. |
| A separate documentation engine | May provide navigation, search and versioning conventions out of the box. | Requires a demonstrated six-locale/capture parity path, design integration, route/indexing integration and a Numo ingestion contract. Adds deployment and dependency ownership. Evaluate a small representative prototype before choosing. |
| Hosted knowledge service or CMS | Could simplify browser authoring and review. | Introduces another source/deployment boundary, export/version requirements and public/internal access policies. No demonstrated need outweighs the repository source-of-truth requirement yet. |

**Selected after review:** use repository Markdown and the existing Next.js
marketing shell. The issue owner accepted this approach on 2026-10-08. No new
dependency or renderer has been selected or implemented; choose those during
implementation against the content and validation contracts below.

### Proposed content contract

- `content/documentation/` owns published product knowledge in locale
  subdirectories. Each article has one stable ID, type, audience, topic,
  localized title/summary/path, published state, source revision, reviewed
  revision/date, maintainer, compatibility/profile, related IDs and figure IDs.
- A catalog records workflow IDs from the matrix and explicit section IDs.
  Translated headings keep the same semantic section ID. Slug changes require
  redirects; language switching maps by article ID and preserves section ID.
- Add nested docs URL resolution to `lib/public-routes.ts`, `lib/locale-href.ts`
  and `proxy.ts`; update `next.config.mjs` locale/cache handling and sitemap
  enumeration. Existing helpers handle a finite set of complete paths, so
  adding only `/docs` would not localize/index every nested article.
- Reuse the marketing layout and design tokens for a topic sidebar, article,
  contents, breadcrumbs, locale control, search results and related links.
  Mobile gets accessible navigation and contents disclosures. Search is usable
  without credentials, AI configuration or a backend session.
- Index only published official locale articles, with article canonical,
  reciprocal language alternates and true review/update timestamps. Exclude
  drafts/internal content from HTML, sitemap, search and Numo. Do not route
  official articles through secret-token wiki publication.
- Text search ranks titles, summaries, headings, tags/glossary synonyms and
  body passages within the selected locale. Normalize accents and punctuation
  without discarding supported-language words. Return localized snippets and
  section links. Start with a measured catalog/index; select a more complex
  search service only if real corpus size or latency requires it.
- Public navigation and footer link to the center. The app's
  `components/app-sidebar.tsx` `ChangelogButton` has desktop and mobile help
  menus; add the documentation entry to both with the account's locale.
- Numo product help must resolve this official published catalog and include
  source IDs/URLs/revisions. Internal behavior instructions stay separate. Keep
  existing topic IDs as aliases while splitting articles so existing `get_help`
  calls remain valid. `audience: developer` is not a privacy classification.
- The current FAQ passes small articles into one prompt and gives developer
  articles only as topic summaries. Do not inject the whole expanded manual.
  Keep a bounded, relevant published subset and source links; preserve the
  existing configuration, disablement and cost protections. A new anonymous AI
  question field is optional. Numo's reuse of the official corpus is retained
  because the issue owner's added context explicitly requests it.

## Contribution and release maintenance

The current `.github/CODEOWNERS` names `@mangue-dev` as primary maintainer until
another is named. Use that existing responsibility, with explicit documentation
paths and article maintainers. Assign locale reviewers and operator/integrator
reviewers before publication; do not claim that a machine check substitutes for
their review.

1. A feature change identifies affected workflow/article/figure IDs in its PR.
   Update English source, all translations, glossary and required captures in
   the same release set. Compatibility changes also update operator procedures.
2. The reviewer confirms prerequisites, exact entry point, permissions,
   observable result, limits, failure recovery, current illustrations and
   source-revision parity. Record the real review date, not every build date.
   Apply the [editorial guide](../documentation-editorial-guide.md), including
   factual checks, proportionate detail, natural prose and language review.
3. CI checks unique IDs/paths, required metadata, publication status, relative
   links and anchors, related IDs, workflow coverage, all six variants,
   translation revisions and required figure variants. External links get a
   bounded checker with explicit exceptions for unavailable sites.
4. Release review compares shipped UI/configuration/migrations with affected
   matrix rows. Keep verified procedures associated with the release/profile
   used; older releases retain their immutable tagged source/runbooks.
5. Every article has a localized error-report link carrying its public article
   ID, locale and revision into the existing bug/feedback flow. A visitor can
   report without needing a Minddy account; do not send private account data.

Do not auto-publish repository Markdown by glob. Contributor/security workflows,
validation evidence, audits, production configuration and private incident
records are outside the public catalog even when they exist locally. Public
licensing, operator responsibilities and generic security explanations remain
in scope after deliberate adaptation.

## Delivery lots and acceptance evidence

| Lot | Work and concrete integration points | Exit evidence |
| --- | --- | --- |
| 1 Scope and review | This study, source inventory, workflow matrix and issue plan | Issue owner reviews tree, exclusions, source migration, publication recommendation and release boundary. |
| 2 Catalog and public UI | `content/documentation/`, `lib/server/documentation.ts`, `lib/documentation.ts`, `app/(marketing)/docs/`, `components/documentation/`, public routes/SEO/sitemap, marketing nav/footer and app help menus | Representative translated articles can be read anonymously, searched and linked directly; keyboard/mobile/themes/locale switch and indexing pass. |
| 3 Product guides | Every retained member/owner/visitor workflow in the matrix | Complete task outcomes, permission and edition limits, all six texts and instructional figures; no one-page-per-topic substitution. |
| 4 Operators and integrators | Adapt self-hosting, edition, encryption, Git/MCP/API contracts; preserve existing installer and versioned references | Install, update, complete backup, blank-target restore and diagnostics on an identified supported profile; examples omit secrets and essential instructions are public. |
| 5 Shared knowledge and maintenance | Numo/FAQ adapters, checks, PR/release checklist, CODEOWNERS and error reports | Published-only help retrieval and FAQ regression checks; no parallel product copies; link/anchor/locale/revision/figure/coverage checks enforce the content contract. |
| 6 Reader acceptance | Representative member, project owner, operator and integrator sessions | Readers complete the journeys below without finding essential information in the repository; fix gaps and repeat failed journeys. |

| Required reader journey | Observable result and evidence to record |
| --- | --- |
| First use | New member confirms account, creates/joins a project, creates and completes an issue; record confusing labels, missing prerequisites and mobile differences. |
| Issue management | Owner triages incoming work, adds a dependency and sub-issue, tracks plan tasks and objective/cycle; verify another member's permissions. |
| Page sharing | Create a page with an attachment, publish a read-only link, open it anonymously and revoke it; verify which child/file content remains accessible. |
| Numo | Open from the current view, send a contextual request, read changed work/source help and handle unavailable AI or exhausted usage. Code delegation is tested with an isolated demo repository. |
| Installation | Operator chooses local/managed/full route, checks compatibility, configures URLs/auth/email/storage and verifies a new account on the selected release. |
| Operations | Operator creates a consistent complete backup, upgrades the next supported release, restores to a blank target and checks content, files, login, jobs and matching encryption keys. |

Automation is supporting evidence, not a substitute for the requested readers.
The matrix remains the scope ledger until every retained workflow has complete
localized content, verified necessary figures and acceptance evidence. MIN-664
stays in progress during this first lot.

## Review outcome: 2026-10-08

The issue owner accepted the preliminary scope in conversation. This approves
the audience entrances, retained matrix workflows and exclusions, repository
Markdown publication in the existing application, and the shared official
corpus for Numo with optional new anonymous AI Q&A. The owner explicitly added
editorial quality: useful verified information, readable and proportionate
articles, and avoidance of mechanical prose. The editorial guide makes this a
publication requirement for every locale.

Before publishing procedures, establish the applicable shipped release and
Cloud baseline. Assign qualified article/locale reviewers and representative
readers, and retain sanitized acceptance records with the article revisions.
Those verification activities remain open; no procedural or reader approval
is inferred from approval of the scope.

## Delivery follow-up: 2026-10-08

The accepted scope now has 90 complete articles in each of six locales and
approved localized illustrations. The [delivery ledger](min-664-delivery.md)
records independent agent reviews authorized by the owner, actual representative
reader executions, the identified adapted self-hosted lifecycle, and anonymous
production-build checks. The historical findings and first-lot limits above
remain unchanged; later evidence does not turn them into successful tests.
No human acceptance, unchanged-tag installation, current Cloud deployment
version or production deployment is inferred from the delivered candidate.

## Editorial direction change: 2026-10-09

The owner requested one guide per recognizable feature or subject throughout
the documentation, including self-hosted operations. This supersedes the
initial preference for separate narrowly scoped task articles. Readers choose
the feature first, then use the hierarchical contents to reach its tasks,
explanations, reference and recovery steps. A navigation domain still contains
several guides; it does not become one oversized article.

The [feature-guide migration](min-664-feature-guides.md) consolidates the 90
source articles into 42 guides in each of six languages, with the same 90
retained workflows and localized illustrations. It preserves independent
features and audience-specific prerequisites, maintains legacy article/section
links and updates the editorial contract. Earlier study findings, operational
evidence and release qualifications remain historical evidence; a structural
rewrite does not establish a newer release or a fresh operational execution.
