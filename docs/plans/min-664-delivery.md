# MIN-664 delivery and acceptance evidence

This ledger records implementation and observed outcomes for the accepted
[study](min-664-public-documentation-study.md), [90-workflow matrix](min-664-coverage.md)
and [source inventory](min-664-source-inventory.md). It does not reopen scope.
The source baseline is candidate `0.11.1` at `cd1843e12`, with the subsequent
DCO-signed fixes on `codex/min-664-public-documentation`. Procedures identify
published `v0.11.0`, the exact OCI/upstream pins and any adaptations separately.
No production deployment or new public release is part of this ticket.

The owner authorized independent agent reviews because human reviewers were
unavailable, and offered a later personal French reread. Reviewers and reader
executors are identified as agents in the evidence. Neither automated checks
nor agent execution is described as human acceptance.

## Implementation

The repository contains 90 stable articles in each of six locale directories,
for 540 complete variants. The catalog controls identity, stable sections,
public visibility, compatibility, maintenance ownership, actual review dates,
translation source revisions, related articles and required illustrations.
The publication gate rejects incomplete or stale six-language sets.

The existing Next.js application serves the center anonymously. Themes,
audience entrances, localized text search, section navigation, related articles
and error reporting use the existing design system. Article and section identity
survive language changes. Marketing navigation/footer and desktop/mobile app
help link to localized centers. Canonical, hreflang and sitemap use the same
catalog; private and secret user links retain noindex.

The installer overview and wizard retain their URLs. Published-tag instructions
are distinguished from candidate tooling. The full wizard generates configuration
with `--skip-start` and links to the adapted startup procedure. It does not claim
that advancing through the assistant installs or encrypts an instance.

Numo and FAQ use published official sources through the shared catalog. Legacy
product topics are displaced by their canonical replacements, while internal
assistant instructions remain separate. Bounded retrieval, existing FAQ
configuration and cost protections are preserved. No anonymous AI Q&A field
was added.

## Representative reader routes

The following routes are prepared for review in every locale. `/fr/documentation`
is the French entry point. Each ID is an article URL segment; sections are
linked directly from its contents.

| Audience and journey | Articles to read in order | Observed acceptance record |
| --- | --- | --- |
| New member, including mobile | `choose-an-instance`, `account-access`, `first-project`, `create-an-issue` | `member-owner-first-use-execution-2026-10-08.json`, `member-owner-documentation-reader-execution-2026-10-08.json`; real SMTP confirmation/recovery, project/issue creation and persisted completion. |
| Member and owner managing issues | `project-members`, `issue-statuses`, `issue-dependencies`, `sub-issues`, `implementation-plans`, `objectives`, `personal-cycle` | Member/owner reader records; real plan transitions, dependency/sub-issue/objective/cycle writes and member permission refusal. All article IDs are checked against `coverage.json`. |
| Page author and anonymous visitor | `create-and-organize-pages`, `page-files`, `publish-a-page` | `scratch-page-database-runtime-2026-10-08.json`; real database/file/history/Markdown operations, anonymous shared page and revocation. |
| Numo user and code reviewer | `work-with-numo`, `delegate-code-work`, `review-pull-requests`, `recover-numo-work` | `numo-code-reader-execution-2026-10-08.json`; real isolated code work, failed push boundary, actual PR, review finding and correction, independent tests, no merge. Published help retrieval is checked separately. |
| Self-hosted operator | `self-hosted-compatibility`, `install-a-server`, `authentication-and-email`, `back-up-the-reference-instance`, `update-an-instance`, `restore-and-roll-back` | `operator-adapted-clean-install.json`, `operator-upgrade-execution.json`, `operator-adapted-tooling-restoration.json` and `operator-recovery-execution.md`. Distinct fresh installation, adjacent upgrade, blank-target rollback and helper recovery, with adapted release/profile, failures and limits explicit. |
| Integrator | `external-minddy-mcp`, `integration-api-and-webhooks`, `permissions-and-public-links` | `integrator-reader-execution-2026-10-08.json`; live OAuth/PKCE, 59 tool schemas, actual project/issue/page reads, project access refusal and revoked-token 401. |

Evidence files live under `content/documentation/reviews/`; that directory is
not a public article source. Screenshots use demonstration accounts/content.
Private keys, session state, raw provider responses and operational environments
stay outside Git. Localized renderings of one verified code session are not
six independent worker executions.

## Verification

`check:documentation:release` passes for 540 published locale variants and
90/90 workflows. The corpus has 612 reviewed figure placements, including all
582 required placements. Factual and full-language reviews precede publication;
targeted follow-up records preserve earlier whole-article reviews. They do not
use article length or AI-detection scores as evidence.

