# Documentation iOS app controls

Capture the web screens the iOS app shows for the `applications` article's
`ios-app` section, in all six supported languages:

- `ios-app-sign-in`: **Log in or sign up** as the app shows it after its
  welcome slides, with the Apple, Google and GitHub buttons and
  **Self-host minddy**. Anonymous; no form is submitted.
- `ios-app-ai-consent`: the **Use AI features?** sheet the app opens after
  sign-in while the device has no answer. Neither button is pressed.
- `ios-app-mobile-preferences`: the **Mobile app** group of **Account
  settings** → **Preferences**, with **Vibrations** and **AI features**.
  No switch is flipped.

The iOS app is a WebView on the selected server, and these screens are that
server's pages. The script loads them from a local candidate in a phone-sized
Chromium page with the object Capacitor injects (`window.Capacitor`) and a
stand-in for the shell's `MinddyShell` plugin, so `isNativeMobile()` answers
as in the app. The native parts of the app (status bar, Liquid Glass bottom
bar, Apple's and the system's sign-in sheets) are not in these figures.

Run one locale per invocation against a local candidate:

```bash
CAPTURE_LOCALES=en node captures/shots/documentation-ios-app/shot.mjs
```

Every request that would write is aborted and logged in the run record under
`output/documentation-captures/`. The AI consent answer of the third screen is
a cookie of the page (`minddy-ai-consent=granted`), never written to the demo
account. Inspect each PNG before recording it as reviewed.
