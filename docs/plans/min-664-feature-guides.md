# MIN-664 feature-guide migration

The owner requested a feature-first manual on 2026-10-09 and explicitly included
all documentation domains. This is a deliberate change from the initial
philosophy of many narrowly scoped task articles: a reader chooses a recognizable
feature, then uses its contents to find the procedure or reference they need.
The navigation domains remain groups of features rather than becoming articles.

## Scope and boundaries

The baseline is commit `095ff93bf3ba7685e08155cc9e7cf2d2d66e44fd`: 90 articles and 225 stable sections
per locale. The new catalog has 42 guides per locale, or 252 localized articles.
All 90 workflow outcomes in the approved coverage matrix remain mandatory.
The matrix, coverage ledger, related articles, search tags and welcome cards now
point to the feature guides. Former task titles remain searchable tags.

| Guide | Retained source articles |
| --- | --- |
| Getting started (`first-project`) | `first-project` |
| Cloud and self-hosted instances (`choose-an-instance`) | `choose-an-instance` |
| Accounts (`accounts`) | `account-access`, `account-security`, `account-recovery`, `profile-and-preferences`, `privacy-and-account-deletion` |
| Account data transfers (`transfer-between-instances`) | `transfer-between-instances` |
| Web, mobile and desktop apps (`applications`) | `web-and-mobile`, `install-the-pwa`, `desktop-app`, `devices-and-notifications` |
| Projects and members (`projects`) | `project-settings`, `project-members` |
| Issues (`issues`) | `create-an-issue`, `triage-incoming-work`, `issue-statuses`, `issue-discussion-and-resources`, `issue-dependencies`, `sub-issues`, `implementation-plans`, `recurring-issues`, `bulk-issue-actions`, `import-issues` |
| Objectives (`objectives`) | `objectives`, `objective-dependencies-and-momentum` |
| Views and filters (`views`) | `views-and-filters`, `share-a-view` |
| Navigation and search (`navigation`) | `navigation`, `search-and-shortcuts` |
| Inbox and notifications (`notifications-and-inbox`) | `notifications-and-inbox` |
| Personal cycles (`personal-cycle`) | `personal-cycle` |
| Task notebook (`task-notebook`) | `task-notebook` |
| Personal statistics (`personal-statistics`) | `personal-statistics` |
| Trash and recovery (`trash-and-recovery`) | `trash-and-recovery` |
| Pages (`pages`) | `create-and-organize-pages`, `page-editor`, `page-comments-and-collaboration`, `page-files`, `page-history`, `publish-a-page`, `import-export-and-print-pages` |
| Databases (`databases`) | `create-a-database`, `database-cells-and-entries`, `change-a-database-schema`, `import-a-database` |
| Feedback (`feedback`) | `publish-a-feedback-board`, `submit-and-follow-feedback`, `moderate-feedback`, `feedback-to-issue`, `feedback-pages-and-views` |
| Numo (`numo`) | `work-with-numo`, `numo-permissions-and-approvals`, `numo-execution-model`, `numo-mcp-connections`, `recover-numo-work` |
| Code work and pull requests (`code-work`) | `delegate-code-work`, `review-pull-requests` |
| Git repositories and issue sync (`git`) | `git-accounts-and-repositories`, `forge-issue-sync` |
| Scheduled routines (`scheduled-routines`) | `scheduled-routines` |
| Repository skills (`repository-skills`) | `repository-skills` |
| AI settings and usage (`ai-settings-and-usage`) | `ai-keys-and-models`, `plans-and-ai-usage` |
| Issue automation (`automation-settings`) | `automation-settings` |
| Minddy MCP (`minddy-mcp`) | `external-minddy-mcp`, `mcp-tool-reference` |
| Self-hosted installation (`installation`) | `self-hosted-compatibility`, `install-a-server`, `managed-or-source-installation` |
| Local instances (`install-locally`) | `install-locally` |
| Instance configuration (`instance-configuration`) | `instance-configuration`, `optional-providers`, `proxy-network-and-jobs` |
| Authentication and email (`authentication-and-email`) | `authentication-and-email` |
| Storage and attachments (`storage-and-attachments`) | `storage-and-attachments` |
| Workspace encryption (`workspace-encryption`) | `workspace-encryption` |
| Backups and restoration (`backups-and-restoration`) | `back-up-the-reference-instance`, `logical-and-provider-backups`, `restore-and-roll-back` |
| Instance updates (`update-an-instance`) | `update-an-instance` |
| Instance diagnostics (`self-hosted-diagnostics`) | `self-hosted-diagnostics` |
| Instance administration (`instance-administration`) | `instance-administration` |
| Architecture and data flows (`architecture-and-data-flows`) | `architecture-and-data-flows` |
| Glossary and data model (`glossary-and-data-model`) | `glossary-and-data-model` |
| Permissions and public links (`permissions-and-public-links`) | `permissions-and-public-links` |
| Encryption and data boundaries (`encryption-and-data-boundaries`) | `encryption-and-data-boundaries` |
| API, webhooks and feedback SSO (`api-and-webhooks`) | `integration-api-and-webhooks`, `feedback-ingestion-and-sso` |
| Connection troubleshooting (`integration-troubleshooting`) | `integration-troubleshooting` |

