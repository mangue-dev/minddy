# AI review cards

The PR status area shows the latest observed lifecycle of each supported AI reviewer. These cards describe provider activity; repository checks and approval rules still determine merge readiness. Requests, reaction timestamps, review summaries and inline findings remain visible in the original activity feed.

## Supported providers

| Provider | GitHub bot identities | Request another review | Signals |
| --- | --- | --- | --- |
| Codex | `chatgpt-codex-connector[bot]` | `@codex review` | Eyes means running; thumbs-up means no findings. The summary table supplies activity dates, including separate code and security review rows. Submitted reviews and root inline comments supply findings. |
| CodeRabbit | `coderabbitai[bot]` | `@coderabbitai full review` | Walkthrough HTML markers report in-progress or skipped reviews. Submitted reviews carry actionable-comment counts and verdicts. A walkthrough alone does not establish completion. |
| Greptile | `greptile-apps[bot]`, `greptile[bot]` | `@greptileai` | Eyes means running, thumbs-up means completed, and confused means failed. A confidence score is a completed summary, not proof of a clean review. Root inline comments supply findings. |

Sources checked on October 2, 2026:

- [Codex GitHub reviews](https://learn.chatgpt.com/docs/third-party/github). The `codex-pull-request-review-summary` table format was also inspected through the GitHub API on [Minddy PR #334](https://github.com/mangue-dev/minddy/pull/334). This is an observed wire format, not a promised public API.
- [CodeRabbit commands](https://docs.coderabbit.ai/guides/commands) and [walkthroughs](https://docs.coderabbit.ai/pr-reviews/walkthroughs).
- [Greptile review anatomy](https://www.greptile.com/docs/code-review/first-pr-review) and [developer commands](https://www.greptile.com/docs/code-review/developer-essentials).

## Adding or correcting an adapter

1. Add or edit one file in `lib/pr-ai-review/providers/`. Implement the `AiReviewProvider` contract from `lib/pr-ai-review/types.ts`: stable id, display name, bundled logo path, exact GitHub bot logins, request command, request matcher, message parser and reaction-state mapping. Use `parseActivity` when a provider embeds its own activity dates in a summary comment.
2. Register a new adapter in `providers/index.ts`. Transport enrichment, lifecycle reduction, translations and card actions consume this registry; they need no provider-specific branches.
3. Add representative wire-format fixtures to `lib/pr-ai-review.test.ts`, including unrelated replies, quoted command examples, and incomplete output. Link the provider's documentation above. Return `null` for unrecognized comments and `completed` for a review whose result is unknown; reserve `clean` for an explicit clean signal.
4. Run `npm test -- lib/pr-ai-review.test.ts lib/server/agent/pr-ai-review-reactions.test.ts` and the repository lint, typecheck and English checks.

## Brand artwork

Provider adapters select their own local SVG through `logo`. The shared card renders it as a CSS mask so the mark follows the card tone in both themes. Adding a provider needs an SVG and its adapter path; the card renderer needs no new condition.

Codex and Greptile artwork comes from the installed MIT-licensed `@lobehub/icons` 5.21.0 package. CodeRabbit artwork comes from `simple-icons` 16.32.0 ([brand source](https://www.coderabbit.ai/brand)). Files live in `public/ai-review-providers/` and do not depend on external image requests.

## Lifecycle and permissions

The reducer orders events by the provider's timestamp. A new request or running phase starts another lifecycle. Reactions on older request comments cannot settle a newer request. A generic completion preserves findings or an explicit clean result already observed in that lifecycle. Equal timestamps favor findings. Follow-up inline replies and reactions on unrelated comments do not create reviews.

The transport enriches reaction counts with known reviewer identities and creation dates, following each subject's reaction pagination. Existing counts and viewer reaction state are unchanged. Only PR-body reactions and reactions on the matching provider's request comment become status signals. Deleted reactions disappear on the next refresh; summary comments and submitted reviews can still establish completion. The existing conversation-reaction scan covers up to 500 comments; beyond that, comment and review text remain available but reaction-only signals may be absent.

Completed reviews use the green success tone, including generic completion without an explicit clean verdict. A review with findings also becomes completed when all of its associated root threads are explicitly resolved. Submitted reviews are matched to their inline findings by review id; each provider's threads are considered independently. Missing resolution data, unmatched review summaries and outdated but unresolved threads cannot establish a fix. Reopening a finding restores its warning state, and a newer request or running review stays active. Resolution preserves the provider's original activity date and duration rather than inventing a correction timestamp or a clean verdict. The existing resolution cache updates the cards immediately, including optimistic changes and their rollback on failure.

Reviews with unresolved findings or a failure keep their distinct warning state. Running cards tick from a dated running signal. Completed cards freeze a duration when a start was observed, otherwise show the activity date. The application tooltip gives the full timestamp. The existing PR live updates and one-minute polling backstop refresh the cards because GitHub does not send reaction webhooks.

Requesting another review uses the existing human comment API, requires comment permission and an open PR, prevents duplicate in-flight requests, and shows the returned comment as a waiting state immediately. The hover actions are also exposed on keyboard focus. Posting errors leave the previous result available for retry.

This initial registry targets GitHub's stable bot identities. GitLab installations use configurable usernames and need a separate verified identity contract before enabling these adapters there. Unknown providers and arbitrary bot comments remain in the activity feed without inferred status cards. Review cards describe the latest observed provider activity, not certification of the current commit.
