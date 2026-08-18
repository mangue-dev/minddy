import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Name of a project, for page titles (MIN-95).
 *
 * The `generateMetadata` stack: that of `projects/[id]/layout.tsx` and
 * that of its sublayout (`triage`, `objectives`, `settings`, `feedback`)
 * both run for the same query, and both want the
 * project name. `cache()` makes them share a single reading.
 *
 * Returns `null` rather than throwing away: a title is an ornament, a page does not have to fall because the RLS refused the reading or the project does not exist
 * not — the caller falls back on the translated generic wording.
 */
export const projectName = cache(async (id: string): Promise<string | null> => {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("projects")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    return data?.name ?? null;
  } catch {
    return null;
  }
});
