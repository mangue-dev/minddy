# Documentation visual refresh

Capture useful controls in light mode, with native device pixels at 2x density,
sRGB color and grayscale text antialiasing. Keep the photographed control's
background and transparent outer margins; do not resize the screenshot. Wait
for the transient settings-arrival marker to disappear and blur incidental
input focus before photographing the control.

Run one bounded batch at a time, after confirming that no capture browser or
compiler from an earlier attempt is still active. The script accepts exactly
one locale and one to three screen IDs. It stops on its first failure and closes
the browser. It never starts a server or Docker.

```sh
CAPTURE_BASE_URL=https://www.minddy.app CAPTURE_LOCALES=en \
  DOC_CAPTURE_SCREENS=profile-and-preferences-workflow,account-security-workflow \
  node captures/shots/documentation-refresh/shot.mjs
```

Use the existing capture demo session for the selected host. Authentication
state stays in the ignored `.auth` directory. Business writes are blocked;
application-tab navigation may persist its normal UI state. Seeded example
prose is localized in GET responses only. CSV previews parse two in-memory
example rows, without submitting an import or calling its optional AI planner.
Installer examples stop at the route or backend choice and run no installation.
Each successful capture records its real runtime, route, display dimensions,
device scale, source checkout and response adaptations. Hosted captures show
the shipped UI; they do not establish acceptance of unshipped candidate behavior.

Review the pixels and figure captions before updating publication metadata.
Retain previous procedural evidence for actions that were not rerun.

For the shared table and diagram renderer, run the separate static verification
only after the capture browser closes:

```sh
node captures/shots/documentation-refresh/verify-render.mjs
```

This compiles only four explicit Tailwind sources and the small renderer entry.
It checks desktop light, mobile light and desktop dark previews with one browser
page, without loading the complete application or starting a development server.
