import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Nom d'un projet, pour les titres de page (MIN-95).
 *
 * Les `generateMetadata` s'empilent : celui de `projects/[id]/layout.tsx` et
 * celui de son sous-layout (`triage`, `objectives`, `settings`, `feedback`)
 * s'exécutent tous les deux pour une même requête, et tous les deux veulent le
 * nom du projet. `cache()` leur fait partager une seule lecture.
 *
 * Renvoie `null` plutôt que de jeter : un titre est un ornement, une page n'a
 * pas à tomber parce que la RLS a refusé la lecture ou que le projet n'existe
 * pas — l'appelant retombe sur le libellé générique traduit.
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
