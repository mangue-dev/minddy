# copy-fix — landing + tarifs

Application of `copy-audit-landing.json` (104 findings, 0 outstanding questions).
No commit: reread by `git diff`.

Done in two passes: **phase 1** copying and mechanical corrections,
**phase 2** restructuring the page. The 104 findings are processed.

- **Applied**: 103 findings (86 in phase 1, 17 in phase 2)
- **No action, decided by the audit itself**: 1 (`section-feedback.missing.public-site`)
- **Already correct, unchanged**: 1 (`Pricing.faq_refund_a`)
- **Discarded, nothing to invent**: 1 (`structure.no_reassurance`)
- `tsc --noEmit` OK · `vitest run` 369/369 OK · rendered checked on `/` and
  `/pricing` in fr and in: 0 `MISSING_MESSAGE`, 11 anchors resolved out of 11

⚠️ `app/(app)/inbox/page.tsx` was already modified before this pass — the `git diff`
So mixes a change that has nothing to do with the copy.

---

## Appliques

### `messages/fr.json` + `messages/en.json` — 80 modifications par catalogue

The two languages are mirrored (the audit provided `proposed_en` for
each channel). Key parity checked: `Landing` 145, `Pricing` 18,
`Billing` 59, no fr/en gap.

#### Hero and meta — the angle changes

| key | before → after |
|---|---|
| `heroTitleBefore` + `heroTitleAccent` | “minddy is the tracker that your agents / pilot. » → “A complete tracker, / and yet obvious. » |
| `heroSubtitle` | the ticket chain → plan → PR → completeness enumeration + “only one way” |
| `heroBadge` | “MCP server included” → “…, from the free plan” |
| `heroNote` | addition of the blocking limit of 300 tickets/project |
| `metaTitle` | “the tracker that your agents control” → “the ticket tracker that remains simple” |
| `metaDescription` | realigned to the same angle |

**Splitting `Before`/`Accent` moved.** The `proposed` of the audit cut on
“A complete tracker, and yet / obvious. ", which left only one word in
italics — the finding note explicitly requested a minimum of two words so that
the hero's animation cascade remains readable. The sentence is applied to the word,
only the border moves: `Before` = “A complete tracker,” `Accent` =
“and yet obvious. ". Same in English.

#### Factual corrections (the bulk)

String rewritten verbatim according to the `proposed` of the audit, category in parentheses:

- `workflow_write_body`, `workflow_run_title`, `workflow_run_body`,
  `workflow_review_body`, `workflowSubtitle` — the agent journey (Git repository
  mandatory, who launches, what the sandbox does, the PR which is not automatic)
  *(stale_mix / missing / unclear)*
- `agentsTitle`, `agentsCapability_track`, `agentsCapability_create`,
  `agentsCapability_comment`, `agentsInstallNote` — no more pull requests and diff
  in support" (nothing is ever attached), no more "your agent opens the
  browser » *(stale_mix / unclear)*
- `numoSubtitle`, `numoCapability_plan_body`, `numoCapability_find_body`,
  `numoCapability_context_body`, `numoExample_plan` — PR is no longer promised
  automatically, the code agent is named "minddy" *(stale_mix)*
- `voiceTitle`, `voiceSubtitle`, `voice_everywhere_body`, `voiceNote` — the microphone
  is not “next to each field”, the notebook goes through “/” *(stale_mix)*
- `scratchpadSubtitle`, `scratchpadPoint_write`, `scratchpadPoint_agent`,
  `scratchpadPoint_promote` *(stale_mix / unclear / info_overload)*
- `feedback_post_body` (delayed publication, hourly cron), `feedback_dedupe_body`
  (live suggestion + auto merge), `feedback_status_body` (+ “Declined”),
  `feedbackSubtitle` (subdomain, not domain) *(stale_mix / unclear)*
- `feature_board_body` (no list view, always grouped by status),
  `feature_triage_body` (MCP tickets go to backlog, not triage),
  `feature_cycles_body`, `feature_palette_body`, `feature_board_title`,
  `featuresCaptionCycle`, `featuresCaptionPalette` *(stale_mix)*
- `faq_agents_a` (3 out of 7 agents are not installed by a command),
  `faq_byok_a` (BYOK raises the cap, does not stop the countdown),
  `faq_data_a` (**no ticket export exists** — replaced by the GDPR email),
  `faq_migrate_a` (**assignments are never imported**), `faq_team_a`,
  `faq_usage_a` *(stale_mix / structure)*
