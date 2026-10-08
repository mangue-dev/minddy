# Public documentation workflow coverage

This is the scope ledger for MIN-664, accepted by the issue owner on 2026-10-08
as recorded in the [study](min-664-public-documentation-study.md). A row names
an observable reader task or a specific reference need. It is not satisfied by
a topic landing page.
Article IDs are proposed stable IDs; several rows can share an article only if
each outcome remains findable and has a complete, directly linked section.

**Status of every retained row:** source inventory complete; public guide,
translations, illustration approval and reader acceptance pending. Source
existence does not establish publication or procedural verification. The
[source inventory](min-664-source-inventory.md) gives the release boundary and
source dispositions.

Every retained row also requires the
[editorial publication checklist](../documentation-editorial-guide.md): useful
verified content, proportionate detail, natural prose, and complete meaning
reviewed in each language. An article's existence or length does not satisfy a
row; its reader outcome and necessary information must pass review.

## How to read the matrix

- Audiences: **Member**, **Owner** (project owner), **Visitor** (public board or
  shared-content reader), **Operator**, and **Integrator**.
- Types: **Tutorial**, **Guide**, **Explanation**, **Reference**, and
  **Troubleshooting**.
- `K/name` means `content/knowledge/name.md`; `D/name` means `docs/name.md`.
  Component and route paths are relative to the repository root. Knowledge is
  a seed to verify and expand, not approved final text.
- Illustration **reuse** means a candidate marketing slot to recheck; **new**
  means a dedicated demo capture; **diagram** means neutral geometry with
  localized labels; **text** means an image is unnecessary unless testing finds
  ambiguity. Every existing candidate needs release/step/privacy/readability
  review. None is approved by this matrix.
- Language **6T** requires equivalent `en`, `fr`, `de`, `es`, `it`, `pt-BR`
  article text, metadata, headings, search terms, glossary, alt text and captions.
  **6I** additionally requires all six instructional image variants where
  readers need visible text. **6D** requires all six diagram label sets; one
  neutral unlabeled drawing can be shared. These requirements include new
  demo conversations, not only translated interface chrome.
- Every guide must add permissions, prerequisites, exact entry point, steps,
  observable result, limits and recovery. The missing-content column identifies
  additional row-specific gaps. Cloud/self-hosted availability must be verified
  from edition/capability configuration, not assumed from the audience.

## Get started and collaborate

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| S01 `first-project` | Complete the first project-to-done-issue workflow | Member; Tutorial | K/core-tracker; `components/sidebar-onboarding.tsx`; `app/(app)/home/page.tsx` | Ordered journey, account/instance prerequisite, join versus create, assignment, done state, first-use recovery | New onboarding; reuse workflowIssue and heroBoard | 6T + 6I |
| S02 `account-access` | Register, confirm email, sign in and sign out | Member; Guide | `app/(auth)/signup/page.tsx`; `app/(auth)/login/page.tsx`; `app/auth/confirm/page.tsx` | Confirmation gesture, email delivery conditions, instance identity, invite-only/configuration limits | New auth flow with disposable identity | 6T + 6I |
| S03 `account-recovery` | Recover account access after password or MFA problems | Member; Troubleshooting | `app/(auth)/reset-password/page.tsx`; `components/settings/account-security-section.tsx`; D/self-hosting-auth | Safe reset/recovery sequence, expired links, TOTP/recovery codes, escalation and session outcome | New security controls without secrets | 6T + 6I |
| S04 `navigation` | Reach personal/project work, switch projects and use tabs | Member; Guide | `components/app-sidebar.tsx`; `components/secondary-sidebar.tsx`; K/agents-and-mcp; K/productivity | Current rail/secondary navigation, panel behavior, desktop/mobile entry points, legacy links | New current desktop/mobile navigation | 6T + 6I |
| S05 `project-settings` | Create, rename and configure a project | Owner; Guide | K/settings-and-data; `components/settings/project-general-section.tsx` | Key/color, defaults, owner-only actions, consequences of changes | New project general settings | 6T + 6I |
| S06 `project-members` | Invite, accept/decline and manage collaborators | Owner and Member; Guide | `components/inbox-content.tsx`; `components/home/onboarding-join-dialog.tsx`; K/settings-and-data | Invite flow, owner/member permission table, removal/ownership conditions, pending invites and missing access | New invitation/member controls | 6T + 6I |
| S07 `choose-an-instance` | Choose Cloud or self-hosted and understand responsibilities | Member and Operator; Explanation | D/editions; K/open-source; `app/(marketing)/self-hosting/page.tsx` | Same core versus configured capabilities, account/host responsibility, provider costs and support boundary | Diagram of responsibility split | 6T + 6D |

