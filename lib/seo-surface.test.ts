import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/config";
import { PUBLIC_ROUTES, routeByKey } from "@/lib/public-routes";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import itMessages from "@/messages/it.json";
import ptBR from "@/messages/pt-BR.json";
import sitemap from "@/app/sitemap";
import { getPublishedDocumentation } from "@/lib/server/documentation";

const CATALOGS = { en, fr, de, "pt-BR": ptBR, it: itMessages, es } as const;

describe("public SEO surface", () => {
  it("gives every indexable route a unique, search-sized title and description", () => {
    for (const locale of locales) {
      const catalog = CATALOGS[locale] as unknown as Record<string, Record<string, string>>;
      const metadata = PUBLIC_ROUTES.map((route) => {
        const namespace = catalog[route.namespace];
        expect(namespace, `${locale}.${route.namespace}`).toBeDefined();
        return {
          key: route.key,
          title: namespace.metaTitle,
          description: namespace.metaDescription,
        };
      });

      expect(new Set(metadata.map(({ title }) => title)).size).toBe(metadata.length);
      expect(new Set(metadata.map(({ description }) => description)).size).toBe(metadata.length);

      for (const item of metadata) {
        const route = routeByKey(item.key);
        const renderedTitle = route.titleIsAbsolute ? item.title : `${item.title} · minddy`;
        expect(renderedTitle.length, `${locale}.${item.key} title`).toBeGreaterThanOrEqual(8);
        expect(renderedTitle.length, `${locale}.${item.key} title`).toBeLessThanOrEqual(70);
        expect(item.description.length, `${locale}.${item.key} description`).toBeGreaterThanOrEqual(40);
        expect(item.description.length, `${locale}.${item.key} description`).toBeLessThanOrEqual(170);
      }
    }
  });

  it("uses the approved English positioning on core and platform pages", () => {
    expect(en.Landing.metaTitle).toContain("open-source project management");
    expect(en.Landing.metaDescription).toContain("connected AI agents");
    expect(en.SelfHosting.metaDescription).toContain("GNU AGPL v3.0");

    for (const namespace of [en.DownloadMacos, en.DownloadLinux, en.DownloadWindows]) {
      expect(namespace.metaTitle).toContain("native open-source issue tracker");
      expect(namespace.openSourceBody).toContain("GNU AGPL v3.0");
    }

    const mobileCopy = Object.values(en.DownloadMobile).join(" ");
    // The page installs the web app from the browser. It no longer says there
    // is no App Store app: the iOS app is on its way (MIN-907), and the page
    // must stay true once it ships.
    expect(mobileCopy).toContain("web app");
    expect(mobileCopy).not.toMatch(/no minddy application in the iOS App Store/);
  });

  it("keeps a mobile guide route and retires desktop guide pages", () => {
    const expected = {
      downloadMobile: "/download/mobile-pwa",
    } as const;

    expect(PUBLIC_ROUTES.some(route => ["downloadMacos", "downloadLinux", "downloadWindows"].includes(route.key))).toBe(false);

    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      const route = routeByKey(key);
      expect(route.en).toBe(expected[key]);
      expect(Object.keys(route.localized)).toHaveLength(4);
    }
  });

  it("lists every locale variant once with reciprocal sitemap alternates", async () => {
    const entries = await sitemap();
    expect(entries).toHaveLength((PUBLIC_ROUTES.length + getPublishedDocumentation("en").length) * locales.length);
    expect(new Set(entries.map(({ url }) => url)).size).toBe(entries.length);

    for (const entry of entries) {
      const languages = entry.alternates?.languages;
      expect(languages).toBeDefined();
      expect(Object.keys(languages ?? {})).toHaveLength(locales.length + 1);
      expect(languages?.["x-default"]).toBeDefined();
    }
  });

  it("keeps every catalog in the supported locale set", () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...locales].sort());
  });
});