End-user account security remains separate from operator authentication setup;
content encryption boundaries remain separate from root-key configuration;
local instances remain distinct from production installation; updates, storage,
diagnostics and instance administration remain independently findable features.
The first-project tutorial keeps its sequential beginner journey. Existing
single-feature articles receive generic localized titles and a review of their
scope and wording rather than being padded to achieve a page length.

For a combined guide, the opening establishes its scope and entry points. Each
former task becomes a level-two contents entry; its verification, reference and
recovery sections become level-three entries. Permissions, applicable profile,
destructive consequences and results stay beside their procedure. Related links
inside the guide target a section directly. Duplicate installation warnings can
link to one full explanation, with the applicable warning retained before the
command it governs.

## URLs, indexing and consumers

`content/documentation/legacy-routes.json` retains all 90 original article IDs
and all 225 original section mappings, shared across locales. Where generic
section IDs such as `recovery` collide inside a guide, later sections receive
a source-qualified ID. The old article still determines which recovery section
the reader intended. Queries and known fragments survive browser URL replacement.
The server renders the complete current published guide at a legacy URL with
canonical metadata and noindex. Without JavaScript it remains readable. Only
canonical guides appear in the catalog, search results and sitemap. Canonical
links and section IDs continue to survive locale switching.

Search destinations prioritize a matching task heading over a passing mention
in an earlier section. Selecting a result closes the palette even when the
destination is an anchor within the current guide.

Retired IDs also remain aliases for Numo/FAQ exact-topic lookup. Official source
selection still uses the same publication gate: incomplete, internal or draft
locale sets are unavailable. Review records and migration data are never loaded
as public article prose. FAQ retrieval remains bounded by its existing source
and complete-procedure budgets, with explicit summaries for oversized sources.

## Editorial review contract

The [editorial guide](../documentation-editorial-guide.md) now makes feature
boundaries explicit. The change preserves its useful-detail, evidence, natural
prose, localized terminology, complete translations, caption/alt text and
publication requirements. It does not relax a workflow because its old article
was removed. No essential facts, executable examples or release qualifications
may be replaced with a generic introduction.

The inherited procedural and illustration evidence remains dated 2026-10-08.
This migration reviews organization, wording and retained meaning; it does not
claim to rerun installation, backup, restore or product mutations, and does not
change compatibility to a newer release. Figure capture dates and image bytes
remain intact, while figure manifests identify their current guide revision.
Independent agent reviews in English/French, German/Spanish and Italian/Brazilian
Portuguese identify their actual checks separately from automated coverage and
browser execution. No human review is claimed.

## Validation

Final migration checks and browser outcomes are recorded in
`content/documentation/reviews/feature-guides-validation-2026-10-09.json`.
Required checks: six-locale release coverage; knowledge checks; owned-English
check; legacy URL/fragment tests; contents/navigation and official knowledge
regressions; lint and typecheck; anonymous HTTP/canonical/noindex inspection;
desktop and mobile contents, search and language-preserving navigation;
`git diff --check` and excluded-path review. Production deployment is outside
this task. MIN-664 remains in review with its existing PR until the owner's
remaining documentation work and PR review are resolved.