## Issues objectives and planning

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| W01 `create-an-issue` | Create and edit a useful issue with properties | Member; Guide | K/core-tracker; `components/create-issue-dialog.tsx`; `components/issue-fields.tsx` | Exact property controls, priority/effort/due date/assignee/categories, validation and save result | Reuse workflowIssue; new detail/property focus | 6T + 6I |
| W02 `issue-statuses` | Move work through triage to done or another terminal state | Member; Guide and Reference | K/core-tracker; `components/kanban-board.tsx`; `components/issue-context-menu.tsx` | Status meanings, review/canceled/duplicate distinction, default rules, board versus detail actions | Reuse heroBoard; new status control | 6T + 6I |
| W03 `triage-incoming-work` | Review incoming work before planning it | Owner and Member; Guide | `app/(app)/projects/[id]/triage/page.tsx`; `components/triage/triage-page.tsx`; `lib/smart-triage.ts` | Intake sources, accept/skip/change behavior, deterministic sorting rules and retired AI-triage distinction | New triage and sorting controls | 6T + 6I |
| W04 `bulk-issue-actions` | Select and update several issues safely | Member; Guide | `components/bulk-issue-actions.tsx`; `components/global-board.tsx` | Selection modes, supported fields, multi-project permission limits, partial errors | New selected rows and bulk controls | 6T + 6I |
| W05 `issue-dependencies` | Model blocking related and duplicate issues | Member; Guide and Explanation | K/core-tracker; `components/issue-side-panel.tsx`; `components/issue-indicators.tsx`; `captures/shots/relations/intent.md` | Direction, inherited blockers, resolved states, cross-project visibility, unlinking and duplicate semantics | New relations in all locales; existing relation shots are candidates only | 6T + 6I |
| W06 `sub-issues` | Split work into children and change or remove a parent | Member; Guide | `components/issue-parent-menu.tsx`; `components/issue-family-banner.tsx` | Hierarchy limits, picker/search, inherited context, unlink confirmation and progress effects | New parent menu; current candidate lacks six variants | 6T + 6I |
| W07 `implementation-plans` | Maintain ordered plan tasks alongside the description | Member; Guide | K/plans-and-agents; `components/issue-plan.tsx`; `captures/shots/issue-plan/intent.md` | Separate tabs, task states/nesting, editing without lost progress, concurrent edits and Numo handoff | New localized plan controls; existing en/fr candidate | 6T + 6I |
| W08 `issue-discussion-and-resources` | Discuss work and attach context or files | Member; Guide | `components/issue-timeline.tsx`; `components/issue-resources-section.tsx`; K/core-tracker | Comments/mentions, live page versus file/link resources, permissions, uploads and failed actions | New comments/resource controls | 6T + 6I |
| W09 `recurring-issues` | Configure repeated issue creation | Owner; Guide | `components/settings/project-recurrences-section.tsx`; K/core-tracker | Recurrence schedule, creation/ownership rules and disable/change behavior; distinguish Numo routines | New recurrence settings | 6T + 6I |
| W10 `objectives` | Create an objective attach work and track its outcome | Member; Guide | K/core-tracker; `components/objective-dialog.tsx`; `components/objective-detail.tsx` | Objective lifecycle, issue membership, resources/discussion, progress and completion | New objective create/detail | 6T + 6I |
| W11 `objective-dependencies-and-momentum` | Interpret objective relations progress and forecasts | Member; Explanation and Reference | `components/objective-relations-section.tsx`; `components/objective-momentum.tsx`; K/core-tracker | Momentum states, evidence/estimate limits, blocker inheritance, insufficient history | New objective relations plus localized diagram | 6T + 6I + 6D |
| W12 `personal-cycle` | Select cross-project work for a weekly or fortnightly cycle | Member; Guide | K/productivity; `components/cycle/cycle-header.tsx`; `components/settings/account-cycles-section.tsx` | Settings, fill/selection, carry-over/completed work, personal ownership and objective distinction | Reuse featureCycle; new settings | 6T + 6I |
| W13 `views-and-filters` | Create and reuse a view without changing the underlying issues | Member; Guide | K/productivity; `components/board-toolbar.tsx`; `components/sidebar-filter-field.tsx`; `app/api/me/saved-views/route.ts` | Scope, filters/sort/group/display, create/edit/delete, personal/project views and empty results | New views/filter controls | 6T + 6I |
| W14 `share-a-view` | Publish and revoke a read-only view | Owner and Visitor; Guide | `app/api/views/[id]/share/route.ts`; `app/share/[token]/page.tsx`; K/feedback | Share eligibility, visible fields, secret-link/indexing boundary, password/child links and revocation | New share controls and anonymous result | 6T + 6I |
| W15 `search-and-shortcuts` | Find work and act with keyboard commands | Member; Guide and Reference | `components/command-palette.tsx`; `components/keyboard-cheatsheet.tsx`; `components/issue-field-shortcuts.tsx` | Search scope, shortcuts per platform, keyboard focus/panels, field shortcuts and mobile alternatives | Reuse featurePalette; new cheatsheet/detail controls | 6T + 6I |
| W16 `notifications-and-inbox` | Follow mentions activity and pending invitations | Member; Guide | K/productivity; `components/inbox-popover.tsx`; `components/inbox-content.tsx`; `components/settings/account-notifications-section.tsx` | Popover entry, date/read/mention filters, read-state and invitation actions, notification preferences | New Inbox and settings | 6T + 6I |
| W17 `task-notebook` | Capture private notes and promote a task to tracked work | Member; Guide | K/productivity; `components/scratchpad/scratchpad-modal.tsx`; `components/scratchpad/start-tasks.ts` | Privacy, sections/checkboxes, promotion/context, Numo action and notebook shortcut | Reuse scratchpad; new promotion | 6T + 6I |
| W18 `personal-statistics` | Read completion pace and time by project category or objective | Member; Explanation and Guide | `app/(app)/statistics/page.tsx`; `components/stats/effort-durations.tsx`; K/productivity | Measurement definitions, date range, estimates/limitations, privacy and empty data | New demo statistics | 6T + 6I |
| W19 `trash-and-recovery` | Restore deleted work or understand permanent removal | Member and Owner; Guide | `app/(app)/trash/page.tsx`; K/productivity | Supported entity types, permissions, retention, restore conflicts, irreversible deletion conditions | New trash/recovery | 6T + 6I |

