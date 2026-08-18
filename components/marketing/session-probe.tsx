"use client";

import { useEffect } from "react";

/**
 * Asks Supabase if the visitor has a session, and tells the nav (MIN-100).
 *
 * Returns nothing. Exists only so that `@supabase/supabase-js` is behind
 * a `next/dynamic` — the nav already loaded it with a `import()`, but Turbopack
 * places the target of a bare `import()` in the INITIAL chunk group of the
 * component: measured on the landing, 18 KB gzipped from the SDK left with the
 * starting bundle, in front of the LCP image. A `next/dynamic` produces a
 * real lazy chunk (this is already what `hero-shader.tsx` does for WebGL).
 *
 * The nav only mounts it if a Supabase auth cookie is present: an anonymous visitor
 * — the vast majority on a landing — never ask for this chunk.
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
