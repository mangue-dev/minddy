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
        expect(item.title.length, `${locale}.${item.key} title`).toBeGreaterThanOrEqual(8);
        expect(item.title.length, `${locale}.${item.key} title`).toBeLessThanOrEqual(70);
        expect(item.description.length, `${locale}.${item.key} description`).toBeGreaterThanOrEqual(40);
        expect(item.description.length, `${locale}.${item.key} description`).toBeLessThanOrEqual(170);
      }
    }
  });

  it("uses the approved English positioning on core and platform pages", () => {
    expect(en.Landing.metaTitle).toContain("open-source issue tracker");
    expect(en.Landing.metaDescription).toContain("open-source workspace");
    expect(en.SelfHosting.metaDescription).toContain("GNU AGPL v3.0");

    for (const namespace of [en.DownloadMacos, en.DownloadLinux, en.DownloadWindows]) {
      expect(namespace.metaTitle).toContain("native open-source issue tracker");
      expect(namespace.openSourceBody).toContain("GNU AGPL v3.0");
    }

    const mobileCopy = Object.values(en.DownloadMobile).join(" ");
    expect(mobileCopy).toContain("progressive web app");
    expect(mobileCopy).toMatch(/not a native mobile app|not a native iOS or Android app/);
    expect(mobileCopy).toContain("There is no Minddy application in the iOS App Store or Google Play");
  });

  it("publishes dedicated canonical route families for every supported platform", () => {
    const expected = {
      downloadMacos: "/download/macos",
      downloadLinux: "/download/linux",
      downloadWindows: "/download/windows",
      downloadMobile: "/download/mobile-pwa",
    } as const;

    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      const route = routeByKey(key);
      expect(route.en).toBe(expected[key]);
      expect(Object.keys(route.localized)).toHaveLength(4);
    }
  });

  it("lists every locale variant once with reciprocal sitemap alternates", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(PUBLIC_ROUTES.length * locales.length);
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