## Pages databases and sharing

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| P01 `create-and-organize-pages` | Build a nested project wiki and find favorite pages | Member; Guide | K/pages; `components/pages/page-create-menu.tsx`; `components/pages/page-tree.tsx` | Hierarchy, move/reorder/duplicate/delete, favorites and project scope | Reuse pagesEditor; new tree controls | 6T + 6I |
| P02 `page-editor` | Write a page with blocks callouts and links to work | Member; Guide and Reference | `components/pages/page-editor.tsx`; `components/pages/page-slash-command.tsx`; K/pages | Slash/block controls, headings/tasks/code/callouts, mentions/backlinks, autosave and formatting/export fidelity | New editor/block menus | 6T + 6I |
| P03 `page-comments-and-collaboration` | Discuss a page and understand live viewing or conflicts | Member; Guide | `components/pages/page-comment-popover.tsx`; `components/pages/page-presence.tsx`; `components/pages/page-conflict-banner.tsx` | Comment anchors/threads, resolve/reply, mentions, viewing versus editing, save conflict recovery | New comments/presence/conflict | 6T + 6I |
| P04 `page-files` | Upload and retrieve page attachments | Member; Guide | `components/pages/page-uploads.tsx`; `lib/server/page-files.ts`; K/pages | Accepted files/size/plan constraints, upload failures, authorization and sharing behavior | New attachment controls | 6T + 6I |
| P05 `page-history` | Inspect history and restore a previous page revision | Member; Guide | `components/pages/page-history.tsx`; `lib/server/page-versions.ts` | Restore permissions, current-state replacement, retention, version/file relationship and failure recovery | New version picker and restore | 6T + 6I |
| P06 `publish-a-page` | Share a page read-only and revoke access | Member and Visitor; Tutorial | `components/pages/page-publish-dialog.tsx`; `lib/server/page-publication.ts`; `app/p/[token]/page.tsx` | Password/links, subtree and attachment access, anonymous test, revocation, noindex distinction | New publish dialog plus anonymous result | 6T + 6I |
| P07 `import-export-and-print-pages` | Move page content or produce a readable export | Member; Guide | `components/pages/page-document-actions.tsx`; `lib/server/pages-export.ts`; `components/pages/page-print-view.tsx` | Import/export formats, files/links/callouts fidelity, printing, hierarchy and unsupported content | New export/import controls | 6T + 6I |
| P08 `create-a-database` | Create a database and define its columns | Member; Tutorial | K/pages; `components/pages/database-setup-banner.tsx`; `components/pages/database-property-dialogs.tsx` | Blank schema, Numo-assisted setup conditions, property types/options/limits and read-only Created at | New setup/type chooser | 6T + 6I |
| P09 `database-cells-and-entries` | Edit values and work with an entry as a full page | Member; Guide | `components/pages/page-database-view.tsx`; `components/pages/database-cell-editor.tsx`; K/pages | Numeric/text validation, single/multiple options, people/date/checkbox, panel extension and pending saves | New cells and entry panel | 6T + 6I |
| P10 `change-a-database-schema` | Rename reorder hide convert or delete columns | Member; Guide and Reference | `components/pages/database-property-dialogs.tsx`; `components/pages/database-column-name.tsx`; K/pages | Compatible conversions, data-loss confirmation, system columns, option edit/cancel and irreversible deletion | New conversion warnings and column controls | 6T + 6I |
| P11 `import-a-database` | Import external database rows with a reviewed mapping | Member; Guide | `components/pages/database-import-dialog.tsx`; `lib/server/database-import.ts`; K/pages | Supported formats/archives, matching/property mapping, preview/validation, rejected rows and limits | New localized import preview | 6T + 6I |

