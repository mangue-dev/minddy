# Minddy's desktop shell

A single product window loads minddy Cloud or a server selected by the person
using the app. The product interface always comes from that server, so delivering
a minddy feature does not require re-signing a binary. The shell owns one small
local form for selecting the origin; it contains no product UI.

Complete framework: [docs/desktop-electron.md](../docs/desktop-electron.md) §2 and
§3. Ticket: MIN-291.

## What lives here, and what does not live there

This folder contains only **Electron wiring**. Any decision — where the
window has the right to navigate, which a deep link carries
authentication, what the bridge exposes — lives in `lib/desktop/`, on the
deposit, and is tested there by `npx vitest run lib/desktop`.

This is not storage: it is what allows the navigation guard to have
a test, and the contract between the server (`app/auth/callback`) and the main process
to be checked back and forth rather than reread twice separately.

| | |
| --- | --- |
| `src/main.ts` | window, navigation guard, `minddy://`, dock badge, IPC |
| `src/channel-store.ts` | rewrites a retired preview channel in `userData/channel.json` to stable |
| `src/server-store.ts` | the selected self-hosted origin (`userData/server.json`) |
| `src/server-picker.ts` | the isolated server form and its validation bridge |
| `src/local-runtime.ts` | the selected local clone and its owned Supabase + minddy process |
| `src/preload.ts` | **entire** surface area exposed to the page (8 members) |
| `src/menu.ts` | the application menu — it is mainly used to REMOVE ⌘W and ⌘R |
| `src/updater.ts` | updates, and the frank renunciation outside the packaged app |
| `electron-builder.yml` | **app identity**: name, icon, `minddy://`, signature |
| `build/` | the `.icns` icon and entitlements — sources, not artifacts |
| `lib/desktop/*` (out of here) | decisions, pure and tested |

## Develop

```bash
npm --prefix desktop install   # once — Electron is not a web dependency
npm --prefix desktop start     # esbuild build + launch the window
```

**From the VS Code integrated terminal, it fails** on a
`MODULE_NOT_FOUND: electron` which has nothing to do with the installation: VS Code
exports `ELECTRON_RUN_AS_NODE=1` (it itself is an Electron app), and our
binary then starts as a simple Node, without the `electron` module. A
Ordinary terminal doesn't have the problem; in that of VS Code:

```bash
env -u ELECTRON_RUN_AS_NODE npm --prefix desktop start
```

`npm run typecheck` from this folder checks the shell against Electron's types.
The root configuration excludes this folder from discovery, but desktop
regression tests import shell modules, so the root typecheck also needs the
desktop dependencies. CI installs both lockfiles with
`npm --prefix desktop ci --ignore-scripts` for the shell: its tests use native
API mocks and do not need the Electron binary or dependency installation scripts.
The validation job runs both the root and desktop typechecks. Local native
probes require the regular desktop installation shown above.

To work against a local server rather than production without changing the
stored server choice:

```bash
MINDDY_DESKTOP_ORIGIN=http://localhost:3000 npm start
```

The variable only exists for development. A packaged app ignores it. Installed
users choose a source from the native **minddy > Connect to a Server…** menu;
Windows and Linux users press **Alt** first because the menu bar is hidden by
default. Remote origins must use HTTPS, while HTTP is accepted only for loopback
and private-network IP addresses. This flow works on macOS, Windows, and Linux,
including **Run local minddy on this computer** for a local clone folder.

## Verify startup and recovery

Run the desktop and session regression tests from the repository root:

```bash
npm test -- lib/desktop components/desktop-auth-bridge.test.tsx lib/auth-context.test.tsx lib/client-session-renewal.test.ts lib/server/api-auth-cookie-refresh.test.ts lib/use-desktop-notifications.test.ts
npm --prefix desktop run typecheck
npm --prefix desktop run build
node scripts/desktop-startup.integration.mjs
node scripts/desktop-renderer-hang.integration.mjs
node scripts/desktop-notification-lifecycle.integration.mjs
node scripts/desktop-native-failures.integration.mjs
```

