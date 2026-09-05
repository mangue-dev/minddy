# MIN-494: mobile PWA guide

- [x] Review the standalone guide and current browser installation instructions.
- [x] Rebuild the page using the shared marketing style and illustrated steps.
- [x] Verify all locales, responsive layouts, anchors, and server-rendered content.

The standalone guide now provides the complete iPhone/iPad and Android paths
directly, including on desktop and without JavaScript. The hero links to each
platform, a preparation card explains which browser to use, and a completion
card explains how to return to the same workspace. Pastel surfaces, pill actions,
and sans-serif typography match the redesigned download page. The redundant
self-link has been replaced with navigation back to all downloads.

The illustrated steps and translation mapping are shared with the download
hub. Its detected-platform and native Android prompt behavior stay intact.
The standalone Android path starts with the browser menu and then confirmation;
it does not imply that an installation event or button is available. Existing
PWA/native-app distinctions, repository and license links, metadata, structured
data, and localized routes are preserved. Markdown uses the same ordered steps.

Instructions were checked against [Apple's Safari guide](https://support.apple.com/en-ca/guide/iphone/iphea86e5236/ios)
and [Google's Chrome guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en)
on September 5, 2026. The preparation copy covers links opened within another app;
Android copy acknowledges browser label differences and an existing prompt.

Validation:

- Focused Oxlint, TypeScript, owned-English, and whitespace checks passed.
- 106 tests passed across download interactions, messages/locales, public client
  message boundaries, public routes, and SEO.
- Six routes passed 60 viewport/theme configurations at 320, 390, 768, 1024,
  and 1440 px. Verified all five ordered steps, metadata/schema, and 12 keyboard
  anchor visits with headings below the sticky navigation.
- All guide text matched the locale catalogs in 12 HTML/Markdown responses.
  Restarted the local development server to clear stale route-handler message
  imports before checking Markdown; no production behavior changed.
- A browser context without JavaScript displayed both complete paths and followed
  the Android anchor. Reviewed desktop/mobile screenshots in both themes.
- Browser installation screens are explanatory illustrations. No application was
  installed during verification; existing download tests simulate install events.

The changelog stays unchanged at the user's request. This completes the remaining
marketing guide identified by the comparison-page audit. Work remains on PR #133
without a production deployment.
