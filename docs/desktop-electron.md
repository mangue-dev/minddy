# A desktop app for minddy — framing

> **Date**: 2026-08-13 · **Ticket**: MIN-285 · **Status**: exploration, none
> Electron code written.
>
> **Four decisions taken before writing**, and this document does not reopen them:
> the deliverable of MIN-285 is this text, not a prototype; **the agent who acts on
> the local repository is the subject**, the wrapper is only the vehicle; the
> notifications were initially limited to the open app (replaced by
> APNs in MIN-356); macOS was the only target until the Linux distribution in
> MIN-418.
>
> **What was read to write it**, rather than assumed: the harness of the
> microVM and its protocol ([vm/protocol.ts](../lib/server/agent/vm/protocol.ts),
> [vm/local-host.ts](../lib/server/agent/vm/local-host.ts),
> [vm-launch.ts](../lib/server/agent/vm-launch.ts)), the control plane gate
> ([app/api/agent-vm/[...path]/route.ts](<../app/api/agent-vm/[...path]/route.ts>)),
> the network policy ([network-policy.ts](../lib/server/agent/network-policy.ts)),
> the key by run ([run-key.ts](../lib/server/agent/run-key.ts)), the existing push
> ([public/sw.js](../public/sw.js), [lib/push/](../lib/push/)) and the
> login ([login-form.tsx](../components/auth/login-form.tsx)).
> **Nothing has been measured**: none of the durations in this document are a probe, and
> the places where it is missing are said at the end.

---

## What the ticket believed, and what the repository said

Two premises of MIN-285 do not hold as is. One takes away his
first argument, the other makes it much more constructible than it seems.

**Web Push is not available in Electron.** Electron is not built on Chromium
but on *Chromium Content*, a subset which **does not include the service of
push**. Measured in a real window in MIN-291, and the nuance matters: the API,
it is there — `PushManager` exists, `pushManager` is on the prototype of
`ServiceWorkerRegistration`, and `/sw.js` register normally. It's
`subscribe()` which fails, on `AbortError: Registration failed - push service not
available`. Practical consequence, and it is not cosmetic:
`isPushSupported()` ([lib/push/client.ts](../lib/push/client.ts)) makes **`true`**
in the app, so the settings switch would be displayed there like everywhere and
would fail on an unreadable error. Hence the desktop branch of
[account-push-devices-section.tsx](../components/settings/account-push-devices-section.tsx)
said it explicitly until MIN-356.
But minddy already has the real web push from MIN-183 — service worker, VAPID, transmitter
server — and it rings **even when the app is closed**, in Chrome as in
Safari. Packaging the web app in Electron does not improve it: it deletes it. The
The replacement delivered in MIN-356 is the Apple APNs (`pushNotifications`,
**macOS only**): entitlement on the signed app, token associated with the account
by the authenticated page and second server-side issuer. VAPID remains unchanged
for the web; no unofficial FCM enters the shell.

**You already have an installable app.** [app/manifest.json](../app/manifest.json),
icons 192/512, the service worker: "window without URL bar, icon in the
dock, notifications even closed" is a PWA, it is within reach, it costs neither
signature, notarization or maintenance of a Chromium binary. **All that a
wrapper Electron also provides comfort of use, the PWA already provides it** — except
one thing, and it is the one that justifies the project: the PWA will never touch your
disk.

**The harness is already half local.** Since MIN-224 the agent loop
no longer lives in a function: it is an **autonomous Node bundle** produced by
[scripts/build-agent-vm.mjs](../scripts/build-agent-vm.mjs), written to disk
the microVM and launched by `node main.js`. He writes his files and launches his commands
by [local-host.ts](../lib/server/agent/vm/local-host.ts) — `node:fs` and
`node:child_process`, nothing else — and it only talks to the backend over HTTPS, via
[control-plane-client.ts](../lib/server/agent/vm/control-plane-client.ts). Do it
running on a Mac instead of a microVM `iad1` is not a rewrite: it is a
change of host, with **three locks** (§4) and a waiver (§4.4).