## Public feedback

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| F01 `publish-a-feedback-board` | Enable and configure a public feedback board | Owner; Guide | K/feedback; `components/project-feedback-settings.tsx` | Publication/display/privacy, enabled state versus ingestion, identities, comments and optional AI | New settings; reuse feedbackBoard | 6T + 6I |
| F02 `submit-and-follow-feedback` | Submit vote comment and follow a request | Visitor; Guide | `components/public-board.tsx`; `app/f/[token]/me/page.tsx`; K/feedback | Anonymous/identified permissions, email-code or SSO journey, My feedback and response visibility | Reuse feedbackBoard; new visitor identification | 6T + 6I |
| F03 `moderate-feedback` | Review incoming requests privately and respond publicly | Owner and Member; Guide | `app/(app)/projects/[id]/feedback/page.tsx`; K/feedback | Review queue, status/category/spam/privacy, team-only comments versus public replies and permissions | Reuse feedbackInbox; new moderation details | 6T + 6I |
| F04 `feedback-to-issue` | Merge duplicates and link requests to delivered work | Owner and Member; Guide | K/feedback; `app/(app)/projects/[id]/feedback/page.tsx` | Merge effects, promotion/link/unlink, issue-driven public statuses and notification behavior | New promotion/merge and linked result | 6T + 6I |
| F05 `feedback-pages-and-views` | Add published pages or shared views to a public board | Owner and Visitor; Guide | K/feedback; `components/project-feedback-settings.tsx` | Selection, publication prerequisites, visibility/revocation and visitor navigation | New board tabs | 6T + 6I |
| F06 `feedback-ingestion-and-sso` | Connect a product to feedback collection and identity | Integrator; Guide and Reference | K/integrations; `app/llms-full.txt/route.ts`; K/feedback | Key handling, request example, limits/errors, SSO signing/expiry and visitor state, optional webhook behavior | Localized sequence diagram and sanitized code | 6T + 6D |

