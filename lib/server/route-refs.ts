import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase-server";
import { isUuid, projectSegmentCode, shortCodeRange } from "@/lib/app-urls";

/**
 * The id a readable URL reference designates in `table`, read with the
 * caller's session so RLS bounds it to records they can see (lib/app-urls.ts).
 * A legacy full id passes through without a read; an unknown or ambiguous
 * short code resolves to null, and a failed read throws.
 */
export const resolveRouteRef = cache(
  async (table: "projects" | "pages", ref: string): Promise<string | null> => {
    if (isUuid(ref)) return ref.toLowerCase();
    const range = shortCodeRange(ref);
    if (!range) return null;
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .gte("id", range.from)
      .lte("id", range.to)
      .limit(2);
    // A failed read is not "not found": let the caller's error handling run.
    if (error) throw new Error(`Route reference lookup failed: ${error.message}`);
    return data?.length === 1 ? (data[0].id as string) : null;
  },
);

/** The project id of a `/projects/[segment]` route (`min-3f2a9c81`). */
export function resolveProjectSegment(segment: string): Promise<string | null> {
  return resolveRouteRef("projects", projectSegmentCode(segment));
}
