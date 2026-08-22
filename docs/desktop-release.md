# Deliver minddy: the site, the desktop app, and why they are not the same thing

> **Ticket**: MIN-292 · Neighbors: the instance signature configuration
> (Apple account and certificate, once and for all),
> [desktop-electron.md](desktop-electron.md) (framing),
> [desktop/README.md](../desktop/README.md) (the shell code).

**The question this page answers**: I have just delivered a feature,
do I need to republish the macOS app?

**The short answer**: almost never, and `npm run deploy` tells you so.

---

## Why there are two things to deliver

The desktop app is **a window to `www.minddy.app`**, without any local rendering
(§2 of the framework). This is the decision that governs this entire document: to deliver a
feature does not ask to re-sign a binary, and the app always says the same
thing than the web.

| | What it is | How it is delivered | Who sees it, and when |
| --- | --- | --- | --- |
| **The site** | all that appears | `npm run deploy` | everyone, right away — including the app, the next time you reload |
| **The shell** | window, menu, `minddy://`, navigation guard, native notifications, update | build signed + notarized, then publication of the flow | existing installations, within 6 hours, to their next ⌘Q |

A deployment of the site **never triggers** an app update: as long as
that no binary is republished, the flow announces the same version and nothing
move at no one's house.

---

## Which really requires republishing

Not “did I touch `desktop/`”. The esbuild bundle also includes what these
files import, and **the list overflows the folder** — noted on the real
bundle, not guessed:

```
desktop/src/{main,menu,preload,updater}.ts
lib/desktop/{auth-link,config,nav-guard,window-routes}.ts
lib/public-routes.ts     ← the navigation guard derives from it
lib/site.ts              ← the origin loaded by the window
lib/auth-redirect.ts
lib/changelog.ts
```

Plus what does not enter via esbuild but still produces the binary:
`desktop/electron-builder.yml`, entitlements, icon, versions
of Electron and electron-updater, and `scripts/build-desktop.mjs`.

**The surprising line is `lib/public-routes.ts`.** Add a public page
changes the binary: without republication, existing installations will not be able to
not that this page is public and **will display it in the window** instead of
open it in the browser. This is the normal drift of a shell that lives in
people facing a site that moves every day — but they might as well get to know it.

### Which does not require anything, and which had to be explicitly excluded

Three contents enter the bundle without saying anything about its behavior. Without
these cuts, **each deployment of the site would republish the app** — ten minutes of
Mac immobilized, and 120 MB downloaded by each user for nothing:

- **the version number**, rewritten for each build from that of the repository;
- **`lib/changelog.ts`**, which only provides a date (`CHANGELOG_LAST_MODIFIED`);
- **the `lastModified` of `lib/public-routes.ts`**, held by hand for
  sitemap. The shell only reads PATHS.

They live in `NORMALIZE`, at the head of
[scripts/desktop-fingerprint.mjs](../scripts/desktop-fingerprint.mjs), each
with his reason.

---

## The mechanism: a print, and a reading

[`desktop-fingerprint.mjs`](../scripts/desktop-fingerprint.mjs) asks esbuild
which files actually go into the bundle, hashes them after normalization,
and makes a print. This is a **derived** list, not maintained by hand: a
`import` added tomorrow will be taken into account without anyone thinking about it.

[`desktop/released.json`](../desktop/released.json) is the statement of the last
publication — version, date, fingerprint, and hash of each file. He is
**committee**: the response is read in a diff, and an offline deployment remains
possible. It is written by `publish-desktop.mjs` **after** sending, never before
— a statement which would announce a failed publication would cause all the
subsequent deployments.

```bash
npm run desktop:check      # what changed since publication
```

```
Published: 0.9.2 (e5bb38213348)
Current: c28ea4e2f76e

  modified   desktop/src/main.ts
  modified   lib/desktop/window-routes.ts
```

---

## The normal flow: `npm run deploy`

