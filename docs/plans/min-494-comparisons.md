# MIN-494: comparison pages

## Scope

- [x] Audit the remaining marketing routes and verify current product claims.
- [x] Rebuild the shared Linear, Jira, and Notion comparison page in all six locales.
- [x] Keep HTML, negotiated Markdown, metadata, and review dates consistent.
- [x] Verify responsive layouts, table semantics, keyboard interactions, and locale parity.

The comparison pages now use the shared marketing typography, pastel surfaces,
pill actions, uncropped product screenshots, and full-resolution previews. An
early summary gives both products a fair recommendation. Eight comparison rows
link to official documentation, followed by eight current Minddy capabilities,
more detailed recommendations, and a CSV migration invitation.

The remaining older marketing layouts are the changelog (`/changelog`) and the
standalone mobile PWA installation guide (`/download/mobile-pwa`). Legal pages
retain their separate reading layout. Desktop installation guides already
redirect to the redesigned download page. No additional product marketing page
was found; FAQ and open-source navigation target landing sections.

## Product evidence

Reviewed on September 5, 2026 against the current repository:

| Topic | Evidence |
| --- | --- |
| MCP, Numo, connected tools, cloud and local code agents | `content/knowledge/agents-and-mcp.md`, `content/knowledge/plans-and-agents.md` |
| Objectives, saved views, personal cycles, routines, notebook | `content/knowledge/core-tracker.md`, `content/knowledge/productivity.md` |
| Nested wiki, history, sharing, agent access | `content/knowledge/pages.md` |
| Public feedback, votes, linked delivery, assisted triage | `content/knowledge/feedback.md` |
| Desktop platforms, dictation, palette, CSV import | `content/knowledge/desktop-and-speed.md`, `components/import/import-wizard-dialog.tsx` |
| Plan limits, collaborator entitlements, AI usage and personal keys | `content/knowledge/plans-and-billing.md`, `lib/server/entitlements.ts`, `lib/billing-plans.ts` |

The copy qualifies the absence of an additional seat charge with plan limits,
explains project-owner versus collaborator limits, and distinguishes included
AI usage from compatible personal-key/provider costs. It does not promise
unlimited free collaboration or universal model availability.

## Competitor evidence

Official sources are registered per comparison row in `lib/comparisons.ts` and
linked from both HTML and Markdown. The shared review date is September 5, 2026.

- Linear: [pricing](https://linear.app/pricing),
  [coding sessions](https://linear.app/docs/coding-sessions),
  [agents](https://linear.app/docs/agents-in-linear),
  [Linear Agent](https://linear.app/docs/linear-agent),
  [team pages](https://linear.app/docs/default-team-pages),
  [customer requests](https://linear.app/docs/customer-requests),
  [conceptual model](https://linear.app/docs/conceptual-model), and
  [initiatives](https://linear.app/docs/initiatives).
- Jira: [user tiers](https://support.atlassian.com/subscriptions-and-billing/docs/manage-users-and-user-tiers/),
  [Rovo MCP](https://www.atlassian.com/platform/rovo-mcp),
  [Confluence content](https://support.atlassian.com/confluence-cloud/docs/create-and-edit-content/),
  [Product Discovery insights](https://support.atlassian.com/jira-product-discovery/docs/create-and-manage-insights/),
  [workflows](https://support.atlassian.com/jira-software-cloud/docs/what-are-jira-workflows/), and
  [Data Center end of life](https://www.atlassian.com/licensing/data-center-end-of-life).
- Notion: [pricing](https://www.notion.com/pricing),
  [members and guests](https://www.notion.com/help/add-members-admins-guests-and-groups),
  [project templates](https://www.notion.com/help/guides/getting-started-with-projects-and-tasks), and
  [MCP connections for custom agents](https://www.notion.com/help/mcp-connections-for-custom-agents).

The updated claims acknowledge competitor AI/MCP capabilities and free plans.
They remove the unsupported Jira setup-time estimate, describe Notion's project
templates, and qualify Jira Data Center availability for existing customers
with its March 28, 2029 end-of-life date.

## Validation

- Focused Oxlint and TypeScript checks passed.
- Owned-English and `git diff --check` passed.
- 92 tests passed across locale/message parity, public client message boundaries,
  SEO, and public route suites.
- 36 HTTP responses verified HTML and negotiated Markdown for all three
  competitors in six locales. All eight rows/features, current notes, sources,
  and resolved dates are present. HTML content is server-rendered independently
  of JavaScript. Unknown comparison slugs return 404/noindex in all six locales.
- 18 browser routes and 180 locale/competitor/viewport/theme combinations passed
  at 320, 390, 768, 1024, and 1440 px without page overflow. Verified canonical
  URLs, sibling navigation, semantic column/row headers, feature copy and sources.
- Verified keyboard horizontal scrolling with sticky row labels and full-size
  screenshot opening, Escape dismissal, and focus return.
- Reviewed desktop/mobile layouts and both image themes after lazy loading.

Changes remain on PR #133. No production deployment is included.
