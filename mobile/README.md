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

The web side is covered by the root suite:

```bash
npx vitest run lib/mobile components/billing/purchases-hidden.test.tsx
```

After adding a Capacitor plugin, run `npm --prefix mobile run sync` and commit
the updated `ios/App/CapApp-SPM/Package.swift`.

## What is not done here yet

- Signing, TestFlight and the App Store release workflow.
- Sign in with Apple.
- Email links (confirmation, password reset) open in Safari, not in the app,
  until universal links exist.
- Native push notifications, the share extension and universal links.
- The Android project.