## Numo agents routines and Git

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| N01 `work-with-numo` | Open a contextual conversation and complete a project task | Member; Tutorial | K/agents-and-mcp; `components/assistant-panel.tsx`; `components/assistant/chat-input.tsx` | Current panel/context, model/reasoning, conversation list, task result and source links; one localized demo request | Reuse numoPanel only after full demo-content localization | 6T + 6I |
| N02 `numo-permissions-and-approvals` | Understand actions credentials approvals and context boundaries | Member and Owner; Explanation | K/settings-and-data; K/agents-and-mcp; `lib/server/assistant/tools.ts` | Owner-only settings, credential setup, public reply authorization, remote-MCP trust and cross-user context | Localized permission/action diagram | 6T + 6D |
| N03 `delegate-code-work` | Turn an issue into checked repository work and an attached PR | Member; Guide | K/plans-and-agents; `components/assistant/delegated-work-card.tsx`; K/agents-and-mcp | Linked repo/configured sandbox, worker model, progress/checks/files, user input and limits; no desktop-local worker promise | Reuse workflowAgent/workflowPr; new localized run details | 6T + 6I |
| N04 `review-pull-requests` | Inspect changes discussions checks reviews and linked work | Member; Guide | `components/pull-requests/pr-detail.tsx`; `components/pull-requests/pr-reviews-details.tsx`; K/plans-and-agents | Tabs, file/hunk navigation, comments/unresolved threads, review requests/AI review, readiness and merge permissions | New current PR controls; reuse workflowPr as overview only | 6T + 6I |
| N05 `recover-numo-work` | Handle interrupted failed waiting or usage-limited work | Member; Troubleshooting | `components/assistant/usage-exhausted-card.tsx`; `components/assistant/ask-user-card.tsx`; D/architecture/numo-durable-turns | Observable states, stop/resume/retry conditions, checkpoints versus guaranteed recovery, existing external-write outcome | New safe failure/input/usage states | 6T + 6I |
| N06 `scheduled-routines` | Schedule edit pause and inspect recurring Numo requests | Owner; Guide | K/productivity; `components/routines/routine-detail.tsx`; `components/routines/create-routine-wizard.tsx` | Timezone/schedule, occurrence conversations, per-run cap, owner budget/connections, changed ownership and manual runs | Reuse routines; new schedule/cap controls | 6T + 6I |
| N07 `repository-skills` | Select versioned repository skills for a turn or routine | Member and Integrator; Guide | K/repository-skills; `components/assistant/skill-preview-dialog.tsx` | Discovery roots/ref, selection limits, slash/dollar menus, preview, commit/push prerequisite and safety boundary | New localized skill selection | 6T + 6I |
| N08 `numo-mcp-connections` | Connect test reconnect disable or remove a personal MCP service | Member; Guide and Troubleshooting | K/agents-and-mcp; `components/settings/account-mcp-section.tsx`; `app/api/account/mcp-connections/route.ts` | OAuth/bearer/no-auth flows, provider prerequisites, secret persistence/removal, transport/network limits and routine-owner access | New connection/status/reconnect controls without secrets | 6T + 6I |
| N09 `external-minddy-mcp` | Connect an external assistant to authorized Minddy work | Integrator and Member; Guide | `app/(marketing)/mcp/page.tsx`; `components/settings/account-mcp-clients.tsx`; `app/api/mcp/route.ts` | Supported clients/endpoint/OAuth, authorized scope, token revocation, self-host origin and difference from Numo connections | New endpoint/auth controls plus sanitized client example | 6T + 6I |
| N10 `git-accounts-and-repositories` | Connect GitHub or GitLab and link a project repository | Owner and Member; Guide | K/integrations; `components/settings/account-git-connections-section.tsx`; `components/settings/project-git-section.tsx` | Account/project boundary, provider scopes, OAuth/browser return, repo picker, relay/operator-owned app and reconnect | New connection/repository picker | 6T + 6I |
| N11 `forge-issue-sync` | Enable issue synchronization and resolve conflicts | Owner and Integrator; Guide and Reference | D/github-issue-sync; K/integrations; `components/settings/project-git-section.tsx` | Import/triage, mapped fields, open/closed mirroring, webhook retries/conflicts, disablement and provider boundary | Localized sync diagram; new settings | 6T + 6I + 6D |

## Account settings data and apps

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| A01 `profile-and-preferences` | Configure avatar language theme and send preferences | Member; Guide | K/settings-and-data; `components/settings/account-profile-section.tsx`; `components/settings/account-preferences-section.tsx` | Menu entry, save/validation, avatar limits, account versus public-site locale, platform send shortcut | New profile/preferences | 6T + 6I |
| A02 `account-security` | Enroll verify and manage two-factor authentication | Member; Guide | `components/settings/account-security-section.tsx`; D/self-hosting-auth | TOTP steps/recovery storage, disable requirements, sessions and account recovery link | New redacted security flow | 6T + 6I |
| A03 `devices-and-notifications` | Enable and troubleshoot web or native notifications | Member; Guide and Troubleshooting | `components/settings/account-push-devices-section.tsx`; `lib/desktop/notification-capabilities.ts`; K/desktop-and-speed | Permission/device registration, platform delivery/requirements, unavailable push and in-app fallback | New browser/PWA/desktop controls | 6T + 6I |
| A04 `ai-keys-and-models` | Configure compatible personal AI providers and model defaults | Member; Guide | K/plans-and-billing; `components/settings/account-ai-keys-section.tsx`; `components/settings/account-sandbox-section.tsx` | Surface/model assignments, provider billing, server compute, conversation versus worker defaults, secure edit/remove | New redacted provider/default controls | 6T + 6I |
| A05 `automation-settings` | Configure account and owned-project automatic work | Owner; Guide | `components/settings/account-automations-section.tsx`; `components/settings/smart-assign-section.tsx`; K/settings-and-data | Presets/delay/effort switches, Smart Fill/Assign/Triage differences, member rules, provider and usage prerequisites | New automation settings | 6T + 6I |
| A06 `import-issues` | Import Linear Jira or generic CSV after reviewing field mapping | Owner; Guide | K/desktop-and-speed; `components/settings/csv-import-panel.tsx`; `components/settings/import-mapping-editor.tsx` | Preview/mapping, statuses/people/relationships, duplicates, rejected rows, AI-assisted mapping conditions and limits | New all-locale import preview | 6T + 6I |
| A07 `transfer-between-instances` | Export account data and restore it on another instance | Member; Guide | K/settings-and-data; `components/settings/account-data-section.tsx`; `lib/server/account-import.ts` | Additive transfer, ID conflicts/report, memberships, exclusions/credentials/billing, file handling and privacy | New export/import/result controls | 6T + 6I |
| A08 `plans-and-ai-usage` | Choose a Cloud plan and understand budget consumption | Member; Explanation and Guide | K/plans-and-billing; `app/(app)/billing/page.tsx`; `app/(marketing)/pricing/page.tsx` | Current capacities, checkout/portal actions, included calls/compute, caps/no overage, BYOK and self-host costs | New billing/usage with demo amounts | 6T + 6I |
| A09 `privacy-and-account-deletion` | Manage analytics consent and understand data/deletion choices | Member; Guide | `components/settings/account-analytics-section.tsx`; `components/settings/account-data-section.tsx`; `app/api/account/deletion-preview/route.ts` | Consent effects, data destinations, deletion preview/consequences, export-before-delete and operator policies | New consent/deletion preview without executing deletion | 6T + 6I |
| A10 `web-and-mobile` | Use browser and mobile layouts to finish core tasks | Member; Guide | `components/mobile-sidebar-reveal.tsx`; `components/issue-side-panel.tsx`; `components/assistant-panel.tsx` | Touch navigation/panels, keyboard alternatives, viewport-dependent controls, connectivity limitations | New current mobile issue/page/Numo entry points | 6T + 6I |
| A11 `install-the-pwa` | Install and use the PWA on supported mobile browsers | Member; Guide and Troubleshooting | `components/marketing/mobile-pwa-install-guide.tsx`; `components/marketing/mobile-install-guide-copy.ts`; `public/sw.js` | Browser/platform requirements, iOS/Android steps, offline/cache promise, updates and push prerequisites | New localized OS/browser install steps | 6T + 6I |
| A12 `desktop-app` | Install desktop choose an instance use tabs and update it | Member and Operator; Guide | K/desktop-and-speed; `app/(marketing)/download/page.tsx`; `components/settings/account-desktop-section.tsx`; D/linux-desktop | Cloud/server/local picker, OAuth return, app/OS shortcuts, tabs/window close versus quit, OS-specific update paths | New current localized native controls | 6T + 6I |

