import { describe, expect, it } from "vitest";
import { loadMessages } from "@/i18n/messages";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import itMessages from "@/messages/it.json";
import ptBr from "@/messages/pt-BR.json";

describe("complete locale messages", () => {
  it.each(["de", "pt-BR", "it", "es"] as const)(
    "loads translated marketing and application copy for %s",
    async (locale) => {
      const messages = await loadMessages(locale);
      const landing = messages.Landing as Record<string, string>;
      const auth = messages.Auth as Record<string, string>;

      expect(landing.metaTitle).not.toBe("minddy, the issue tracker that stays simple");
      expect(landing.featuresTitle).not.toBe("And underneath, it's a real tracker");
      expect(auth.signIn).not.toBe("Sign in");
    },
  );

  it("gives every locale exactly the English catalog keys", () => {
    const englishKeys = leafPaths(en).sort();
    for (const catalog of [de, ptBr, itMessages, es]) {
      expect(leafPaths(catalog).sort()).toEqual(englishKeys);
    }
  });

  it("lists Windows as a supported desktop platform in every locale", () => {
    for (const catalog of [en, fr, de, ptBr, itMessages, es]) {
      expect(catalog.Account.desktopAppHint).toContain("Windows");
    }
  });

  it.each([
    [de, ["ApiErrors.nameRequired", "Projects.invitationRejected", "ToolCall.viewCreated"]],
    [ptBr, ["FeedbackBoard.postTitlePlaceholder", "Privacy.dataAI", "Changelog.metaTitle"]],
    [itMessages, ["PullRequests.commitDiffTitle", "Pricing.row_scratchpad", "SelfHostingInstall.domainLabel"]],
    [es, ["Agents.pinSession", "PullRequests.commitDiffTitle"]],
  ] as const)("does not retain proven English copy", (catalog, keys) => {
    for (const key of keys) {
      expect(catalogValue(catalog, key)).not.toBe(catalogValue(en, key));
    }
  });
});

interface CatalogNode {
  readonly [key: string]: unknown;
}

function leafPaths(value: CatalogNode, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null
      ? leafPaths(child as CatalogNode, path)
      : [path];
  });
}

function catalogValue(catalog: CatalogNode, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (!node || typeof node !== "object") return undefined;
    return (node as CatalogNode)[key];
  }, catalog);
}
