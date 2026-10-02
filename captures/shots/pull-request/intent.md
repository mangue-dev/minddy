# The pull request

Landing location: `workflowPr`, last of the three stages of “From ticket to
the pull request”. The text next to it says: *“The pull request arrives on the ticket
with its description and diff, file by file. You reread, you
comment, you merge. »*

## Why this capture is a special case

**The diff is not in base.** minddy reads it **live** on GitHub every
opening the screen (`app/api/agent-runs/[runId]/pr/route.ts`), with a token
installation. No seeded data can make it, and the demo account
does not have a connected repository: placing a `pr_number` on the run would bring up
a line in the list, but opening it would call the forge and fail.

Approach adopted, validated with the user: **open the real page and
respond to read requests** for him, with `page.route()`. Three
answers are provided by the capture:

| Query | What we return |
|---|---|
| `/api/pull-requests` | a PR, #128, open, on AUR-2 |
| `/api/agent-runs/<id>/pr` | the PR header and its 3 files with their patches |
| `/api/agent-runs/<id>/comments` | a human proofreading and Numo's response |

`/api/agent/models` and `/api/account/agent-preferences` are **not**
intercepted: they respond normally for the demo account, there is no
no reason to replace them. `/api/agent-runs/<id>/pr/review-comments`
would respond `[]` in real life — we neutralize it so that it does not call the
forge, mais son contenu reste vide.

**Nothing is written.** No `pr_number` set, no line touched. The page is
the real page, the app is the real app; only the answers from three readings
are provided by the script.

## Ce que l'image doit montrer

- The header: **#128 ⇄ AUR-2**, the status badge **Open**, and the readiness
pill **“Prête à fusionner”** — the merge affordance, one click away.
- The title of the ticket, the badge **Numo**, `main → numo/aur-2-palette-shortcuts`
and the **+58 −7** total.
- The **status cards row**: “2 checks réussis” (green, 1 min 32 s) and
“Faire vérifier par Numo” — CI and the agent, side by side.
- The **Fichiers modifiés** tab, with the **three files** and their colored diff:
  `lib/palette/actions.ts` (+6 −1), `components/palette/row.tsx` (+14 −2),
  `components/palette/provider.tsx` (+38 −4), the unified/side-by-side toggle,
  and “Commencer la review”.
- The **3** counter on the Fichiers modifiés tab.

## Continuity with the capture of the agent

Same ticket (AUR-2), same title, same branch
(`numo/aur-2-palette-shortcuts`), same three files and **exactly the same
totals** than the “3 modified files +58 −7” block of `workflowAgent`. THE
two images read like two moments of the same work - this is the point of
the section.

The patches are written line by line so that the displayed counters are
ceux du diff rendu : `+6 −1` en face d'un patch qui ajoute vraiment six lignes.
A wrong hunk header or a counter that doesn't hit right would show.

## Description and diff are two tabs

As with `workflowIssue`, the catalog instruction requests both at the same time
— “branch header → branch, generated description, and one diff per file”.
`PrDetail` has an **Activité** tab (the description opens the thread), a
**Commits** tab and a **Fichiers modifiés** tab (the diff). We photograph the
difference: this is what we cannot not told in text, and it is the only one of
the three that is visual. The tab is designated by its translated label, not
by rank: the sidebar's PR list item carries the `tab` role too, so a raw rank
lands on the commits list and the diff check fails without saying why.

The “branch → branch” of the instruction lives in the header line:
`main → numo/aur-2-palette-shortcuts`, next to the +58 −7 total.

## The mutation checks, and why this run is capture-only

The script ships two modes. The full mode replays the whole mutation UI
(draft, readiness, resolve conversations, squash-merge defaults) — it is the
regression suite of the PR screen. The marketing refresh runs
**`--capture-only`**: the mutation UI checks target testids that no longer
exist after the 2026-09 redesign (`pr-edit-title`, the `pr-checks` banner)
and the photographic end-state is the same — resolved conversations,
“Prête à fusionner” — reached here by simply not perturbing them.

## Cadrage

1447 × 1085, the common window of slots 4/3.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## What the 2026-08-04 refresh broke, and why

Three product changes brought down the script all at once. They are
recorded here because none were visible when reading the fixture:

1. **PR replaced run as key** (MIN-143). The detailed readings are
changed from `/api/agent-runs/{runId}/pr*` to `/api/pull-requests/{prId}/*` —
the page also shows human PRs, which have no runs. The fixture
therefore responded to routes that no one called anymore.
2. **The list has an envelope.** `/api/pull-requests` returns
`{ pullRequests, hasMore, truncated, repoCount, anyPr }`, and the page returns its
blank screen as soon as `repoCount === 0` — BEFORE looking at the list. Serve
`{ pullRequests: [...] }` alone gave “Link a GitHub or GitLab repository”:
a green, empty page, exactly the failure mode this file fights.
3. **A “Committs” tab has slipped into the middle.** The Files tab is the
third, plus the second.

## Known pitfalls

- **`page.route` handlers are tried in REVERSE order
registration.** The safety net that aborts everything `/api/pull-requests`
unknown must therefore be placed **first** to be consulted last.
Placed last — the order that reads naturally — it passes in front of the
precise managers and aborts the list itself.

- **Never intercept with a glob that is too large.** `**/api/agent-runs/*/pr`
would also catch `/pr/review-comments` depending on the order of registration. THE
routes are laid by predicate on the exact path.
- **The Files tab is designated by its rank**, like that of the plan of a
ticket: its wording is translated and carries the file counter.
- **The run is synthetic.** The identifier `demo-pr-aur-2` does not exist in
basis: this is deliberate, it makes it impossible for an unintercepted request
  atteigne un vrai run.