- `pricingSubtitle`, `pricingNote`, `ctaTitle`, `ctaSubtitle` *(stale_mix / unclear)*
- `Pricing.heroTitle`, `heroSubtitle`, `metaDescription`, `comparisonSubtitle`,
  `faq_usage_a`, `faq_overage_a` (monthly budget even annually), `faq_change_a`
  (**“proration” removed** — not verifiable from the repo) *(stale_mix)*
- `Billing.featureBaseUsage` “Included AI usage” → “Basic AI usage”,
  `Billing.limitIssuesPerProject` (max) removed, `en.Billing.billedYearly`
  “Billed {total} €/year” → “Billed €{total}/year” *(structure / inconsistent)*
- ONLY: `agentsSubtitle`, `numoExample_assign`, `scratchpadPoint_mcp`
  *(inconsistent)*

`Pricing.faq_refund_a`: **unchanged**, audit confirmed correct (finding no_change).

#### Consistency of CTA labels (`consistency.signup_cta_labels`)

Rule applied — two labels instead of five:

- “Start for free” where the context is the overall promise:
  `heroCtaPrimary`, `ctaButton`, and **`navGetStarted`** (“Start” → “Start
  for free”, EN “Get started” → “Start for free”)
- “Create an account” on rate cards: `pricingCtaPaid` (already) and
  **`pricingCtaFree`** (“Start for free” → “Create an account”)

> Check by eye: the nav button lengthens significantly. If it breaks the bar
> on mobile, say it — we reverse the rule rather than keeping three labels.

#### Vouvoiement and terminology

- `featuresSubtitle`: “A tracker **that we** open” → “**that you** open”
- `numoExamplesTitle`: “What **we ask him**, in real life” → “What **you ask him**
  ask**, for real.” The audit cited the phrase without “, in fact”; the tail is
  retained, only the proposed transformation is applied.
- `feedbackCaptionBoard`: “we propose, we vote” → “**your users**
  propose, vote” (variant explicitly retained by the finding)
- `feedbackSubtitle` + `feedback_decide_body`: “the same **request**” / “promote
  the **request**” → “the same **return**” / “promote the **return**”, by
  rule “return = name of the object in French”. “ask” (verb) in
  `feedbackTitle` and “feedback board” (product name) are retained.

### New keys

| key | where |
|---|---|
| `Landing.agentsCapability_review` / `_beyond` | +2 bullet points in the MCP section |
| `Landing.feature_all_title` / `_body`, `feature_inbox_title` / `_body` | +2 cards in the grid |
| `Pricing.faq_mcp_q` / `_a`, `faq_byok_q` / `_a` | +2 questions about /pricing |

Phase 2 adds 20 more (`speed*`, `more_*`, `feature_objectives_*`,
`agentsPlanNote`, `navAgents`, `footerSpeed`, `footerMore`) — details below.

### `components/marketing/voice-dictation-figure.tsx`

`Landing.voiceFigureDue` **removed from both catalogs**. The date was written in
hard (“Fri. July 24”) and already showed a past deadline. She is now
calculated when rendered by `nextFriday(locale)` — next Friday, Friday in
course not counting, formatted by `Intl.DateTimeFormat` therefore correct in both
languages. Checked: the marketing page is not prerendered (the layout reads the session
to redirect a connected visitor), no `revalidate` nor `force-static` — the
date follows the calendar well.

### `components/marketing/screenshot-slots.ts`

Three capture instructions described a non-existent UI:

- `workflowIssue` — `route` corrected: `/projects/<id>/issues/<identifier>` **does not exist
  not**, the detail of a ticket is a side panel. `shot` corrected: description
  and plan are two exclusive tabs.
- `numoPanel` — `route` and `shot` corrected: extended mode, action lines are not
  not unfold, the context badge is in the composer (bottom), not at the top.
- `workflowPr` — `shot` corrected: the Pull requests page (list + detail), tab
  “Modified files” to switch by hand.

### The product grid (file renamed in phase 2 → `section-tracker.tsx`)

Grid extended from 4 to 6 cards. **Icons changed, decision on my part**: `Inbox`
was taken by the Triage card, it returns to the Inbox card; Triage moves to
`ListFilter`, “All your projects” takes `Layers`, “Goals” takes `Target`.
See again if you have better.

Final state after phase 2 — board → all projects → inbox → objectives → cycles →
triage. The ⌘K palette has left the grid to open §3.

### `components/marketing/structured-data.tsx`

Node `offers` added to `SoftwareApplication`: a `AggregateOffer` EUR
(lowPrice 0, highPrice 20) and three `Offer` **derived from `BILLING_PLANS`**, never
copied, with the plan names read in `Billing.planFree/Go/Pro`. Each offer
carries a monthly `UnitPriceSpecification`, otherwise the price reads like a
single payment.

### `app/(marketing)/opengraph-image.tsx`

