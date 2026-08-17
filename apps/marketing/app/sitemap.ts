import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.minddy.app";
  return ["", "/pricing", "/mcp"].map((path) => ({ url: `${siteUrl}${path}`, lastModified: new Date("2026-08-16") }));
}
