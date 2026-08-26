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
| `src/channel-store.ts` | the channel retained on disk (`userData/channel.json`) |
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

`npm run typecheck` from here type-checks `src/` against `electron` ; the typecheck of
deposit, **excludes this folder** (root tsconfig) — otherwise it would be necessary
install Electron to compile the site.

To work against a local server rather than production without changing the
stored server choice:

```bash
MINDDY_DESKTOP_ORIGIN=http://localhost:3000 npm start
```

The variable only exists for development. A packaged app ignores it. Installed
users choose a server from **minddy > Connect to a Server…** in the application
menu; remote origins must use HTTPS, while HTTP is accepted only for loopback and
private-network IP addresses. This shared flow works on macOS and Linux,
including **Run local minddy on this computer**.

## The selected server

The server picker stores one normalized origin in `userData/server.json` before
loading it. A new selection opens `/signup`; later launches open `/home` as
usual. Cookies are not copied between cloud and self-hosted origins.

Choosing **Use minddy Cloud** removes the custom selection and returns to the
stable cloud channel. While a custom server is active, the preview channel is
hidden because it is a property of minddy Cloud, not of the operator's server.

## The channel (MIN-352)

When minddy Cloud is selected, the shell loads one of two cloud origins:

| Channel | Origin | What it is |
| --- | --- | --- |
| `stable` | `www.minddy.app` | the Vercel Production deployment for the SHA referenced by `production` |
| `preview` | `preview.minddy.app` | the latest `main` preview candidate, before production approval and promotion |

Short-lived work branches can have disposable preview deployments, but neither
desktop cloud channel follows them. The preview channel follows `main`; the
stable channel follows only the automation-managed `production` pointer.

**Both serve the same Supabase project**: same accounts, same projects,
same tickets. Switching doesn't duplicate anything. The only thing that doesn't follow is the
session — cookies are by origin, so the first pass on the preview
asks to reconnect once; return to stable finds the session
production, remained intact.

The choice is made in **two places, and it is deliberate**: in Account →
Preferences (where you look for it) and in the `minddy` menu (the “Preview” box
Latest Features”). The second is not a duplicate of comfort: the screen of
settings is SERVED by the origin it controls — if the preview does not load, it
There is no settings screen at all, and the menu is the only thing left
to return to production.

It is retained in `userData/channel.json`, therefore **by machine and by profile**,
never in the account: a setting that decides which page to serve should read
before having used a single page. `MINDDY_DESKTOP_ORIGIN` wins on him — on
`localhost` there are not two channels.

Decisions in [lib/desktop/channel.ts](../lib/desktop/channel.ts), tested.

**A prerequisite on the Supabase side**, the same as in the following paragraph: the allowlist
“Redirect URLs” must also accept `https://preview.minddy.app/auth/callback?**`,
otherwise Google, GitHub and magic links fail on this channel.

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
electron-updater on Windows. The complete Partner Center and clean installation
procedure is in
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