---

## 1. What Electron brings, and what it takes away

| | PWA installed | Electron Wrapper |
| --- | --- | --- |
| Dedicated window, dock icon | yes | yes |
| Notifications **app closed** | **yes** (Web Push) | **yes** (APNs, MIN-356) |
| Open app notifications | yes | yes, native |
| Global shortcut (⌥ Space) | no | yes |
| Native menu, encrypted dock badge | partial | yes |
| **Execute code on your machine** | **never** | **yes** |
| Entry cost | zero | signature + notarization + update channel |
| Recurring cost | zero | ~$99/year, and an Electron major every 8 weeks |

The line that decides is the sixth. The first five are discussed; that one
has no substitute. **The desktop app folder is the local agent, and
nothing else.** If the local agent is not done, the PWA must be treated and closed
this ticket — it's less work and a better result on notifications.

One consequence to keep in mind throughout: **the shell must remain thin**. All this
that it contains must be signed, notarized, distributed and updated on the
people's machines, at a pace that is not that of `git push`. A shell of
300 lines is updated twice a year; a shell that has screens of its own
becomes a second app to maintain.

---

## 2. The shell

**Current implementation: one product `BrowserWindow` loads minddy Cloud or an
explicitly selected self-hosted origin.** The product UI is never bundled in the
app, so the desktop and web clients still render the same interface. The shell
contains one isolated local form for selecting a server. It accepts HTTPS public
origins and HTTP loopback or private-network IP origins, stores the choice in `userData/server.json`,
and exposes no general-purpose bridge to that form.

Settings that cannot be discussed:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer
  load of **remote code**: it must only be able to call what a `preload`
  exposed by name by `contextBridge`, and this surface must be read in thirty
  seconds.
- A **navigation guard** (`will-navigate`) which refuses everything that is not
  our origin, and a `setWindowOpenHandler` which sends the rest into the
  system browser. Without that, a link to a third party site opens this site *in*
  minddy, with our `preload` loaded.
- A user agent suffix (`minddy-desktop/<version>`), so that the server and
  the UI both know that we are in the app.

**The title bar is an interface decision, not a setting.** It is
hidden (`titleBarStyle: "hidden"`, not `frame: false` — without a frame, the
buttons are no longer positioned from the same origin and go back into the
corner). Three consequences stand together:

