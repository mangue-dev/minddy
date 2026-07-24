"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";

/**
 * Applique le thème AVANT le premier paint — le ThemeProvider de mangue-ui ne le
 * fait qu'en useEffect, d'où un flash light→dark à chaque chargement, surtout
 * visible sur les pages publiques anonymes. Même logique que lui : localStorage
 * "mangue-ui-theme", défaut piloté par le serveur ("dark" pour l'app, "system"
 * pour le public — MIN-60).
 *
 * Le script est injecté via `useServerInsertedHTML` — en DUR dans le <head>
 * streamé, HORS de l'arbre React — et le composant ne rend rien. Un <script>
 * rendu par un composant ferait râler React 19 à chaque re-rendu client du root
 * layout (« Scripts inside React components are never executed when rendering on
 * the client » : refresh RSC, bascule de locale, transition public↔app), alors
 * qu'il ne doit s'exécuter qu'au parse du document initial. Ici : même position,
 * même timing avant-paint, zéro élément géré par React.
 */
export function ThemeInitScript({ defaultTheme }: { defaultTheme: "dark" | "system" }) {
  // Le callback peut être appelé à chaque flush du stream : on n'insère qu'une fois.
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("mangue-ui-theme")||"${defaultTheme}";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.toggle("dark",${
            defaultTheme === "system"
              ? `matchMedia("(prefers-color-scheme: dark)").matches`
              : "true"
          });}})();`,
        }}
      />
    );
  });
  return null;
}