The desktop step of `deploy.sh` uses the version of the core that the wizard comes from
to publish, so that each application carries the version of the site from which it is
taken. The public desktop release, without dependency on the workstation, is described
in [`releases.md`](releases.md) and runs in GitHub Actions; `npm run deploy` triggers
it and waits for its result. Linux formats, GPG verification, key rotation,
XDG paths, and updater behavior are documented in
[`linux-desktop.md`](linux-desktop.md).

1. Nothing has changed in the shell → `Desktop app: unchanged since 0.9.2 —
   nothing to republish.` and the deployment continues. **This is the common case.**
2. The shell has changed → automatic mode offers desktop applications; manual
   mode asks the question with “yes” by default.
3. If desktop applications are retained, `deploy.sh` first waits for the core
   release, then triggers the GitHub jobs for macOS, Linux, and Windows. It
   waits for macOS signing and notarization, Linux GPG signing, and the Store
   MSIX packages before attaching the artifacts to the release.
4. After success, the bot commits `desktop/released.json` to `main`. This statement
   makes the following detection accurate; it is never written before the
   binaries and their manifest are actually published.

`npm run desktop:release` remains a local diagnostic command which should neither
publish the public feed or serve as proof of release. The public stream passes
exclusively by `Public desktop release`, checkout the heart tag, then get
its signature and publication identifiers from `public-release`.

### How long, and should you stay ahead

**It is now a CI flow with a remote wait.** The signature,
waiting for the Apple verdict, **stapling the ticket in the bundle**,
production of `.dmg` and `.zip`, then sending runs on the GitHub runner
macOS. The maintainer's position can sleep; `npm run deploy` only follows the
workflow and displays its result.

Measured on the first real release (0.9.2):

| | |
| --- | --- |
| arm64 submission → x64 submission | ~4 min (notarization + `.dmg`/`.zip`) |
| x64 submission → written manifest | ~1 min 20 |
| **total, shipping included** | **~10 mins** |

The very first submission took 25 minutes and ended with a `HTTP 500`:
it was Apple that was going bad that day, not the norm. The binary had been
accepted.

It's not every deployment, and that's the whole point of the footprint: the
Most deliveries do not touch the shell and skip the step. If that
fails, the already published core and web remain valid; the desktop stream keeps
its previous manifesto until a successful relaunch.

---

## What someone who has the app installed receives

The app reads `latest-mac.yml` **on launch, then every 6 hours**. Plus version
recent → download `.zip` in background, then install **at
next ⌘Q**. Never a restart imposed under the fingers of someone who
writes a ticket.

The menu also says “Check for Updates…” — the only check that has the right
to answer "you are up to date", because someone asked the question. The one
which runs on its own is silent: otherwise the only thing the app would say to
someone offline would be that it was unable to update.

**The `.zip` is not a duplicate of the `.dmg`**: Squirrel.Mac can only read it.
The `.dmg` is used for the first download, the `.zip` for all updates
following. Publishing one without the other results in an app that installs and does not
never updated, without saying anything.

---

## Windows: Microsoft Store

Windows is distributed exclusively through Microsoft Store as x64 and ARM64
MSIX packages. Microsoft signs the submitted packages and owns their update
lifecycle. There is no Windows direct installer, Authenticode certificate, or
Windows `electron-updater` feed.

The shell never initializes `electron-updater` on Windows. The **Check for
Updates…** command instead says that Microsoft Store owns the installation.

The shared `protocols` declaration writes `minddy://` into
`AppxManifest.xml`. Windows delivers cold-start and second-instance links
through `argv`; both routes are handled before the renderer subscribes. AppX
also declares `runFullTrust`, which the Electron shell needs to launch the
supported local self-hosted runtime. Stopping that runtime uses `taskkill /t`
so the `cmd`, pnpm, Supabase, and Next.js child processes are closed together.

### Partner Center setup and Store submission

1. The reserved **minddy** product has this immutable identity:
   `mangue-dev.minddy`, publisher
   `CN=D5052B10-735B-4EF0-920F-642DFBDEB04F`, and publisher display name
   `mangue-dev`.