The native probes require a graphical desktop session and launch real Electron
processes with disposable profiles and a local fixture server. The startup probe
checks delayed authentication subscriptions, cookie persistence across complete
app exits, and a rotated cookie on the next process's first request. It does not
contact Supabase or authenticate a real account; the session regression tests
exercise SDK refresh failures and API response cookies separately. The hang probe blocks a renderer and
checks the native recovery prompt and local recovery document. Both probes remove
their temporary profiles when they finish. The notification lifecycle probe runs
the actual main process and server-picker preload against two local servers,
using synthetic native banners. It checks delayed banner callbacks, replacement
registrations, and server-switch routing without displaying OS notifications or
contacting APNs/WNS.
The native failure probe injects missing browser handlers and, on macOS, rejected
microphone permission requests and Settings dialogs. It checks that the actual
main-process callbacks settle without unhandled rejections and that a later
browser launch still works, without opening a browser, Settings or microphone.

## Packaging downloader

`package.json` pins `app-builder-lib`'s `@electron/get` dependency to 5.1.0.
The older downloader pulls in `http-cache-semantics`, which has an unpatched
high-severity advisory (GHSA-ch52-4w7c-c8xp). The override uses the same downloader
as Electron itself and requires Node 22.12 or later; release workflows use Node 24.
Downloads retain checksum verification and cache reuse. Version 5 uses Fetch:
Got-specific `agent`, `timeout`, and `https` options are not supported. Any custom
download configuration must use Fetch options, such as `signal` for timeouts.
Remove the override when electron-builder adopts this downloader upstream.

## The selected server

The server picker stores one normalized origin in `userData/server.json` before
loading it. A new selection opens `/signup`; later launches open `/home` as
usual. Cookies are not copied between cloud and self-hosted origins.

Choosing **Use minddy Cloud** removes the custom selection and returns to
`www.minddy.app`.

If the selected server cannot load, the shell replaces Chromium's network error
with a local recovery screen. It names the configured server, preserves the
failed route for **Try again**, and opens the server picker from **Check server
settings**. The message refers to server availability and configuration, never
to Internet access, because a valid minddy server can live on localhost or a
private network.

The unavailable screen and server picker share a small offline-safe design
layer in `lib/desktop/shell-ui.ts`. It mirrors minddy's light and dark tokens,
official SVG brandmark, pill buttons, inputs, and focus treatment. The packaged
shell also carries the same Inter Latin subset as the site; these local surfaces
must never depend on an asset served by the selected origin.

## minddy Cloud, and the retired preview channel

When minddy Cloud is selected, the shell loads `www.minddy.app`, the Vercel
Production deployment for the SHA referenced by `production`.

Earlier versions also offered a **preview channel** (MIN-352) that loaded
`preview.minddy.app`, with a toggle in the application menu and in account
settings, and copied the session cookies between the two origins (MIN-353).
Since MIN-740 preview has its own database, so its accounts, projects and
tickets differ from production: the toggle led people to a sign-in screen for an
account that does not exist there, and the copied cookies were never read
because the two Supabase projects use different cookie names. MIN-765 removed
the toggle, the bridge member and the session carry. See
[database environments](../docs/database-environments.md).

Installations that had switched still have `"preview"` in
`userData/channel.json`. At startup, before the window loads,
`src/channel-store.ts` rewrites it to `"stable"`; the window never reads the
file otherwise. The decision lives in
[lib/desktop/channel.ts](../lib/desktop/channel.ts), tested.

To try preview in the desktop shell, start a development shell with
`MINDDY_DESKTOP_ORIGIN=https://preview.minddy.app`. The override wins over
minddy Cloud; there is no hidden toggle.

The native application menu is the reference surface for server, update, and
diagnostic controls. Unlike a settings screen served by the selected origin, the
menu remains available when that origin does not load. On Windows and Linux it
is hidden by default and can be revealed with **Alt**; macOS keeps its normal
global menu.

## Authentication, in one sentence

Google refuses OAuth from an embedded browser, and a magic link opens
anyway in the default browser. So: the app asks for the URL without
navigate, opens it with `shell.openExternal`, `/auth/callback` **transmits** the code
(or the `token_hash`) to `minddy://auth?…` instead of setting a cookie, and that's
the app that opens the session. One path, three entrances.

