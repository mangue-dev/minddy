# Source inventory for public documentation

Snapshot date: 2026-10-08. Baseline: `89ebb59a502884e79e3c5fc459403d26bad1f8f0`. This is a path-level screening inventory for MIN-664. Dispositions identify adaptation candidates and exclusions; they do not certify every paragraph, source link, screenshot or procedure. The [study](min-664-public-documentation-study.md) records the files examined in detail and the release boundary. Local-only entries must never become public input through a directory glob.

## Repository documentation

The 102 Markdown files below existed before this lot. Internal source paths are listed for maintainers; their content and images are not approved for publication.

| Source path | Treatment | Git visibility | Reason |
| --- | --- | --- | --- |
| `docs/ai-review-providers.md` | Adapt selected configuration | Versioned at baseline | Useful generic opt-in/provider setup mixed with implementation rationale; verify current availability. |
| `docs/analytics.md` | Adapt selected configuration | Versioned at baseline | Useful generic opt-in/provider setup mixed with implementation rationale; verify current availability. |
| `docs/architecture/numo-durable-turns.md` | Adapt concepts only | Versioned at baseline | Extract reader-relevant mechanisms; keep internal implementation and validation detail outside the public catalog. |
| `docs/architecture/numo-lifecycle-boundary.md` | Adapt concepts only | Versioned at baseline | Extract reader-relevant mechanisms; keep internal implementation and validation detail outside the public catalog. |
| `docs/architecture/numo-persistence.md` | Adapt concepts only | Versioned at baseline | Extract reader-relevant mechanisms; keep internal implementation and validation detail outside the public catalog. |
| `docs/audits/2026-10-06-postgres-errors.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/agent-completion-2026-10-02.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/astuces-2026-10-07.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-549-supabase-errors.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-620-worker-launch-failure.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-628-preview-follow-up.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-628-shell-stop-follow-up.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-633-vercel-errors.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-645-vercel-usage.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-657-smart-fill.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/min-661-vercel-errors.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/mobile-2026-10-07.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/numo-2026-10-05.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/audits/routine-failures-2026-09-09.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/auth-supabase-config.md` | Exclude | Versioned at baseline | Historical Cloud configuration record; use self-hosting-auth for operators. |
| `docs/changelog.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/container-image.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/desktop-electron.md` | Adapt current behavior only | Versioned at baseline | Mixed current and historical design; verify live behavior, provider claims and retired execution paths. |
| `docs/desktop-release.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/editions.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/error-tracking.md` | Adapt selected configuration | Versioned at baseline | Useful generic opt-in/provider setup mixed with implementation rationale; verify current availability. |
| `docs/github-issue-sync.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/harness-opencode.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/licensing.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/linux-desktop.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/localization-rollout.md` | Internal maintenance reference | Versioned at baseline | Six-locale contract informs checks; acquisition data and campaign rationale are not product guides. |
| `docs/managed-forge-relay-plan.md` | Adapt current behavior only | Versioned at baseline | Mixed current and historical design; verify live behavior, provider claims and retired execution paths. |
| `docs/mcp-registry-publication.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/open-source-launch-announcement.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/performance/min-540-pass2-board.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/performance/min-540-pass2-data-audit.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/performance/min-540-pass2-navigation.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/performance/min-540-pass2.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/performance/min-540.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-comparisons.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-copy-landing.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-copy-setup.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-design-review.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-download-review.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-final-refinements.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-landing-redesign.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-marketing-copy-audit.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-mcp-page.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-mobile-pwa.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-navigation-polish.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-navigation-review.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-platform-selection-review.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-pricing-review.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-494-self-hosting.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-561-jev-prerequisites.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/plans/min-567-jev-shadow-metrics.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/preview-database-compatibility.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/public-core-boundary.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/public-repository-audit.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/reasoning-levels.md` | Adapt current behavior only | Versioned at baseline | Mixed current and historical design; verify live behavior, provider claims and retired execution paths. |
| `docs/releases.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/rgpd/admin-console.md` | Exclude and review obligations | Versioned at baseline | Internal legal/incident procedures; select generic operator duties separately. |
| `docs/rgpd/procedure-violation.md` | Exclude and review obligations | Versioned at baseline | Internal legal/incident procedures; select generic operator duties separately. |
| `docs/rgpd/registre-des-violations.md` | Exclude and review obligations | Versioned at baseline | Internal legal/incident procedures; select generic operator duties separately. |
| [Subprocessor register](../rgpd/sous%2Dtraitants.md) | Exclude and review obligations | Versioned at baseline | Internal legal/incident procedures; select generic operator duties separately. |
| `docs/screenshots/min-601/README.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/screenshots/min-640/README.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/screenshots/ui-ux-refinements/README.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/security/data-encryption.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/README.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/agent-ephemeral-storage.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/closure-matrix.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/local-client-copies.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/pr-289-integration-2026-09-29.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/preactivation-performance.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/review-2026-09-29.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/review-2026-09-30.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security/encryption/root-key-rotation.md` | Review selected guidance | Versioned at baseline | Security evidence and operational material require deliberate public adaptation; exclude automatic ingestion. |
| `docs/security-model.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/security-release-checklist.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/self-hosting-auth.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/self-hosting-clean-room.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/self-hosting-distribution.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/self-hosting-logical-operations.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/self-hosting-operations.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/self-hosting.md` | Adapt | Versioned at baseline | Operator/product reference; revalidate against the target release and remove repository-only access to essential steps. |
| `docs/seo-surface.md` | Contributor reference only | Versioned at baseline | Repository/release/contribution policy or historical proposal; do not auto-publish as a user procedure. |
| `docs/validation/min-407-documentation-replay-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-local-candidate-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-clean-room-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-docs-v27-v28-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-docs-v29-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-docs-v29-supplement-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-lifecycle-v29-v30-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-preflight-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-v27-v28-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-407-public-v29-v30-2026-09-08.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-617-test-suite-review.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-625-626/README.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-629-concurrent-numo-budget.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-637/README.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |
| `docs/validation/min-653-remove-custom-domains.md` | Exclude | Versioned at baseline | Internal plan, audit, acceptance evidence or screenshot record; no automatic public copy. |

## Product knowledge

All 14 articles are versioned English source material, with no six-locale article variants. `content/knowledge/README.md` is a contributor reference. Review dates below are article metadata, not proof of current procedural verification.

| Article | Review date | Audience | Adaptation need |
| --- | --- | --- | --- |
| `content/knowledge/agents-and-mcp.md` | 2026-10-07 | both | Separate Numo, external Minddy MCP, personal MCP/OAuth and owner/routine connection boundaries; recheck provider prerequisites. |
| `content/knowledge/core-tracker.md` | 2026-10-07 | end-user | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/desktop-and-speed.md` | 2026-09-09 | end-user | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/feedback.md` | 2026-10-07 | both | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/integrations.md` | 2026-10-07 | developer | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/open-source.md` | 2026-08-20 | both | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/pages.md` | 2026-10-07 | end-user | Keep verified database/editor limits, then split wiki, sharing, history, schema, entries, conversion and import guides. |
| `content/knowledge/plans-and-agents.md` | 2026-10-07 | both | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/plans-and-billing.md` | 2026-09-13 | end-user | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/productivity.md` | 2026-10-07 | end-user | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/repository-skills.md` | 2026-09-13 | both | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |
| `content/knowledge/self-hosting-operations.md` | 2026-10-07 | developer | Preserve profile-specific operations, key/Storage recovery and provider responsibility; publish essential procedures in full. |
| `content/knowledge/self-hosting.md` | 2026-10-07 | both | Preserve profile-specific operations, key/Storage recovery and provider responsibility; publish essential procedures in full. |
| `content/knowledge/settings-and-data.md` | 2026-10-07 | end-user | Split summaries into task, concept and reference coverage; add permission/result/recovery details and all six translations. |

## Illustration candidates

The published top-level catalog contains 12 slots with 144 exact locale/theme variants. `public/captures/focused/` contains 72 further WebP files. All 216 public WebP files are candidates requiring visual, language, demo-data and release review. Capture source groups below include additional unapproved local artifacts. A filename locale indicates a candidate variant, not the language of every visible string.

| Source group | PNG/WebP files | Filename locale coverage | Next action |
| --- | --- | --- | --- |
| `captures/shots/agent/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/carnet/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/changelog-illustrations/` | 4 | Not declared by locale/theme filenames | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/cycle/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/feedback-board/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/feedback-inbox/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/hero-board/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/issue-create/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/issue-parent-menu/` | 2 | Not declared by locale/theme filenames | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/issue-plan/` | 4 | en, fr | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/issue-sidebar-menu/` | 1 | fr | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/keyboard-navigation/` | 2 | en, fr | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/numo/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/pages-editor/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/palette/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/pr-conversations-reviews/` | 4 | Not declared by locale/theme filenames | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/pull-request/` | 13 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/relations/` | 8 | Not declared by locale/theme filenames | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/routines/` | 12 | en, fr, de, es, it, pt-BR | Recheck exact steps/release and localize required demo content before reuse. |
| `captures/shots/ui-ux-refinements/` | 5 | Not declared by locale/theme filenames | Create required locale variants; recheck data, controls and compatibility before reuse. |
| `captures/shots/version-changelog/` | 3 | Not declared by locale/theme filenames | Create required locale variants; recheck data, controls and compatibility before reuse. |

The visual sample includes `public/captures/pagesEditor-en-light.webp` and `public/captures/numoPanel-fr-light.webp`. The latter has English conversation and issue text inside French UI chrome. Do not approve it for a French instructional conversation. Audit/validation screenshots remain excluded unless a maintainer explicitly approves a sanitized, current demo replacement.

## Integration points examined

| Area | Existing paths | Consequence |
| --- | --- | --- |
| Public routing and metadata | `lib/public-routes.ts`, `lib/locale-href.ts`, `lib/seo.ts`, `proxy.ts`, `next.config.mjs`, `app/sitemap.ts` | The finite route table and current locale switch must be extended for nested articles, alternates and stable sections. |
| Site entry points | `components/marketing/marketing-nav.tsx`, `components/marketing/marketing-footer.tsx` | Both need localized documentation links. |
| App help | `components/app-sidebar.tsx` `ChangelogButton` | Separate desktop dropdown and mobile sheet need the same localized documentation destination. |
| Languages | `i18n/config.ts`, `messages/en.json`, `messages/fr.json`, `messages/de.json`, `messages/es.json`, `messages/it.json`, `messages/pt-BR.json` | Runtime catalog is six languages; documentation text and illustrations need equivalent parity. |
| Official help consumers | `lib/server/assistant/knowledge.ts`, `lib/server/faq-answer.ts`, `app/api/faq/answer/route.ts`, `next.config.mjs` | Replace only product-source retrieval with the published catalog, preserve aliases and bounded FAQ grounding, and trace runtime content in deployment. |
| Installation and operations | `app/(marketing)/self-hosting/page.tsx`, `components/marketing/self-hosting-install-wizard.tsx`, `scripts/self-hosting-install.mjs`, `scripts/self-hosting-maintenance.mjs`, `scripts/self-hosting-doctor.mjs` | Preserve public guide/wizard and release-profile commands; maintenance wrappers do not execute the full backup/update/restore. |
| Current feature evidence | `app/(app)/`, `components/pages/`, `components/pull-requests/`, `components/settings/`, `components/assistant/`, `content/changelog/releases/0.11.0.json`, `content/changelog/drafts/0.11.1.json` | Distinguish released v0.11.0 behavior from main and confirm Cloud compatibility before authoring current steps. |
| Capture lifecycle | `captures/README.md`, `captures/shots/`, `captures/world/seed/`, `captures/lib/publish.mjs`, `components/marketing/screenshot-manifest.ts` | Reuse demo/capture infrastructure after correcting stale intentions and adding documentation figure metadata. |
| Maintenance | `scripts/knowledge-check.mjs`, `scripts/check-owned-english.mjs`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/workflows/ci.yml` | Add explicit public/locale/revision/figure/coverage checks; preserve English contributor prose and existing primary ownership. |