- macOS no longer knows where to enter the window. `-webkit-app-region` is CSS,
  so it is the PAGE which must say it (app/globals.css, section “app de
  office"). **Single strip, in root layout**, as high as the header
  of the app (60 px) and present on everything the window displays. The first
  version hooked the socket to the shell header and mark line —
  that is to say to the two pieces of furniture that six configurations do not have: zen mode,
  legal pages, public board, published page, shared view, `not-found`. The
  window was strictly still there (MIN-292). A `drag` zone swallowing the
  click, the band is accompanied by a GLOBAL `no-drag` on everything that activates.
- The system buttons no longer exist on their own: they light up by hand,
  and arise **in the sidebar mark line, in place of the
  mark**, which passes to the right. Not in a gang of their own, which would push the whole
  column downwards and would be betrayed by a seam of another color.
- FOLDED bar (rail), its 56 px no longer hold them: we remove them, and
  brand takes its place. The flyover that unfolds the rail brings them back — a bar
  unfolded over the secondary is an unfolded bar like any other. Go
  clicking them from there means EXIT the bar from the point of view of
  Chromium: the rail would close under the pointer and take them away, hence the
  lookout for `app-sidebar.tsx`, who recognizes this exit at his corner.

**SITE doesn't follow in the window — and "site" means ALL
site** (tightened to MIN-292). The desktop app only shows two things:
authentication, and app. Prices, MCP server documentation,
comparisons, new features, legal pages, download page, and
public tokenized surfaces — feedback board, published page, shared view —
open in the BROWSER. A public feedback board in a window
installed, it's the website in a window.

The only exception is **landing**, which does not go outside but returns to
the entrance: we don't go there, we FALL there, through a logo that points to `/`. Throw a
browser with each logo click would be a punishment.

The decision is derived from `PUBLIC_ROUTES`, so one more public page comes out
from the window without anyone thinking about it
([window-routes.ts](../lib/desktop/window-routes.ts)). And she asked
**four** hook points, two of which we don't find when thinking:
`will-redirect`, because the feedback board is reached by a redirection
SERVER (`/feedback` sets a JWT and returns to `/f/<jeton>`, no link
never points to it), and `did-navigate-in-page`, for SPA navigations. This
last is NOT cancelable: it can only bring back to the entry, and undo the
navigation was tried twice without success (`canGoBack()` makes `false` just
after a `pushState`; the promise of `executeJavaScript("history.back()")`
rejects, navigation destroying the context that expected it). Hence the sharing
roles: the main process guarantees that no public page is displayed, and
it’s the PAGE that avoids getting there — the legal notices on the screen
registration opens the browser themselves rather than browsing.

The cookie banner: a floating card that asks permission
to measure is aimed at someone who has just arrived from nowhere, and in a
app installed it only says one thing — “this is a website in a
window”. The choice does not disappear. It arises **once**, in the center, in the
app language — two straight answers, no exit without answering, so that
the question never rests (the very fault of the headbands that are replaced) —
and it then lives in the settings (Data tab), where any desktop app
met, REVERSIBLE, which it was not as long as the blindfold was the only way.

Leaving it only in the settings had been tried for an hour: no one there
would have gone, and the measure would have remained extinguished for everyone without this
or a choice. As long as no response is given, consent is worth `null`
and PostHog remains cookie- and identity-free — nothing is surreptitiously measured.

**A dialog box removes them, without anything moving.** They are native, and
no `z-index` passes in front: a dialogue kept them across its corner,
over his own veil. We therefore remove them - but the brand line keeps
their PLACE, frozen at what it was worth at the opening, and draws three pellets
identically inert
([app-sidebar.tsx](../components/app-sidebar.tsx), `WindowButtonDecoys`). They
go under the veil like the rest of the app. Without this lure, the brand would jump
from one end of the bar to the other each time a dialog is opened, for an object
that we don't even look at.

Their geometry is **noted on a pixel-decoded system screenshot by
pixel**, and not deducted: left edges at 19, 42 and 65, top at 22, **14 px from
diameter**, so 23 px from center to center. The first version included
the origin given to `trafficLightPosition` and an assumed step of 20 px — the only
of the three values which was correct was the origin, and the shift could be seen.

And the request **belongs to the page**: it dies with it. A reload
while a dialog is open otherwise leaves the buttons hidden forever,
with no one left to return them.

**And in full screen, we never hide them.** macOS takes them to the top of
the screen, under his own care; hiding them on top removes the only way to
exit with the mouse. The page must still learn it so as not to
keep their place - hence two distinct notions, what the bar DEMANDS and what
that the buttons DO, and a round trip over the bridge
([lib/use-window-buttons.ts](../lib/use-window-buttons.ts)).

**The only real pitfall is authentication.** minddy suggests Google and GitHub
([login-form.tsx](../components/auth/login-form.tsx)), and Google policy
is to **refuse OAuth from an embedded browser**: the “this browser or
app may not be secure. The MIN-290 probe qualified the fact without changing the
decision: in an ordinary `BrowserWindow` (user agent Chrome + `Electron/43`),
the Google identification screen **is displayed normally**, no refusal — we have not
not carried out the trick to the end with real identifiers. It is a detection
which we cannot control and which can tighten overnight; lean
above, it means making the connection dependent on a third-party policy. Falsify
the user agent to pass is fragile and against this policy. The path
correct is the same as all desktop apps:

1. the app asks for the authorization URL without navigating (`signInWithOAuth` with
   `skipBrowserRedirect`), and opens it with `shell.openExternal`;
2. system browser cycles around, returns to `/auth/callback`, which — **when
   the request comes from desktop** — redirects to `minddy://auth?code=…` instead of
   place a cookie;
3. the app receives the deep link (`app.setAsDefaultProtocolClient` + `open-url`, and
   `CFBundleURLTypes` in the Info.plist), and exchanges the code for a session
   in its own partition (`exchangeCodeForSession`, PKCE stream).

**This path is necessary anyway**, even without OAuth: a magic link
received by email opens in the default browser, never in Electron. So we
builds it once and all three entry paths use it. Only the
password login works without it.

What remained to check in a real window — ⌘K palette, clipboard,
image collage in tiptap, drag and drop, realtime in background — has been
verified: see §7.1. Nothing breaks; we need an application menu of our own.

**Built in MIN-291**, and two things to know before you touch it. The shell
lives in [desktop/](../desktop/README.md) and contains only cabling: the
decisions — navigation guard, deep link content, deck surface — live
in `lib/desktop/` and are tested there, because a folder that is not compiled
that with Electron installed cannot be installed after the deposit. And
**`minddy://` is not tested before packaging**: outside packaged apps,
`app.setAsDefaultProtocolClient` registered *Electron.app* with LaunchServices,
not our instance, and a `open minddy://…` therefore achieves nothing. It's
`CFBundleURLTypes` that settles it, and he arrives with the `.dmg` of MIN-292 — the
first real connection by external link is verified there.

---

## 3. Notifications: Web Push and APNs

MIN-291 used real time then `new Notification()` as the renderer
was turning. MIN-356 keeps this path as compatibility for an old shell,
but current versions register with APNs at launch. The token of
signed bundle goes through the Electron bridge, then through the authenticated web session,
and joins `push_subscriptions` with `transport = 'apns'`.

When inserting an inbox line, the server always constructs a single
wording. `sendPushToUser` then chooses VAPID for a browser or APNs
for the macOS app. APNs displays the alert when no minddy process is running; if
the app runs, `received-apns-notification` transforms it into a native banner and
its click opens the transported route. The realtime relay is then cut so as not to
do not display the same thing twice. The dock badge remains powered by the
real-time list: represents an exact state, not an APNs event.

What it opens on the other hand, and which does not exist on the web: clicking on a
notification wakes up the window on the correct ticket, the badge is an exact number,
and the global shortcut opens the palette without using the browser.

---

## 4. The local agent

This is the subject. Today, an agent's trick is played like this: the function creates a
microVM, writes `main.js` and `job.json`, launches `node main.js` detached, and returns the
main ([vm-launch.ts](../lib/server/agent/vm-launch.ts)). The VM clones the repository with
an ephemeral token, makes the model work, pushes a branch and opens a sweater
request, and reports to the control plan.

**What must change for this same trick to be played on a Mac: the launcher, and
three locks.** The rest — the loop, the tools, the ledger, the wire — does not move
almost none, and that’s what makes the project reasonable.

> ### ⚠ The toggle criterion has changed (MIN-363)
>
> This paragraph said *“the product is identical, only the machine changes”*,
> §4.3 repeated it in full (“This is the tipping point”), and MIN-293
> wore it as an acceptance criterion. **He is dead.** The audit of 2026-08-14
> measured it, and code written since has confirmed it. Leaving him there would be a trap
> for the next person who opens this file: he would cut lots on a promise
> which the filing already contradicts.
>
> **The criterion that replaces it:** *the local run renders the same WORK — same thread,
> same events, same ledger, same pull request — and the differences it carries are
> those in the list below, named, assumed, and said in the interface where
> the user encounters them.* A deviation that is not in this list is a
> default; a gap that is there but that the interface is silent is also a fault.
>
> | The gap | Why it is irreducible |
> | --- | --- |
> | **Live broadcast drops** | [`/api/agent-runs/[runId]/diff`](<../app/api/agent-runs/[runId]/diff/route.ts>) reads the **microVM** via RPC while the tower is running — this is the only place that knows what the agent just wrote. The backend has **no access** to the user's disk: on a local run, only the forge remains, so the work is **pushed**. During the tour, the diff view shows the state before; in the first round, it shows nothing (the branch does not exist yet). This is not a regression to be repaired, it is a consequence of the topology. |
> | **Type-check can shut up** | `detectTypeChecker` ([diagnostics.ts](../lib/server/agent/diagnostics.ts)) requires an `./node_modules/.bin/tsc` **executable** and returns `null` otherwise — without raising, by design. On a user repository whose dependencies are not installed, the release gate says nothing rather than saying "it compiles". A silence that feels like a green light. |
> | **The end of the turn changes shape** | In current repository mode (D2 of the audit, [current-repo.ts](../lib/server/agent/current-repo.ts)), we do not touch the index, nor the HEAD, nor the user tree: the commit is made in a disposable index, hooks to `refs/minddy/run/<id>/work` and leaves by sha. **No local branch is created**, `git add -A` no longer exists, and a file that the human edits at the same time as the agent is said to the thread instead of slicing. Same PR at the finish, different path. |
> | **The pull request becomes a gesture** | Decision D2bis-B, taken on 2026-08-15 upon seeing the first real local tour: **the tour commits nothing and pushes nothing**, its deliverable is the working tree. It pushed a branch at the end of each round — by sha, from a disposable index, therefore not found in the user's `git branch`. Opening a pull request remains possible and remains `create_pr`; it’s just not the end of a round anymore. |
> | **Containment no longer exists** | §4.4 below, and the audit §2 the figure: out of thirty commands targeting a non-repository file, **twenty only publish a `bash`** permission, which `command-guard` — which only targets git — lets pass. Opencode approvals are an accident proof, not a boundary. An “agent wants out of file” card plugged into `external_directory` alone would teach a false guarantee. |
>
> Two paragraphs in this section predate the final product decisions and no longer
> describe the product: **§4.3** assumes a dedicated worktree, while the current
> repository is now the default and the worktree is optional; **§4.5** assumes a
> mid-conversation cloud fallback, while the environment is now selected before
> the first turn and remains fixed. The paragraphs remain only as design history;
> the decisions in this note are authoritative.

### 4.1 Lock 1 — prove which run you are on

Today the VM does not carry **any** token: the Vercel Sandbox forwarde firewall
its requests by adding an OIDC signed by the platform, whose claim
`sandbox_name` is `agent-<run.id>`. The `runId` is therefore never read in the body
— it is *derived* — and a VM cannot claim anything other than its own run.
On a Mac, there is no firewall to sign anything.

**Decision: a run token, carried by the customer, and a second admission route
in the only road that depends on it.** The separation made in MIN-223 serves us
exactly there: `handleControlPlaneRequest` already takes `runId` **as a parameter
input** ; it's
[app/api/agent-vm/[...path]/route.ts](<../app/api/agent-vm/[...path]/route.ts>)
which derives it from the claim, and it is the only file to touch. An opaque token, drawn
at launch, stored on the `agent_runs` line (hashed), for the life of the round,
sent as `authorization` — and `handleControlPlaneRequest` sees no
difference.

**What we lose, and which must be written**: a token on a disk is stealable, a
Platform OIDC is not. The damage remains limited to *this run*, during *this
turn there* — but the invariant “the machine which executes carries no secrets” ceases
to be true, and the contrary should not be claimed elsewhere in the code.

### 4.2 Lock 2 — the model key

Same problem, one step higher. Today the loop sends a **placeholder**
in `authorization` and it is the firewall which sets the real key after exiting
the VM ([network-policy.ts](../lib/server/agent/network-policy.ts)); the local proxy
of opencode ([vm/llm-proxy.ts](../lib/server/agent/vm/llm-proxy.ts)) relays without anything
to hold. On a Mac, a real key must exist somewhere.

**Decision: the key per run at hard ceiling, that of
[run-key.ts](../lib/server/agent/run-key.ts) — it is already written.** A key
OpenRouter issued for this run, with `limit` in dollars and `expires_at`, held by the
supplier and not by our code. What the machine holds is then not *our*
key but a right to spend the budget for this run, which the user already has.
This is exactly the doctrine that `run-key.ts` states for the VM, applied to a
machine where the hypothesis of compromise is *stronger*.

**Consequence not to be missed**: `run-key.ts` **degrades voluntarily** when
`OPENROUTER_PROVISIONING_KEY` is missing — it falls on the platform key, without
ceiling. This degradation is reasonable in a disposable microVM; on the machine
from a user it is unacceptable. **On the local path, the absence of mint
must refuse the run**, not uncapped it. It's a line of code and it's the
kind of line you don't write if no one has said it.

The alternative — relay all completions through our backend, which would pose the
key — keeps the invariant intact but gives us a just-in-time proxy over the entire
of the traffic of a run, with its latency, its bill and a function duration to
monitor. We don't take it; we note it as a fallback if the mint becomes
unavailable.

### 4.3 Lock 3 — what repository, and where

Three possible shapes, and the choice is not cosmetic.

- **In your working copy.** No. The agent would write there while you work there,
  on your branch, in your index finger.
- **A fresh clone in the app folder.** Safe, but it throws precisely what
  what we came for: your toolchain, your caches, your `node_modules`.
- **A `git worktree` managed by minddy** (`~/Library/Application Support/minddy/…`).
  Same git objects, separate branch, separate index: the agent can't walk you
  on it, and the machine remains yours. **That's the one.**

Two consequences that the worktree does not resolve, and which must be addressed:

1. **`node_modules` is not shared** between worktrees. The first round pays a
   installation — like microVM today, so not a regression, but not
   the gain we imagine. The real gain is in the *second* round: the worktree,
   survives.
2. **Unversioned files are missing** — `.env`, `.env.local`. But “the
   dev server starts and the tests see the real variables" is one of the
   local arguments. It is therefore necessary to make an adjustment **explicit and per project**: the
   list of ignored files to copy into the worktree. Explicit, because
   copying secrets into a directory where a model runs the shell is a
   decision, not a fault.

The round ends with a push and a pull request, with a fresh forge token
requested from the control plane (`/repo-auth`): **it is the work rendered which is the
same** — same thread, same events, same PR. The PATH is not the same, and
it is the rewritten criterion at the top of §4 which says it: no live diff during
the turn, a type-check which can be silent, and an end of turn which, in deposit mode
current, no longer goes through the index or a local branch.

### 4.4 What we lose: confinement

It must be written in full, because all the security reasoning of
the agent rests on it. Today, the accepted doctrine is *“the microVM is
compromised by hypothesis »*: the model executes arbitrary shell there, and it is
without consequence because the VM is disposable, without secrets, and it dies when
end of the round. **On your Mac, none of these three sentences are true.** The model has
access to your SSH keys, your tokens, your other repositories, your keychain.

This is not prohibitive — this is what you already accept by launching a
code locally — but this is not implied:

- **explicit opt-in, per project**, with a screen that says what this allows, and
  never a fault;
- [command-guard.ts](../lib/server/agent/command-guard.ts) and
  [repo-path.ts](../lib/server/agent/repo-path.ts) still applies, but
  we must stop describing them as “comfort”: on the local path, they are
  the only remaining safeguards;
- **the network policy no longer applies at all.** It is a property of the
  Vercel firewall, not harness.

A hardening path, to be explored later and not in v1: launch the process
under a *seatbelt* macOS profile (`sandbox-exec`) restricting writing to
worktree. This is what Chrome and serious code brokers do; the API is
formally depreciated but very much alive.

### 4.5 How a run arrives on your machine

> **The launcher has existed since MIN-293, and its form is not as described above
> bottom.** This paragraph remains for its reasoning; what was built holds
> in one invariant and three surfaces.
>
> **The invariant: the server owns everything relating to RUN, the machine
> has everything related to the DISK.** The server does not know any path to
> this computer — a home path means nothing elsewhere, and put it aside
> base would publish it, falsely, to all members of the project. The machine does not
> produces no run field. The contract that connects them is a `VmJob` **amputated
> its `layout`**, that is to say the only field that talks about disk
> ([lib/desktop/local-turn.ts](../lib/desktop/local-turn.ts)).
>
> **And a rule that results from this, simpler than any arbitration: the
> machine only speaks to the origin which gave it its work.** The manifesto of
> harness, its bytes, assignment and control plane all come from
> the origin of the active channel, or none. This is what prevents a typo from
> preview of playing a trick with the production harness — the typical contract
> would diverge silently — and that’s also what makes development work
> against `localhost`.
>
> | Area | What she does |
> | --- | --- |
> | `GET /api/desktop/harness` | the manifest: footprint, size, protocol version, opencode version. Requested **each** round, two hundred bytes. |
> | `GET /api/desktop/harness/bundle` | the bytes, when the fingerprint has changed. One file per fingerprint under `userData/harness/`. |
> | `POST /api/desktop/local-turn` | the clone pull (MIN-371): select from its attached projects, admit, claim, prepare, set up the lease, return the assignment. The old call by identifier remains compatible. |
>
> Since MIN-371, the clone calls this surface in the background with its session
> and the only identifiers of its attached projects. He rereads the list each time
> passage, does not pass any path and plays the assignment with the launcher already in
> place. The renderer is no longer in the loop: a phone can send the
> next message, the run returns to the queue and the clone requests it.
>
> Three differences with what follows, and each comes from a decision made
> since: **the cloud fallback does not exist during the conversation** (D1:
> the environment is chosen before the first round); **presence is not a
> heartbeat** but a sweater with lease, a machine which no longer demands no longer being
> there (§5); and **the drain never takes a local run** — otherwise the user
> asks for his machine, gets the cloud, and nothing tells him.

The launcher is the only truly new piece.

- The desktop app **announces its presence** (one heartbeat per user, on the
  real-time bridge already in place), saying what projects it has locally.
- On launch, [launch.ts](../lib/server/agent/launch.ts) looks at a preference
  of project (“execute on my machine”) **and** a living presence. If both
  are there, it does not create a sandbox: it leaves the run waiting and broadcasts it
  on his topic.
- The app takes it, writes `job.json`, and launches the bundle.
- **No presence within a few seconds → fallback to the cloud**, and the wire
  says it. A run that remains pending because a Mac is asleep is a run
  lost; a run that switches to the cloud by saying it is a run.

Two details that seem small:

**The bundle is downloaded per turn, it is not embedded in the app.** The contract
between the harness and the control plane is typed and it moves
([protocol.ts](../lib/server/agent/vm/protocol.ts)): an app installed two years ago
month should not play tricks with a two-month harness. Like the function
writes it in the VM, the app retrieves it from the deployment — this is what keeps the
thin shell (§1) and the contract checked by the compiler.

**Electron embeds Node**, so nothing to install on the user side for that
(`utilityProcess.fork`, or a fork with `ELECTRON_RUN_AS_NODE`). Minddy embarks
also the npm CLI — absent from Electron — and exposes backed `node`/`npm` shims
in the signed runtime. The harness uses them to boot or repair its OpenCode
pinned, and the agent can then install the repository dependencies even without
System Node string. The `PATH` of the user shell remains priority when it
is already configured. The Electron Node corresponds to the `node24` target of the bundle.
OpenCode version is a shared constant
([opencode-version.ts](../lib/server/agent/vm/opencode-version.ts)), written for
have exactly this kind of second drive.

---

## 5. Distribute on macOS

> **Built in MIN-292.** Everything this paragraph describes is hardwired:
> [desktop/electron-builder.yml](../desktop/electron-builder.yml) door
> bundle identity, hardened runtime and notarization;
> [desktop/src/updater.ts](../desktop/src/updater.ts) updates;
> [scripts/publish-desktop.mjs](../scripts/publish-desktop.mjs) the publication of
> flow; `/download` the page. Only the gestures that demand an account remain
> Apple, and they have their way in the internal signing procedure.
>
> One thing that this framing had not said, and which matters: **the IDENTITY of
> the app arrives here and nowhere before**. As long as we launched from the depot,
> macOS read the `Info.plist` from `Electron.app` — Electron icon in the dock,
> “Electron” in the menu bar, and a `minddy://` which did not reach
> no one because LaunchServices was registering Electron.app. This is the bundle that
> speaks, not code.

Nothing here is optional: outside the App Store, macOS refuses to launch an app not
notarized, and the message it displays scares people away.

- **Apple Developer Program: $99/year.** *Developer ID Application* certificate,
  *hardened runtime* activated, signature, then notarization (`notarytool`) and
  stapling the ticket. It's mechanical once plugged in, and that's another secret
  in CI.
- **Updates**: `electron-updater`, with a stream served from storage
  any (a blob is enough). Squirrel.Mac **requires** a signed app: signature
  is not just a first launch formality, it is what allows
  the app to update afterwards.
- **Weight**: around 100 MB, Chromium included — to display a site that
  Safari already displays. This is the price of §4, not that of §2.
- **Maintenance**: one Electron major every 8 weeks, three majors
  supported — approximately six months before a version stops receiving support
  security fixes. A binary that embeds Chromium and lives in people does not
  does not allow itself to freeze.
- **No App Store.** Apple rejects thin web wrappers, and App Sandbox
  would specifically prohibit §4. Direct distribution, from a `.dmg` linked to the
  landing.

---

## 6. What this framing puts outside the perimeter

- **All offline mode and all local data.** The ticket says so and that's it
  good decision: the service worker deliberately has no `fetch` handler
  ([public/sw.js](../public/sw.js)), and giving it one would make us
  responsible for what is displayed.
- **Windows and Linux.** To reopen when a user requests it, not before.
- **APNS.** See §3.
- **The App Store.** See §5.

---

## 7. What this framing did not do

Four things are written in the conditional because they were not measured.
None calls into question the management; all must fall before the lot
corresponding.

1. ~~**What breaks in a real window.**~~ **Measured (MIN-290), and the answer
   is: nothing.** A throwaway shell on Electron 43.4.0 loaded
   `https://www.minddy.app` to `sandbox: true` / `contextIsolation: true`,
   connected by password. Work as is: ⌘K and ⌘P (the menu by
   default carries 19 accelerators, none touch ⌘K, ⌘P nor ⌘ ;) ; the
   clipboard in both directions, permissions already granted; the collage
   an image from the system clipboard in tiptap, uploaded and inserted; the
   deposit of a real file on the editor (`Input.dispatchDragEvent`), uploaded
   and inserted at the point of release; `new Notification()` from the renderer, without
   request for permission; the session, which persists in the partition.
   **Realtime survives in the background**: hidden window 7 minutes, the
   WebSocket Supabase remains open and the beat keeps its rhythm (~2/min),
   with `backgroundThrottling` to `true` as well as `false` — no need to cut it.
   What remains to be done, and it's work, not a risk: **a menu
   application to us**, because the default menu gives ⌘W to “close the
   window” and ⌘R to “reload”, two gestures that an app should not offer
   on an authenticated SPA.
   Two honest caveats: seven minutes is not a night, and the keyboard has
   was injected by Chromium on part of the tests — menu arbitration
   native, it was read in the menu rather than struck.
2. **The real gain of the local.** Nobody has quantified what the trick gains from turning
   on a Mac rather than in `iad1`. The backrest does not rest on it (it rests
   on *“the agent sees your machine”*), but you should not reserve a number
   which we don't have.
3. ~~**Electron Node against the bundle target.**~~ **Measured (MIN-290):**
   Electron 43.4.0 ships **Node 24.18.1** — the `node24` target of the bundle,
   line for line.
4. **Installation of opencode on a machine without npm.** Today the VM does
   `npm i opencode-ai` in ~10.6 s; on a user machine, one must decide
   if we depend on npm or if we download the pinned release.
