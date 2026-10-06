import { SITE_URL } from "@/lib/site";

/** Canonical URL for a token-based public page. */
export function publicCanonicalUrl(path: string, subPath = ""): string {
  return `${SITE_URL}${path}${subPath}`;
}
