# Feedback, team side

Landing location: `feedbackInbox`, to the right of the public board in the
“Feedback” section. The two images respond to each other: one shows what we see
the users, the other what the team does with it.

## Ce que l'image doit montrer

- The **merge banner suggested by the AI**, at the top of the return:
“AI suggests merging into “Slack alerts when an incident opens”
(91%)”, with its two actions **Merge** / **Reject**. It's the only one
screen where the automatic sorting is seen.
- The feedback itself — “Can we get notified in Slack?” » — its text, and its
  compteur de **5 votes**.
- Team gestures from the top bar: **Promote to ticket**, **Refuse**
and their rafters.
- The **properties table** of the return — Voice, Status, Linked ticket, Type of
return, Visibility, Author, Categories, Created on — then the activity and the
  composeur de commentaire, qui porte sa bascule **Interne / Public**.
- The list on the left: eight returns sorted by votes, with their statuses, email
of their author, and the little fusion mark on the one we opened.

## Or

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8/feedback`, connected as Camille
Roy, return “Can we get notified in Slack? » selected.

**This return and not another**: the fusion suggestion only exists on him
(`world.md`). On the other eight, the image would lose what the landing highlights
Before.

## Cadrage

1736 × 1085 — 16/10 frame, the common window.

## What was corrected in the data for this capture

The team view displays the author in full: “Author: <email>”. THE
votants portaient l'adresse `captures-demo+voterNN@minddy.app`, qui serait
part on the landing. `011-votants-emails.mjs` gave them addresses
credible fictitious accounts — pseudonyms, votes and feedback unchanged.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## What the screen lost, and the defect that remains (August 12, 2026)

The field **“Team response”** no longer exists: the form has been passed to a
properties table plus a single dialer toggle Internal/Public. There
public response is therefore no longer written here — the above intention is
corrected, not the product.

**The dates in the column have become relative**, and they come out FALSE:
“in 5 days”, “in 1 week”. It's not a bug in the app, it's ours
given. `FeedbackRow` receives `format.relativeTime(created_at, now)` where `now`
comes from `useNow()` — therefore from the frozen capture clock, July 15
2026**. However, `007-feedback.mjs` dates its returns to the **current fortnight in
moment of seed** (`spreadInWindow`), and they fell on July 20-24:
*after* the clock. `world.md` however promises that any date from the demo world
is before July 15 — the seed of the feedback is the only one not to keep it.

As long as the dates displayed were absolute (`20/07/2026`), the offset was not
didn't see. It is now visible on eight lines.

The correction is in the data, not here: backdate `created_at` returns
demo before July 15, by `capture-world` — therefore a writing based on
production, which requires the explicit consent of the user.

## Known pitfalls

- **The title of the return is English data**: it is the anchor, valid for
both languages. The statutes are translated - never get hung up on them.
- **The merge banner arrives after the return.** It comes from columns
analysis (`merge_suggestion_*`) rendered with the detail, not with the list:
you have to wait for it explicitly, otherwise you photograph the return without it.
- **The percentage is a given** (0.91 → “91%”), therefore a valid anchor
in both languages. The sentence around it, no.
- **The Numo FAB is visible at the bottom right** on this page, with its sticker
of context. It's the product, we keep it.

## The capture of 2026-08-04 was made LOCAL, and here is why

This screen no longer went to preview: it fell on its error boundary
(“This page couldn't load”), with React #310 — *rendered more hooks than
during the previous render*. The cause was in `FeedbackDetail`
(`components/feedback/feedback-team-page.tsx`): `useScrollFade` was called there
**after** the `return` of the loading skeleton. At first rendering `post` is
no, we leave early, the hook does not exist; in the second it appears, and the order of
hooks changes. Any Feedback view of a project HAVING feedback fell — Beacon,
which has none, passed, and the production, not yet up to date, too. This is what
made the breakdown discreet.

The hook is now declared with the others, before the `return`.

The capture was taken on `http://localhost:3000` launched with
**`VERCEL_ENV=preview`** — not `NEXT_PUBLIC_VERCEL_ENV`, only `next.config.mjs`
rewritten from `VERCEL_ENV`. This is what gives the logo its blue tint.
preview instead of development pink (`ENV_LOGO_TINT`, `lib/env.ts`).

Two precautions that go with it:

- **PostHog keys are emptied at launch** (`POSTHOG_API_KEY=`,
  `NEXT_PUBLIC_POSTHOG_KEY=`). `VERCEL_ENV=preview` fait passer
`shouldSendServerAnalytics` to true: without that, the server events of a
`next dev` would go to the production PostHog project;
- **Next's development indicator is hidden** by `browser.mjs`
(`nextjs-portal { display: none }`). It only lives on `next dev`, so it
did not appear on any captures so far — and he invited himself down below to
left of the first local socket.

**Replayed on preview on August 12, 2026**, fix deployed: the screen goes there, the
local parenthesis is closed.