## Self-hosted installation and operations

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| H01 `self-hosted-compatibility` | Select a supported topology release and host | Operator; Reference | D/self-hosting-distribution; D/editions; `deploy/self-hosted/compatibility.json`; D/container-image | Exact release/architecture/Docker/Supabase matrix, artifact verification and unsupported variants | Localized topology diagram and version table | 6T + 6D |
| H02 `install-locally` | Install a private local instance and connect desktop | Operator; Tutorial | D/self-hosting; K/self-hosting; `components/marketing/self-hosting-install-wizard.tsx`; `scripts/self-hosting-local.mjs` | Runtime versus development stack, prerequisites/ports/encryption, verification/retry and persisted data | New wizard/native setup, sanitized command output | 6T + 6I |
| H03 `install-a-server` | Install the full reference profile for a shared instance | Operator; Tutorial | D/self-hosting; `scripts/self-hosting-install.mjs`; `deploy/self-hosted/compose.full.yml` | Release pin/origins/TLS/secrets, upstream exact pin, bootstrap/auth/Storage checks and interruption recovery | Localized deployment diagram; wizard capture | 6T + 6I + 6D |
| H04 `managed-or-source-installation` | Use managed Supabase or the supported source path | Operator; Guide | D/self-hosting; D/self-hosting-distribution; `deploy/self-hosted/compose.managed.yml` | Distinguish managed OCI and source topology, provider API verification, scheduler/storage responsibility and acceptance | Localized deployment diagram plus sanitized commands | 6T + 6D |
| H05 `instance-configuration` | Configure public origins environment secrets and capabilities | Operator; Reference | `.env.example`; D/self-hosting; `lib/capabilities.ts`; D/editions | Required/optional values, public/server separation, restart/build behavior, secret preservation, fail-closed diagnostics | Text tables and sanitized examples | 6T |
| H06 `authentication-and-email` | Configure and verify signup recovery MFA and SMTP | Operator; Guide | D/self-hosting-auth; `supabase/email-templates/`; `lib/self-hosting-email-templates.ts` | Managed/full configuration, exact redirects, template language, provider limitations, real delivery/account checks | New redacted settings or localized auth sequence | 6T + 6I |
| H07 `storage-and-attachments` | Operate durable Storage and diagnose file access | Operator; Guide and Reference | D/self-hosting; D/self-hosting-operations; D/self-hosting-logical-operations; `lib/server/page-files.ts` | Backend/metadata/byte boundary, persistence/capacity, provider setup, signed/file authorization and recovery checks | Localized data-flow diagram | 6T + 6D |
| H08 `proxy-network-and-jobs` | Expose the right origins and operate scheduled jobs | Operator; Guide | D/self-hosting-distribution; `vercel.json`; `deploy/self-hosted/compose.full.yml`; D/self-hosting | Public TLS versus private/local HTTP, internal ports, authenticated job schedule, maintenance shutdown and failures | Localized network/jobs diagram | 6T + 6D |
| H09 `optional-providers` | Enable chosen AI Git MCP push or analytics capabilities | Operator; Guide and Reference | D/editions; K/self-hosting; `lib/capabilities.ts`; `.env.example` | Provider-specific setup/restrictions/costs/data paths, local AI endpoints, code runner, relay opt-out and disabled behavior | Localized optional-provider diagram and sanitized config | 6T + 6D |
| H10 `workspace-encryption` | Configure content encryption and preserve recovery keys | Operator; Guide and Explanation | K/self-hosting; D/self-hosting; `lib/server/encryption.ts`; `scripts/self-hosting-encryption.mjs` | At-rest scope, metadata/export/provider boundaries, enabled/disabled/rerun behavior, old data progress and matching keys | Localized encryption/backup diagram | 6T + 6D |
| H11 `back-up-the-reference-instance` | Create and verify a complete consistent full-profile backup | Operator; Guide | D/self-hosting-operations | Outage/context, exact filesystem/image/architecture assumptions, DB/bytes/secrets/keys/identity, off-host retention and restore rehearsal | Text commands and checklist; no real environment output | 6T |
| H12 `logical-and-provider-backups` | Back up a source or managed database and object storage | Operator; Guide | D/self-hosting-logical-operations; K/self-hosting-operations | Preflight versus actual action, provider-specific bytes/metadata consistency, complete manifest and encrypted key/config storage | Text commands and provider conditions | 6T |
| H13 `update-an-instance` | Upgrade one supported release while preserving recovery | Operator; Guide | D/self-hosting-operations; D/self-hosting-logical-operations; D/self-hosting-distribution | Next-release compatibility, forward-only migrations, outage/backup/abort gates, profile-specific commands and reopen checks | Localized update sequence; sanitized examples | 6T + 6D |
| H14 `restore-and-roll-back` | Restore a complete matching set to a blank target | Operator; Tutorial and Troubleshooting | D/self-hosting-operations; D/self-hosting-logical-operations; K/self-hosting-operations | Physical versus logical target, matching versions/keys, jobs/provider isolation, data/files/Auth verification and rollback without down migrations | Localized restore sequence and sample checklist | 6T + 6D |
| H15 `self-hosted-diagnostics` | Diagnose incomplete installation and operational failures | Operator; Troubleshooting | `scripts/self-hosting-doctor.mjs`; D/self-hosting; D/self-hosting-clean-room | Symptom-to-check mapping, missing capability versus core failure, sanitized logs, restart/retry, support escalation | Sanitized diagnostic example with translated explanation | 6T |
| H16 `instance-administration` | Manage authorized instance-wide settings and responsibilities | Operator; Guide and Reference | `app/(app)/admin/page.tsx`; `components/admin/admin-dashboard.tsx`; D/self-hosting-auth | ADMIN_EMAILS/MFA boundary, available panels, quotas/models/defaults, commercial opt-ins and operator data duties; exclude Cloud internal support processes | New demo administrator panels without other-user private data | 6T + 6I |