Frozen copies resynchronized on new `en.Landing.metaTitle` /
`metaDescription` (`alt`, title, subtitle) — otherwise the sharing thumbnail
kept announcing “open the pull request”. Resynchronization instruction
manual written in the header comment, as proposed by the audit.

---

## Phase 2 — restructuring

`structure.page_plan` and its five related findings. **9 content sections → 6.**

| # | Section | Anchor | Where she comes from |
|---:|---|---|---|
| 1 | Hero | — | rewritten in phase 1 |
| 2 | The tracker | `#tracker` | ex-`#features`, rise from 8th to 2nd place |
| 3 | Made to go fast | `#speed` | **new** — absorbs the palette, the dictation, the notebook |
| 4 | Your agents work in it | `#agents` | merger Workflow + MCP + Numo |
| 5 | Feedback from your users | `#feedback` | unchanged, moves up one place |
| 6 | And the rest is already there | `#more` | **new**, short strip |
| 7-9 | Pricing · FAQ · CTA | | unchanged |

Rendered page: 13,169 px, compared to 9 sections of content previously. The gain is not
not in height, it is in order: the product appears in 2nd position in
instead of the 8th, and the reader no longer reads the same gesture three times.

### Fichiers

- `section-features.tsx` → **`section-tracker.tsx`** (`git mv`, the function becomes
  `SectionTracker`, anchor `#tracker`)
- **`section-speed.tsx`** — new
- **`section-more.tsx`** — new
- `section-agents.tsx` — rewrites, absorbs `section-workflow` and `section-numo`
- **deleted**: `section-workflow.tsx`, `section-voice.tsx`,
  `section-scratchpad.tsx`, `section-numo.tsx`
- `page.tsx`, `marketing-nav.tsx`, `marketing-footer.tsx` — order and anchors

### §2 — The tracker (`#tracker`)

The title “Whatever it takes. Nothing more. » **did not move**: he arrived later
six sections that contradicted him, he now opens instead of concluding. The
grid increases to 6 cards — addition of **Objectives**
(`structure.objectives_never_explained`, verbatim string of the audit), and the palette
⌘K **leaves** the grid to open §3.

Only one capture remains here (the cycle): it goes full width rather than
stand alone in a two-column grid.

### §3 — Made to go fast (`#speed`) · new

The section that was missing the most: the page only defended simplicity through
number of screens, never by the number of gestures. Three blocks under one H2:

1. **the keyboard** — palette capture + `feature_palette_title` / `_body`
2. **voice** (`#voice`) — the entire Dictation section, as `h3` instead of `h2`
3. **the notebook** (`#scratchpad`) — same

New keys: `speedTitle`, `speedSubtitle` (audit verbatim) and
`speedShortcuts` — **line I wrote**, from the five shortcuts that
the audit cites and that other findings verify each on their own (G then I,
G then N, G then A, ⇧V, ⇧A).

### §4 — Vos agents travaillent dedans (`#agents`)

Merger of the three sections which recounted the same gesture. A single thread: the
connection (MCP, installation insert, 7 capacities) → the route in 3 steps
(`#workflow`) → Number from the app (`#numo`).

New key `agentsPlanNote`, under the installation insert: **the MCP server is
included in all plans, only the Numo agent asks for Go or Pro.** This is what the
page was silent and which transformed its force into an objection — derived from the FAQ answer
`Pricing.faq_mcp_a` added in phase 1, therefore consistent from one page to another.

**Keys removed**: `numoCapability_plan_title` / `_body`. The ability “He
plans, then he launches” repeats word for word the 3-step journey which
now precedes in the same section — this is the repetition that
`three_sections_same_story` asked to withdraw. The string I had rewritten in
phase 1 therefore disappears with it.

### §6 — And the rest is already there (`#more`) · new

Short strip, without capture, four lines. Verbatim of the audit for the views
shared and API/webhooks; **title, subtitle and two lines written by me**
(see “Copy that I wrote” below).

### Anchors survive cutting

`#voice`, `#scratchpad`, `#workflow` and `#numo` are no longer sections but
anchors remain, placed on the blocks which absorbed them. The foot ties of
page and any links already shared fall in the right place. Verified at the rendering: the
11 referenced anchors all exist in the HTML.

### The nav (`structure.nav_out_of_sync`)

`Le tracker (#tracker) · Les agents (#agents) · Tarifs (#pricing) · FAQ (#faq)`.
Before: `#workflow` and `#features`, two anchors which no longer exist as sections,
and `#agents` — target of the hero's badge — absent.

“Rates” now targets the landing section and not `/pricing`, as in
asks for the finding; the complete comparison remains one click away by “Compare plans
in detail.”

