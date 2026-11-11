import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The static half of the shell's configuration. What depends on the selected
 * server (the origin the WebView loads, its start path, the offline page) is
 * set at launch by `ios/App/App/MinddyViewController.swift`, because the
 * server is chosen in the app and this file is fixed at build time.
 */
const config: CapacitorConfig = {
  appId: "app.minddy.ios",
  appName: "minddy",
  // The pages bundled in the app: the server choice and the offline screen,
  // written by `scripts/build-mobile.mjs`.
  webDir: "www",
  ios: {
    // The product draws under the status bar and the home indicator itself,
    // with `env(safe-area-inset-*)`, as it does in the installed PWA.
    contentInset: "never",
  },
};

export default config;
