import { NextRequest, NextResponse } from "next/server";
import { locales, type Locale } from "@/i18n/config";
import { getChangelogFeature, getChangelogIndex, getChangelogPage, getChangelogRelease, summarizeRelease } from "@/lib/server/changelog";
import { VERSION_PATTERN } from "@/scripts/changelog-lib.mjs";

/** Public release content contains no account or project data. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const rawLocale = p.get("locale") ?? "en";
  const feature = p.get("feature");
  const version = p.get("version");
  const after = p.get("after");
  if (!(locales as readonly string[]).includes(rawLocale)
    || (feature !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature))
    || (version !== null && !VERSION_PATTERN.test(version))
    || (after !== null && !VERSION_PATTERN.test(after))
    || [feature, version, after].filter(v => v !== null).length > 1) {
    return NextResponse.json({ error: "Invalid changelog request" }, { status: 400 });
  }
  const locale = rawLocale as Locale;
  try {
    if (after && !(await getChangelogIndex()).some(r => r.version === after)) {
      return NextResponse.json({ error: "Unknown changelog cursor" }, { status: 400 });
    }
    const result = feature ? await getChangelogFeature(feature, locale)
      : version ? await getChangelogRelease(version).then(r => r ? summarizeRelease(r, locale) : null)
      : await getChangelogPage(locale, after ?? undefined);
    if (!result) return NextResponse.json({ error: "Release content not found" }, { status: 404 });
    return NextResponse.json(result, { headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      "X-Robots-Tag": "noindex",
    } });
  } catch {
    return NextResponse.json({ error: "Release content is temporarily unavailable" }, { status: 503 });
  }
}