## Technical explanations and integration reference

| ID and proposed article | Reader outcome | Audience and type | Existing sources | Missing content to verify and write | Illustration | Languages |
| --- | --- | --- | --- | --- | --- | --- |
| T01 `glossary-and-data-model` | Distinguish project issue objective cycle page database and feedback | Member and Integrator; Explanation and Reference | K/core-tracker; K/productivity; K/pages; K/feedback | Consistent translated terminology, relationships/ownership, examples and links to task guides | Localized entity diagram | 6T + 6D |
| T02 `permissions-and-public-links` | Predict who can read change or share an object | Owner and Integrator; Explanation and Reference | `lib/server/pages.ts`; `lib/server/page-publication.ts`; `lib/server/mcp/auth.ts`; `proxy.ts`; K/settings-and-data | Role/action matrix, server checks, project boundaries, token/password/revocation/indexing and attachment inheritance | Localized access diagram and table | 6T + 6D |
| T03 `architecture-and-data-flows` | Understand application Supabase Storage jobs and optional providers | Operator and Integrator; Explanation | D/editions; D/self-hosting-distribution; `lib/server/capabilities.ts` | Useful request/realtime/job paths, durable state, trust/data destinations and edition/configuration differences | Localized architecture diagram | 6T + 6D |
| T04 `encryption-and-data-boundaries` | Understand protected content and remaining exposure | Member and Operator; Explanation | K/self-hosting; `lib/server/encryption.ts`; D/editions | At-rest versus end-to-end, keys/runtime/metadata, exports/backups and external-model boundaries without publishing audits | Localized encryption boundary diagram | 6T + 6D |
| T05 `numo-execution-model` | Understand conversation turns tools routines and workers | Integrator and Operator; Explanation | K/agents-and-mcp; D/architecture/numo-persistence; D/architecture/numo-durable-turns | Durable state versus UI projection, owner context, sandbox data access, checkpoints/limits and source freshness | Localized execution/state diagram | 6T + 6D |
| T06 `mcp-tool-reference` | Use Minddy MCP discovery issue plans pages and routines | Integrator; Reference | `lib/server/mcp/catalog.ts`; `lib/server/mcp/tools.ts`; `lib/server/mcp/page-tools.ts`; `app/llms-full.txt/route.ts` | Supported tools/parameters/scopes/errors, read-before-write, task states, concurrency and sanitized examples tied to released catalog | Text reference; optional localized sequence | 6T |
| T07 `integration-api-and-webhooks` | Send issues or feedback and receive signed event updates | Integrator; Tutorial and Reference | K/integrations; `lib/server/integrations.ts`; `lib/server/integration-auth.ts`; `app/llms-full.txt/route.ts` | Issuance/revocation/scope, HTTP examples, event verification/retries/deduplication/limits and permission errors | Localized sequence diagram plus sanitized code | 6T + 6D |
| T08 `integration-troubleshooting` | Recover failed OAuth MCP webhook or Git synchronization | Integrator; Troubleshooting | K/agents-and-mcp; D/github-issue-sync; `lib/server/integration-auth.ts`; `lib/mcp-authorization.ts` | Missing/expired scopes, provider prerequisites, diagnostics, outcome-before-retry, callback and unsupported-network errors | New redacted reconnect/error controls | 6T + 6I |