> Divergence reported: the finding offers **4** entries, the summary at the top
> from `copy-audit-landing.md` offers **5** (with “Go quickly”). I followed the
> finding — it is the normative artifact — and `#speed` remains accessible by the foot of
> page.

### The two arbitrations that I had left open

**`consistency.section_badges_no_rule` — decided.** The rule set by the audit
(“a badge only when it names a feature that the title does not name
not") gives its own answer: the "Numo" badge jumps, since the title begins
by the word. The Numo icon remains, in the same icon location as the others
blocks. Verified on the three remaining badges: `voiceBadge` and `scratchpadBadge`
name a feature that their title was → kept; `heroBadge` also → kept.
The rule is now held everywhere.

**`consistency.h2_punctuation` — decided.** No H2 carries an endpoint, except
`featuresTitle`: “Whatever it takes. Nothing more. » is made up of two sentences
cut, removing the second point while keeping the first would be worse than the exception.
I therefore removed the point of `agentsTitle` — that the `proposed` of the audit brought
— so that there remains **one** intended exception instead of two accidental ones.

**`consistency.feedback_ai_naming`** remains outside the scope: the targeted channels are
in-app (`FeedbackBoard.*`, `Settings.*`, `Billing.segment*`) and the finding was
marked `remove`, without proposal. On the landing I followed answer 10 —
`feedbackNote` attributes moderation to **Numo** — which diverges from the public board
himself, who says “by AI”.

---

## Copy that I wrote

The audit did not provide a channel for these five. Each is constrained by
a fact already verified elsewhere in the audit, but none is verbatim — **to be reread
as a priority**:

| key | what I relied on |
|---|---|
| `speedShortcuts` | the 5 shortcuts cited by `structure.speed_section`, each corroborated by another finding |
| `agentsPlanNote` | derived from `Pricing.faq_mcp_a`, audit verbatim |
| `moreSubtitle` (en) | the fr is verbatim; the audit only gave the title in English |
| `more_import_title` / `_body` | derived from `faq_migrate_a` |
| `more_i18n_title` / `_body` | i18n fr/en + light/dark theme, checked in settings |

**Key deleted without audit requesting**: `featuresCaptionPalette`. She
captioned the capture of the palette as long as it was an anonymous figure in
§2; in §3 the capture is pasted to its own title and to `feature_palette_body`,
who say the same thing but better. Two twin texts 20 px apart —
this is the definition of `useless_info`. Say it if you want her back.

---

## Findings without action

- **`section-feedback.missing.public-site`** — audit decision: do not
  mention that the board is a small site. `remove` action, no string.
- **`structure.no_reassurance`** — no social proof exists today, we
  don't invent anything. To be reopened the day a real figure exists.
- **`Pricing.faq_refund_a`** — confirmed correct by audit, unchanged (the line
  still appears in the diff: it gained an ending comma, both
  MCP and BYOK questions arriving after it).

`Landing.missing.statistics` and `Landing.missing.issue_structure` remain off page
as required by the `completeness_section` note (“not to inflate”) — it is
precisely what prevents §6 from becoming a catalog.

---

## Other points to watch

**`Landing.feedbackNote` is now three sentences long.** Two findings
separate requests each asked to add text (`missing.private-and-my-feedback`
for moderation by Numo, `missing.integration-wizard` for the prompt
integration) and both are applied verbatim. Result: “via API”
appears twice. This is the only place in the diff where I would have cut if the audit
had authorized me to do so - it's up to you to cut.

**Translations not affected**: none. The audit provided `proposed_en` for all
the strings rewritten, nothing was machine-translated. Two exceptions reported, where
the correction was marked FR-only and where English therefore keeps its formulation
original, to check if you want the alignment:

- `en.Landing.numoExamplesTitle` = “What people actually ask it” (the FR is passed
  to the vow)
- `en.Landing.feedbackCaptionBoard` = “Public side: people suggest…” (the FR says
  now “your users”)

**What remains to be seen** — the rendering was checked in 1280 px, not in
mobile or in dark theme. The three points to watch out for: the elongated nav button
(“Start for free”), §4 which is long by construction (it merges
three), and §3 whose three blocks must remain distinct without H2 for the
separate.

---

## Relecture

```
git diff HEAD -- messages/ components/marketing/ "app/(marketing)/"
```

**`HEAD` is needed, not a bare `git diff`**: phase 2 removes four
components and renames one, and `git rm` / `git mv` places these changes in
the index — a `git diff` without a reference would not show them. The two new
components (`section-speed.tsx`, `section-more.tsx`) have been marked `add -N` for
that they too appear.

Nothing has been committed. `app/(app)/inbox/page.tsx` in global diff is earlier
at this pass.
