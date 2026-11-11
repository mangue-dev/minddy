# Minddy's mobile shell

A native app around the minddy web app, built with [Capacitor](https://capacitorjs.com).
One WebView loads the product from minddy Cloud or from a self-hosted server the
person selects, like the desktop app. The product interface always comes from
that server, so shipping a minddy feature does not require a new binary.

iOS comes first. The Android project will be added to this folder once the iOS
app is accepted (MIN-907).

## What lives here, and what does not

This folder holds the native project and its configuration. The web side of the
shell lives with the rest of the web app:

| | |
| --- | --- |
| `capacitor.config.ts` | app id, name, and the folder of bundled pages |
| `ios/App/App/MinddyViewController.swift` | the WebView on the selected server, the navigation guard, the launch cover, the keyboard without its form bar, and its reports of the keyboard's movements |
| `ios/App/App/NavigationBar.swift` | the bottom bar, drawn natively in Liquid Glass |
| `ios/App/App/MinddyShellPlugin.swift` | the shell's own plugin, `MinddyShell` in JavaScript |
| `ios/App/App/ServerStore.swift` | the selected server and the rules for a server address |
| `ios/App/App/AppNavigator.swift`, `UniversalLink.swift` | the pages a notification or a universal link opens, and which links stay in the browser |
| `ios/App/App/App.entitlements` | the capabilities: Sign in with Apple, push, and the associated domains of universal links |
| `ios/Tests/` | the runner of `test:ios` |
| `ios/App/App/Info.plist` | minddy Cloud's origin and the camera, photo and microphone usage texts |
| `ios/App/CapApp-SPM/` | the Swift package Capacitor generates; committed, never edited by hand |
| `lib/mobile/bridge.ts` (outside) | the contract of `MinddyShell` and the detection the web app uses |
| `lib/mobile/native-navigation.ts` (outside) | tells the shell where the web bar is, what it holds and whether it is covered |
| `components/mobile/` (outside) | the pages bundled in the app: server choice and offline screen |
| `scripts/build-mobile.mjs` (outside) | bundles those pages into `www/` |

`www/` and `ios/App/App/public/` are generated and ignored by Git.

## How the app picks its server

The app starts on minddy Cloud, whose origin is `MinddyCloudOrigin` in
`Info.plist`. **Self-host minddy**, under the sign-in forms, opens the bundled
server-choice page. The address entered there is stored in the app's user
defaults and loaded from the next launch on.

The rules are the desktop app's: an origin only, HTTPS for remote servers, HTTP
for `localhost` and loopback addresses alone.

Three properties protect that choice:

- Only the pages bundled in the app may change the server. `connect` and
  `useCloud` reject a call from a page served by any server, minddy Cloud
  included.
- The WebView stays on the selected origin, compared by scheme, host and port.
  A main-frame navigation to another site opens in the browser.
- A page that fails to load shows the bundled offline screen, which retries
  when the network comes back.

Detection on the web side reads the object Capacitor injects
(`isNativeMobile()` in `lib/mobile/bridge.ts`). The `minddy-mobile/<version>`
user-agent suffix is for server logs and device labels only.

## The native bottom bar

The web app keeps its bottom bar in the page, invisible, and stays the owner of
what each button does. `lib/mobile/native-navigation.ts` reports the bar's
place, its buttons and their badges to the shell, which draws a Liquid Glass
capsule exactly over it (`NavigationBar.swift`). A tap on the native bar clicks
the web button of the same slot.

A native view sits above the whole page, so the shell must know when a sheet or
a dialog hides the bar. The page asks the browser what is on top at the bar's
centre: when it is not the bar, the native one hides. No overlay has to
register itself. The keyboard is the exception: it lives in a window above the
app, so the bar stays at the foot of the screen under it, and the keyboard
uncovers it as it leaves, as it does a native tab bar.

The icons are the web bar's own. iOS cannot render SVG markup at run time, so
the page draws each icon into a small PNG once and sends it with the buttons;
the shell tints it. A slot whose icon could not be drawn falls back to an SF
Symbol listed in `NavigationBar.swift`. Before iOS 26 the capsule uses a blur
material.

When the page slides aside for the sidebar, the bar slides with it and leaves
by the edge of the screen. The page reports the bar's place on every frame of
the gesture, and a tap on the bar then closes the sidebar, as a tap on the
page does.

The shell also reports the radius of the screen's corners (`cornerRadius` in
`state()`), published to the page as `--device-corner-radius`. The page set
aside for the sidebar takes that radius, and the bottom sheets about six
tenths of it, as native sheets do. UIKit has no public reading of the value:
`MinddyViewController.screenCornerRadius` asks the screen for a private key
and answers 0 when the screen does not know it, in which case the page keeps
its own defaults.