## Explicit exclusions and boundaries

| Source or request | Decision and reason | Public replacement or retained obligation |
| --- | --- | --- |
| `docs/audits/`, `docs/validation/`, `docs/performance/`, internal planning and related screenshots | Exclude from public discovery and automatic adaptation; these contain evidence, internal intentions or environment-specific details, not reader procedures. | Write verified generic procedures and new sanitized demo images; source review can use evidence privately. |
| `docs/auth-supabase-config.md`, Cloud administration/incident records and machine configuration | Exclude; production-specific configuration is not another operator's setup contract. | H06 uses `docs/self-hosting-auth.md`; H16 covers protected generic instance administration. |
| Security audit/proof/rollout documents | Exclude automatic publication. Public security explanations must be selected and reviewed separately. | H10/T04 retain complete useful key/configuration/restore guidance without audit copies. |
| Historical desktop-local code-worker designs | Exclude as current user instructions; current Numo delegates in the configured server sandbox. | A12 and N03 explain current platform/runtime boundaries. |
| Developer release signing/store publishing and internal support workflows | Exclude from ordinary public product navigation; retain repository contributor references when appropriate. | Operators still receive release verification, supported artifact and update instructions in H01/H13/A12. |
| PostgreSQL-only instances, unpinned derivative Supabase, community charts and self-managed forge adapters | Document as unsupported compatibility cases, not promised installation routes. | H01 gives exact supported release/profile requirements. |
| Cloud-operated account/platform integrations on self-hosted | Do not promise automatic Cloud-service availability. This does not exclude public core features. | S07/H09 explain optional configuration, provider accounts, costs and operator responsibilities. |
| New anonymous AI question field or a new retrieval architecture | Optional and outside the mandatory first publication. | Text search remains required. Numo's official-corpus reuse is retained in the plan following the issue owner's added context. |

## Coverage verification before closing the issue

Each retained ID must map to a published article and directly addressable section
in all six locales, with current source revision, applicable edition/version,
review owner, required figures and related troubleshooting. Missing or combined
rows need an explicit decision and a replacement outcome, not a silently removed
checkbox. Add these mappings to the future catalog/checker once this scope is
reviewed.

Record reader-session evidence for first use, issue management, page sharing,
Numo, installation and operations. At least one representative member, owner and
operator must test the relevant journeys; technical references also need an
integrator review. Confirm anonymous indexing, textual search, keyboard access,
mobile reading, themes and language-preserving article links independently of
article completeness. No acceptance row is marked complete in this preliminary
lot.
