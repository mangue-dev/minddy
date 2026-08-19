import { cn } from "mangue-ui/lib/utils";
import { getAppEnv } from "@/lib/env";

/**
 * The minddy brandmark. Production has one asset for each ambient background:
 * the light logo is shown in dark mode and the dark logo in light mode. Preview
 * and development use their environment colors. CSS selects the production
 * variant so the logo follows the pre-paint theme without a hydration flash.
 */
export function MinddyLogo({ className }: { className?: string }) {
  const env = getAppEnv();
  const imageClass = cn("h-6 w-auto", className);
  const logoSources = {
    production: { light: "/logo/dark.png", dark: "/logo/light.png" },
    preview: { light: "/logo/preview_dark.png", dark: "/logo/preview_light.png" },
    development: { light: "/logo/dev_dark.png", dark: "/logo/dev_light.png" },
  }[env];

  return (
    <>
      <img
        src={logoSources.light}
        alt="minddy"
        className={cn(imageClass, "dark:hidden")}
      />
      <img
        src={logoSources.dark}
        alt="minddy"
        aria-hidden="true"
        className={cn(imageClass, "hidden dark:block")}
      />
    </>
  );
}