The history swipe of the WebView is off: the swipe from the left edge belongs
to the product, which opens its sidebar with it.

The product's theme may differ from the system's. `setAppearance` passes it to
the shell so the status bar and the glass follow the product.

## The keyboard

WebKit tells the page about the keyboard only once it has stopped moving
(`visualViewport`). The shell reports each movement as it starts instead: the
height the keyboard will cover at the bottom of the WebView, 0 when it leaves,
and the movement's duration (the `keyboard` event of `MinddyShell`).
`lib/use-mobile-layout.ts` lays the page out for that height at once, and what
makes room for the keyboard (the page, the sheets, the editor's strip) moves
over the same duration on the keyboard's curve. A field that loses the focus
counts as the keyboard leaving, a few frames before the shell's report arrives.

WebKit's own handling of the keyboard is off, as in the `none` mode of
Capacitor's keyboard plugin: the WebView no longer shrinks its visual viewport
or scrolls to reveal a field, and while the keyboard is up the page's scroll
moves only under a finger. Each of those moves was a jump on top of the page's
own movement.

A field the page focuses by itself raises the keyboard, as in a native app:
WebKit asks its UI delegate before showing the keyboard for a focus that no tap
gave, and the shell answers yes (`letFocusRaiseKeyboard`). The page focuses a
field on its own only where a tap asked for one (Reply, opening Numo).

## Signing in with Google and GitHub

Google refuses OAuth inside a WebView, so the provider's pages open in the
system's sign-in sheet (`ASWebAuthenticationSession`) through the plugin's
`authenticate` method. The round is the desktop app's: the page asks Supabase
for the provider URL with a `redirectTo` that carries the `desktop` flag and a
turn nonce, `/auth/callback` answers with `minddy://auth?code=…&turn=…` without
using the code, and the sheet catches that URL and gives it back to the page.
The page checks the nonce and exchanges the code itself, because the PKCE
verifier stays in the WebView's storage (`lib/mobile/auth-session.ts`).

The `minddy` scheme is not registered with iOS: only the open sheet can catch
it. iOS names the app in the sheet's prompt from `CFBundleName`, so that key
holds `minddy` rather than the target name.

## Signing in with Apple

App Review asks for Sign in with Apple next to Google and GitHub (guideline
4.8). In the app it is native: the plugin's `signInWithApple` method shows
Apple's sheet (`App/AppleSignIn.swift`), with a random nonce whose SHA-256 goes
to Apple. The page gets the identity token and the raw nonce and opens its
session with `signInWithIdToken` (`lib/apple-sign-in.ts`); no browser round is
involved. Apple gives the person's name on the first authorization only: it
becomes the account's display name when the account has none. The target's
`App.entitlements` carries the Sign in with Apple capability of
`app.minddy.ios`.

The web and the desktop app use the same provider through OAuth, with the
Services ID `app.minddy.web`. In Supabase's Apple provider, **Client IDs** lists
`app.minddy.web,app.minddy.ios` in that order, since the OAuth round uses the
first one. Its **Secret Key** is a JWT signed with the Sign in with Apple key
(Key ID `NAC8NXN6Q5`, not the APNs key) for `app.minddy.web`, valid six months
at most: the current one, set on preview and production on 11 November 2026,
expires on **10 May 2027**. Generate the next one from the same key before then.

Deleting an account revokes its Apple authorization (guideline 5.1.1(v)).
Supabase keeps no provider token, so the server keeps one in
`apple_sign_in_tokens`: it exchanges the app's one-time authorization code, or
checks the refresh token a web round returns, and seals it with the user's key
(`lib/server/apple-sign-in.ts`). This needs the optional `APPLE_SIGN_IN_*`
variables of `.env.example`; without them nothing is kept or revoked.

A person can hide their address from minddy: Apple then gives a
`@privaterelay.appleid.com` address that forwards to theirs, but only mail
from sources registered with Apple. Under **Certificates, Identifiers &
Profiles → Services → Sign in with Apple for Email Communication**, the team
registers `minddy.app` and `mail.minddy.app` (the From domains, which pass
DKIM) and `send.minddy.app` and `send.mail.minddy.app` (Resend's bounce
domains, which pass SPF). Apple shows `mail.minddy.app` failing SPF, which is
expected: it is never a bounce domain. Mail from any other sender, a new
Resend domain included, bounces until it is registered there.

## Push notifications

The app receives the same notifications as the web and the macOS app, through
APNs. The page asks for the permission from the switch in the notification
settings, never at launch: the plugin's `registerForPushNotifications`
(`App/PushNotifications.swift`) shows iOS's prompt only when called with
`activate`, and renews an allowed token otherwise. The token goes to the
server with its app (`ios`) and its gateway: `sandbox` when the signing
profile in the bundle says `aps-environment` is `development`, `production`
for TestFlight and App Store builds, which carry no profile. The server keeps
both in `push_subscriptions` and sends to the matching gateway with the iOS
app's topic (`lib/server/push/apns.ts`). The macOS app's APNs key is
team-scoped and serves both apps.

A notification carries the path of what it is about. A tap opens it on the
selected server; when the tap launched the app, that path replaces the entry
page. While the app is in front, notifications still show as banners.

## Universal links

A link to minddy Cloud tapped in Mail, Messages or Notes opens the app on that
page rather than Safari, whether the app was running or not. iOS decides from
two lists:

- the domains in `App.entitlements` (`com.apple.developer.associated-domains`):
  `www.minddy.app`, and `preview.minddy.app` in developer mode;
- the paths each domain serves in `/.well-known/apple-app-site-association`
  (`app/.well-known/apple-app-site-association/route.ts`). They are written in
  `lib/apple-app-site-association.ts`: the product's screens, from
  `lib/protected-prefixes.ts`, and the e-mail links that sign someone in
  (sign-up confirmation and password reset on `/auth/callback?token_hash=…`,
  invitations on `/signup?invite=…`). Billing, OAuth consent, the desktop
  app's sign-in rounds, the public site, the manual, `/api` and the public
  share links stay in the browser; the module gives the reason for each.

The apex `minddy.app` is not declared: Vercel answers it with a 308 to `www`
for every path, and Apple does not follow a redirect for this file. Links the
product writes all use `www`.

`SceneDelegate` receives the link, at launch in its connection options and
later through `scene(_:continue:)`, and `AppNavigator` opens it the way it opens
a tapped notification: in the WebView when the app is running, in place of the
entry page when the link launched it. The domain list is compiled into the app,
so a self-hosted server's links never open it. A link whose origin is not the
selected server's, a minddy Cloud link while the app is on a self-hosted
server, opens in Safari (`UniversalLink.swift`): the WebView keeps to the
selected server.

An e-mail link opened in the app keeps the token in a cookie of the WebView,
and the session opens there after the tap on `/auth/confirm`, as in a browser
(`lib/auth-otp-pending.ts`).

To test a branch, deploy it to a fixed Vercel alias and add
`applinks:<alias>?mode=developer` to `App.entitlements` for the device build
only. A developer-mode domain is fetched by the device itself rather than
through Apple's CDN, and needs **Settings → Developer → Associated Domains
Development** on the iPhone. **Settings → Developer → Universal Links →
Diagnostics** tells whether a URL would open the app.

## Nothing is sold in the app

Subscriptions are bought on the web. Inside the app, `usePurchasesHidden()`
(`lib/native-app.ts`) removes every way to a purchase: the billing page, plan
cards, upgrade buttons and links to plans. A feature the plan lacks says so and
stops there. `components/billing/purchases-hidden.test.tsx` holds that rule;
extend it when a new surface links to billing.

## Develop

Requirements: macOS, Xcode with an iOS simulator, Node.js 24.

```bash
npm --prefix mobile install     # once
npm --prefix mobile run sync    # bundle the pages and copy them into the iOS project
npm --prefix mobile run open:ios
```

Run the app from Xcode. To build without opening Xcode:

```bash
npm --prefix mobile run build:ios
```

A debug build loads the server named by `MINDDY_MOBILE_ORIGIN` in place of
minddy Cloud, which is how a local `npm run dev` is opened in the simulator:

```bash
SIMCTL_CHILD_MINDDY_MOBILE_ORIGIN=http://localhost:3000 xcrun simctl launch booted app.minddy.ios
```

Release builds ignore the variable.

## Checks

The root TypeScript configuration excludes this folder. CI installs its
lockfile, runs `npm --prefix mobile run typecheck`, bundles the pages and runs
`npx cap sync ios`, then fails if the committed Swift package manifest changed.
The iOS build itself needs macOS and does not run in CI yet.

The shell's decisions that need no UIKit (the server address rules, where a
universal link goes) have their own runner, which compiles them with `swiftc`
outside Xcode, on macOS only:

```bash
npm --prefix mobile run test:ios
```

The web side is covered by the root suite:

```bash
npx vitest run lib/mobile lib/apple-app-site-association.test.ts components/billing/purchases-hidden.test.tsx
```

After adding a Capacitor plugin, run `npm --prefix mobile run sync` and commit
the updated `ios/App/CapApp-SPM/Package.swift`.

## What is not done here yet

- Signing, TestFlight and the App Store release workflow.
- The Android project.