**A prerequisite on the Supabase side**: the “Redirect URLs” allowlist of the project must
accept the callback **with its query** — `https://www.minddy.app/auth/callback?**`
(or an equivalent reason). Otherwise GoTrue refuses the marked `redirectTo`
`desktop=1`, falls back to the Site URL, and the round ends in the browser at
instead of returning to the app. This is a dashboard adjustment, it is not
in the deposit.

## Package (MIN-292)

```bash
npm --prefix desktop run pack   # an unsigned .app in desktop/release/mac-*/
npm --prefix desktop run dist   # signed and notarized .dmg and .zip files
npm --prefix desktop run dist:linux # AppImage, DEB, and RPM artifacts
npm --prefix desktop run dist:win:store  # x64 and ARM64 Store MSIX packages
```

The Linux reference download is the AppImage. Its x64 and ARM64 update feeds
are signed with a project GPG key; the DEB and RPM packages carry the same
detached signatures but are intentionally updated through the next verified
package rather than by the in-app updater. See
[docs/linux-desktop.md](../docs/linux-desktop.md) for the release,
verification, XDG, deep-link, and local-runtime contracts.

Microsoft Store is the exclusive Windows distribution path and owns signing
plus updates for the submitted MSIX packages. The shell never initializes
electron-updater on Windows. A packaged C++/WinRT helper checks Store update
availability at startup and every six hours; the sidebar opens the product page
when an update is available. The complete Partner Center and clean installation procedure is in
[docs/desktop-release.md](../docs/desktop-release.md#windows-microsoft-store).

**The icon no longer has its own step.** Its source is `build/icon.icon`, the folder
rendered by Icon Composer: we open it, we save it, and the build following the
resumes. electron-builder calls `actool` on it and places the TWO icons that
macOS waits from Tahoe — `Assets.car` + `CFBundleIconName` for macOS 26 and
beyond (glass, dark, tinted), and a `icon.icns` derived from the same output for
earlier versions. **This requires Xcode 26 or higher** on the build machine:
below, `actool` causes manufacturing to fail, by saying so.

**The app identity lives in [electron-builder.yml](electron-builder.yml), and
nowhere in the code.** The name under the icon, that of the menu bar,
icon, `CFBundleIdentifier` and pattern `minddy://` are read into
the `Info.plist` of the bundle: none of this is corrected at runtime. It's
also what makes the authentication deep link testable — outside the bundle,
LaunchServices registers `Electron.app`, not us.

`app.setName("minddy")` (main.ts) does not duplicate: it names it
DATA folder (`~/Library/Application Support/minddy/`), and it had to be
installed before there were any facilities.

### Push APNs (MIN-356)

The `app.minddy.desktop` bundle carries the Push Notifications capability and
`com.apple.developer.aps-environment=production`. The profile/certificate used
to sign must therefore authorize this capability; a development build
unpackaged intentionally does not attempt to register.

The server provider uses a token-based APNs key `.p8`. Ask
`APNS_TEAM_ID`, `APNS_KEY_ID` and `APNS_PRIVATE_KEY` in the site environment
(`APNS_BUNDLE_ID` remains optional until the bundle identifier changes
not). The private key never goes into the app. A complete delivery of MIN-356
therefore requires the three pieces together: Supabase migration, server variables,
then signed/notarized binary republished. Without server configuration, the inbox remains
functional but APNs is a no-op. Windows and Linux use the validated native banner
relay while the desktop process is running or hidden; background delivery belongs
to their platform-specific transports.

**The `.zip` accompanies the `.dmg` and is not decorative**: the `.dmg` is used to
first download, Squirrel.Mac can only read `.zip`. Publish one
without the other gives an app that installs and never updates, without anything
say. And Squirrel **requires a signed app** — hence the refusal to
`scripts/publish-desktop.mjs` in front of an unsigned bundle.

**When should you republish?** Almost never — the app is a window into the site,
so `npm run deploy` is enough to change what it displays. The deployment says so
all by itself: it compares a fingerprint of what REALLY goes into the binary
(the list overflows from this folder: `lib/public-routes.ts` is one of them) at the
last post saved in `released.json`. `npm run desktop:check`
gives the same response to the request.

The two steps:
**[docs/desktop-release.md](../docs/desktop-release.md)** to deliver,
and the internal signing procedure for the Apple account and certificate.

## What is not done here

The agent running the machine: **MIN-293**.
