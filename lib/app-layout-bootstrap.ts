import { isMobileLayout } from "./app-layout";
import { applySideChrome } from "./mobile/side-chrome";

// Build this entry into a static pre-paint script; the runtime shares its policy.
document.documentElement.dataset.appLayout = isMobileLayout() ? "mobile" : "desktop";
// iPhone Duo's side column, before the first paint (lib/mobile/side-chrome.ts).
applySideChrome(document);