2. Configure them as GitHub environment variables
   `WINDOWS_STORE_IDENTITY_NAME` and `WINDOWS_STORE_PUBLISHER` on
   `public-release`. They are injected as
   `MINDDY_WINDOWS_STORE_IDENTITY_NAME` and
   `MINDDY_WINDOWS_STORE_PUBLISHER` during packaging.
3. Run **Public desktop release** for an already published core version. The
   Windows job creates one x64 and one ARM64 MSIX, unpacks both with the Windows
   SDK, and verifies identity, publisher, `minddy://`, and `runFullTrust`.
4. Download the attested `.msix` assets from the GitHub Release and add both to
   the same Partner Center submission. These artifacts are intentionally
   unsigned: Partner Center applies the production signature and distributes
   Store updates.
5. After Store certification, install from the Store on a clean Windows
   machine and verify login through `minddy://`, local runtime startup and
   shutdown, update ownership, and uninstall. This post-certification check is
   the only validation that exercises Microsoft's final signature and delivery.

The identity name and publisher must remain byte-for-byte stable after the
first submission. `scripts/build-windows-store.mjs` refuses missing values and
renames electron-builder's AppX target output to the modern `.msix` extension.
The application version is converted to the four-component Windows package
version by electron-builder; every Store submission must therefore use a newer
SemVer release.

Local packaging and validation commands are:

```powershell
$env:MINDDY_WINDOWS_STORE_IDENTITY_NAME = "mangue-dev.minddy"
$env:MINDDY_WINDOWS_STORE_PUBLISHER = "CN=D5052B10-735B-4EF0-920F-642DFBDEB04F"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm --prefix desktop run dist:win:store
./scripts/verify-windows-desktop.ps1
```

---

## The three refusals of publication

[`publish-desktop.mjs`](../scripts/publish-desktop.mjs) checks before sending
a byte, and he does not do it out of an abundance of caution: **the three failures
corresponding are silent**. Nothing breaks when published, everything is broken
in people.

1. **Unsigned app** → it installs and will never update
   (Squirrel.Mac requires a signature).
2. **Notarization ticket missing** → macOS refuses to open it. And the lack
   is not seen in the build: when the identifiers are missing, electron-builder writes
   `skipped macOS notarization` to `warn` in the middle of a hundred lines and renders an app
   normal in appearance.
3. **`app-update.yml` without feed URL** → the app doesn't search anywhere. This
   file is written at packaging, so a `MINDDY_DESKTOP_FEED_URL` missing CE
   that day is not seen anywhere else.

It also only publishes what `latest-mac.yml` announces**: the file
`desktop/release/` is not cleaned between two builds, and naive scanning
would republish binaries from a previous version. What he leaves on the ground, he
says — a quiet ceiling is a lie.

---

## Where the settings live

| Varies | Role | Who reads it |
| --- | --- | --- |
| `PUBLIC_DESKTOP_FEED_URL` | the public folder of the stream | build workflow; same value configured for `/api/desktop/download` |
| `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | Apple notarization | GitHub environment `public-release` |
| `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD` | signature Developer ID | GitHub environment `public-release` |
| `WINDOWS_STORE_IDENTITY_NAME`, `WINDOWS_STORE_PUBLISHER` | immutable Partner Center package identity | GitHub environment variables on `public-release` |
| `PUBLIC_DESKTOP_BLOB_READ_WRITE_TOKEN` | write public feed | GitHub-only workflow |

The public value of the flow is also configured on Vercel for the route of
download. The secrets of signing, notarization and writing do not live
in `.env` nor in a maintainer's keychain: they belong to
the organization and are only exposed to the approved runner.

**The trap to know**: the feed URL must be present **at
moment of build**, not only on Vercel. It is in the packaging that it enters
in the `app-update.yml` of the bundle; the workflow provides it from
`PUBLIC_DESKTOP_FEED_URL`, without `source .env`.
