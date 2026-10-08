import { isMobileLayout } from "./app-layout";

// Build this entry into a static pre-paint script; the runtime shares its policy.
document.documentElement.dataset.appLayout = isMobileLayout() ? "mobile" : "desktop";
