import { describe, expect, it } from "vitest";

import { PUBLIC_ROUTES } from "@/lib/public-routes";
import en from "@/messages/en.json";
import { INSTALL_MESSAGE_CODES } from "./local-installer";
import {
  serverChoiceEnvironment,
  serverChoiceEnvironmentFromSearch,
  serverChoiceUrl,
  SERVER_GUIDE_PATHS,
  isServerChoiceDocument,
  resolveServerChoiceLocale,
  serverGuideUrl,
} from "./server-choice";

describe("desktop server choice", () => {
  it("is the app's own page, told the environment of the server the window shows", () => {
    expect(serverChoiceUrl("https://www.minddy.app")).toBe("minddy-app://welcome/?env=production");
    expect(serverChoiceEnvironment("http://localhost:3000")).toBe("development");
    expect(serverChoiceEnvironment("https://preview.minddy.app")).toBe("preview");
    expect(serverChoiceEnvironment("https://minddy-git-x.vercel.app")).toBe("preview");
    expect(serverChoiceEnvironment("https://tickets.example.com")).toBe("production");
    expect(serverChoiceEnvironmentFromSearch("?env=development")).toBe("development");
    expect(serverChoiceEnvironmentFromSearch("?env=<script>")).toBe("production");
  });

  it("trusts only the app's own document, never a server's page", () => {
    expect(isServerChoiceDocument("minddy-app://welcome/?step=selfhost")).toBe(true);
    expect(isServerChoiceDocument("https://www.minddy.app/desktop/welcome")).toBe(false);
    expect(isServerChoiceDocument("minddy-app://elsewhere/")).toBe(false);
    expect(isServerChoiceDocument("minddy://welcome/")).toBe(false);
    expect(isServerChoiceDocument("data:text/html,x")).toBe(false);
    expect(isServerChoiceDocument("not a url")).toBe(false);
  });

  it("speaks the first supported system language", () => {
    expect(resolveServerChoiceLocale(["fr-CA", "en-US"])).toBe("fr");
    expect(resolveServerChoiceLocale(["pt-PT"])).toBe("pt-BR");
    expect(resolveServerChoiceLocale(["ja-JP", "de-AT"])).toBe("de");
    expect(resolveServerChoiceLocale(["ja-JP"])).toBe("en");
  });

  it("links to the public installation wizard on its localized path", () => {
    const route = PUBLIC_ROUTES.find((entry) => entry.key === "selfHostingInstall")!;
    expect(SERVER_GUIDE_PATHS.en).toBe(route.en);
    expect(SERVER_GUIDE_PATHS.fr).toBe(route.fr);
    for (const locale of ["de", "es", "it", "pt-BR"] as const) {
      expect(SERVER_GUIDE_PATHS[locale], locale).toBe(route.localized?.[locale]);
    }
    expect(serverGuideUrl("https://www.minddy.app", "fr")).toBe("https://www.minddy.app/fr/auto-hebergement/installer?route=team");
  });

  it("has a translation for every message the installer sends", () => {
    for (const code of INSTALL_MESSAGE_CODES) expect(en.DesktopWelcome, code).toHaveProperty(code);
  });
});
