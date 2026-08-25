# minddy for Linux

minddy is officially distributed for 64-bit Linux as a portable AppImage. Each
desktop release also includes `.deb` and `.rpm` packages for administrators who
need their operating system's package format.

## Supported artifacts

| Format | Architectures | Use | Updates |
| --- | --- | --- | --- |
| AppImage | `x64`, `arm64` | The reference portable download; no root access or installation required. | Checked by the app on launch and every six hours. |
| DEB | `x64`, `arm64` | Debian, Ubuntu, and related systems. | Install the next verified package manually. |
| RPM | `x64`, `arm64` | Fedora, RHEL, openSUSE, and related systems. | Install the next verified package manually. |

The AppImage is the default because it has the broadest compatibility and does
not modify the host. The `.deb` and `.rpm` files are generated, signed, and
release-tested in CI, but are direct-download packages rather than package
repositories. The in-app updater deliberately does not install them: the
updater implementation can invoke package managers with signature checks
disabled, which would defeat the detached GPG signature described below.

## Install and run

Download the matching AppImage from the [download page](/download), make it
executable, then run it:

```bash
chmod +x minddy-*.AppImage
./minddy-*.AppImage
```

If a distribution does not have FUSE available, run it once with
`--appimage-extract-and-run`, or install the distribution's FUSE compatibility
package. Keep the AppImage in a writable directory: its update replaces that
file in place after confirmation.

The DEB and RPM packages install a freedesktop launcher. The shared
electron-builder configuration creates `minddy.desktop`, associates the
`minddy://` scheme as `x-scheme-handler/minddy`, and sets a matching window
class for GNOME and KDE. The portable AppImage carries the same desktop entry;
an integration tool such as AppImageLauncher may install it into the desktop
menu.

## Verify a release

Every Linux release contains the following files alongside the packages:

- `minddy-linux-release-key.asc` — the public release key;
- `latest-linux.yml.asc` and `latest-linux-arm64.yml.asc` — the detached
  signatures for the x64 and ARM64 updater metadata, respectively;
- `<package>.asc` — a detached signature for every AppImage, DEB, and RPM;
- `SHA256SUMS-linux-x64` and `SHA256SUMS-linux-arm64`, each with a detached
  signature — one signed checksum list per architecture.

Import the key, inspect its fingerprint, then verify the signed checksum file
before using a package:

```bash
gpg --import minddy-linux-release-key.asc
gpg --fingerprint
gpg --verify SHA256SUMS-linux-x64.asc SHA256SUMS-linux-x64
sha256sum --ignore-missing --check SHA256SUMS-linux-x64
gpg --verify minddy-*.AppImage.asc minddy-*.AppImage
```

For ARM64, substitute `SHA256SUMS-linux-arm64`; it lists only the ARM64
packages referenced by `latest-linux-arm64.yml`.

After both desktop publication jobs succeed, the release workflow automatically
adds the exact protected `LINUX_GPG_FINGERPRINT` to the corresponding GitHub
Release notes. Do not accept a replacement key solely because it was downloaded
from the same location as an artifact. Key rotation publishes both the old and
new fingerprints in advance.

## Updates and local runtime

The x64 AppImage checks `latest-linux.yml` automatically; the ARM64 AppImage
checks `latest-linux-arm64.yml`. Each manifest contains SHA-512 hashes that
electron-updater verifies before replacing the file; its detached GPG signature
is available for independent verification. The app never restarts during work.
It offers installation after the download; the replacement applies after the
user confirms it.

Desktop state follows the XDG base-directory specification:

| Purpose | Default location |
| --- | --- |
| Server selection, session data, local runtime configuration, and agent files | `$XDG_CONFIG_HOME/minddy` or `~/.config/minddy` |
| Chromium disk cache | `$XDG_CACHE_HOME/minddy` or `~/.cache/minddy` |
| Downloaded updater files | `$XDG_CACHE_HOME/minddy-desktop-updater` or `~/.cache/minddy-desktop-updater` |
| Application logs | `$XDG_STATE_HOME/minddy/logs` or `~/.local/state/minddy/logs` |

The **Run local minddy on this computer** flow is supported on Linux. Select a
minddy clone containing `pnpm self-host:local`; the desktop process starts the
supported local launcher without opening a browser, waits for
`http://localhost:6463/api/health`, then opens the local sign-up screen in the
window. The launcher uses the user's configured shell or `/bin/sh`, and stops
with the desktop app.

The Linux application menu provides the same server controls as the macOS app:
**Connect to a Server…** persists a validated HTTPS or private-network origin,
**Use minddy Cloud** removes that selection, and **Preview Latest Features**
switches the minddy Cloud channel. Packaged Linux builds also register
`minddy://` for browser-to-desktop authentication callbacks.

## Release pipeline

`Public desktop release` runs only against an existing core tag in the protected
`public-release` environment. Its Linux job builds all three formats for both
architectures, imports `LINUX_GPG_PRIVATE_KEY` into a temporary GPG home, signs
the artifacts with `LINUX_GPG_FINGERPRINT`, verifies each detached signature,
and publishes packages before both architecture-specific update manifests last.
The workflow attaches all packages, signatures, public key, checksums, and
GitHub provenance attestations to the corresponding GitHub Release.

The release requires these protected environment values:

| Name | Kind | Purpose |
| --- | --- | --- |
| `LINUX_GPG_PRIVATE_KEY` | secret | ASCII-armored private GPG release key |
| `LINUX_GPG_PASSPHRASE` | secret | Passphrase for the imported release key |
| `LINUX_GPG_FINGERPRINT` | variable | Exact allowed signer fingerprint |
| `PUBLIC_DESKTOP_FEED_URL` | secret | Generic HTTPS update-feed directory |
| `PUBLIC_DESKTOP_BLOB_READ_WRITE_TOKEN` | secret | Permission to write the public feed |

## Rotate the signing key

Create the replacement key offline and keep the existing private key available
until at least one release has completed with the replacement. Before changing
the protected environment values, publish the replacement public key and its
full fingerprint through an authenticated project channel, and add both the
current and replacement fingerprints to the preceding GitHub Release notes.

Update `LINUX_GPG_PRIVATE_KEY`, `LINUX_GPG_PASSPHRASE`, and
`LINUX_GPG_FINGERPRINT` together, then run the next desktop release. Verify its
public key, detached signatures, and signed checksum lists from an independent
environment before removing the old private key. Keep old public keys attached
to their original GitHub Releases. If a key is compromised, publish its
revocation certificate and fingerprint before trusting a replacement; do not
use the compromised key for a transition signature.

Daily CI runs the pure release-helper tests without rebuilding native packages.
The protected public desktop release workflow performs the Linux package build
and integration checks before publication. The key is not a commercial
code-signing certificate: GPG ownership and the published fingerprint are the
trust anchor.