The final local production build compiled successfully, passed TypeScript and
generated 163 static routes; documentation articles themselves are dynamically
rendered. Anonymous HTTP checks verified all 540 articles, their stable sections,
canonical URLs, seven alternates and indexable robots metadata. The sitemap
contains every article and no user private/secret path. Unknown and internal
article URLs return 404. A real demonstration page remained noindex/nofollow
when shared and returned 404 after revocation on the production server.

Real-browser checks passed for six locales, light/dark and desktop/mobile,
with 24 cases and 48 screenshots. They cover marketing entry points, text search
without AI requests, article/section-preserving language changes, focus-visible
keyboard navigation, loaded illustrations, no horizontal overflow and localized
error-report mail bodies. Separate app-help checks cover 12 desktop/mobile
localized entrances. Additional audience, contents, related-article and topic
navigation checks use the real anonymous interface.

Actual French Numo help retrieved `implementation-plans` revision 2 from the
published catalog, preserved canceled/Questions exclusions and rendered its
official source as a clickable Markdown link. The first harness could not read
an SSE body after navigation; persisted messages established the actual result,
and a repeated browser request verified the source-link fix. The disposable
provider credential was removed from the demonstration account and revoked at
the provider: deletion returned 200 and lookup then 404. Observed usage was
USD 0.2363476, below the authorized USD 0.25 cap.

Command evidence includes owned English, knowledge, six negative documentation
check cases, 48 documentation/public-route/knowledge/FAQ tests, 69 public-message/
documentation/official-knowledge tests, 26 prompt/official-knowledge/FAQ tests,
124 agent authority tests, and 49 self-hosted tooling tests with one explicitly
skipped database integration. These suites overlap and are not added into an
inflated aggregate. Lint, typecheck, build, public-repository scanning, secret
scanning and whitespace checks support the delivery. Tests were repeated only
after changes or to resolve uncovered acceptance paths.

## Operational boundary and handoff

The executed full profile used published v0.11.0 source and OCI with explicit
tooling pinned to `89ab340cb`, on Linux aarch64 Docker Desktop with loopback
ingress and filesystem Storage in a named volume. Separate actual tests prove
fresh startup, encrypted cold-backup roundtrip, v0.10.30 to v0.11.0 upgrade,
blank-target pre-update rollback, and restoration of the pinned helper/compiler
branch to new paths. Accounts/password/TOTP, issue identity/content, SQL markers
and Storage bytes were checked. Original QA data was reopened at 242 migrations.
The initial maintenance failure and unchanged-release clean-room contract block
remain recorded. A root key alone is never treated as proof of content encryption.

No native-host lifecycle, provider-managed restoration, public DNS/TLS, external
email delivery or independent off-host recovery is inferred from these tests.
Local Mailpit confirmation/recovery has its own member evidence. The actual
deployed Cloud version was unavailable; the documentation identifies its
candidate/release boundaries rather than claiming a Cloud production test.

The French review entrance is `/fr/documentation`. The owner can follow the
reader table above without accessing internal evidence or private fixtures.
Maintenance ownership, contribution, coordinated translation/figure revisions
and feature/release checks are defined in `content/documentation/README.md` and
the editorial guide. Delivery updates PR #397 through `npm run work:pr`, with
DCO-signed Conventional Commits and screenshot comments; its existing title
and description are preserved. The demonstration code PR remains unmerged.
No production deployment is included.

A pre-existing private VAPID value appeared in diagnostic tool output during
the rehearsal. It was not committed or reproduced in the documentation or
screenshots. Production credential rotation was not performed in this task.

## Configured publication scan follow-up

The first GitHub validation run (`37840938098`) stopped before lint/build on
26 publication-marker findings: the documented LAN example, a non-routable
capture email and the synthetic scheduler sentinel. Both unit-test shards and
CodeQL passed. Four exact value-and-path exceptions preserve these intentional
examples without excluding the corpus or its evidence directory. An executable
scanner regression rejects 15 changed-value, undocumented-path and unrelated-file
counterexamples; all three policy tests passed without skips locally.

The corrected checked-in policy scanned 13 new commits and the clean publication
clone's 1,541 commits (70.11 MB) without findings before the follow-up commit.
The canonical checkout's extra historical private refs are not claimed clean;
no exceptions were added for their ten unrelated historical findings. The
earlier default-rule directory scan did not exercise the custom publication
markers. The complete configured history scan is the publication evidence.
The GitHub follow-up result is pending the policy commit and push.
