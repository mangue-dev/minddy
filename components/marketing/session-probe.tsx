"use client";

import { useEffect } from "react";

/**
 * Demande à Supabase si le visiteur a une session, et le dit à la nav (MIN-100).
 *
 * Ne rend rien. Existe uniquement pour que `@supabase/supabase-js` soit derrière
 * un `next/dynamic` — la nav le chargeait déjà par un `import()`, mais Turbopack
 * place la cible d'un `import()` nu dans le groupe de chunks INITIAL du
 * composant : mesuré sur la landing, 18 Ko gzippés du SDK partaient avec le
 * bundle de départ, devant l'image du LCP. Un `next/dynamic` produit, lui, un
 * vrai chunk paresseux (c'est déjà ce que fait `hero-shader.tsx` pour le WebGL).
 *
 * La nav ne le monte que si un cookie d'auth Supabase est présent : un visiteur
 * anonyme — l'immense majorité sur une landing — ne demande jamais ce chunk.
 */
export function SessionProbe({ onChange }: { onChange: (hasSession: boolean) => void }) {
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void import("@/lib/supabase").then(({ getSupabase }) => {
      if (!active) return;
      const supabase = getSupabase();
      void supabase.auth.getSession().then(({ data }) => {
        if (active) onChange(!!data.session);
      });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        onChange(!!session);
      });
      unsubscribe = () => subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [onChange]);

  return null;
}
