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
 *
 * ── La couleur de la barre d'état (MIN-284) ──────────────────────────────────
 * Il pose aussi `<meta name="theme-color">`, qui teinte la barre d'état de l'app
 * installée et la barre d'outils de Chrome Android. Sans lui, minddy en sombre
 * s'ouvre sous un bandeau blanc : la teinte ne suit pas le thème et la couture
 * se voit — précisément le genre de détail jamais remarqué consciemment, et qui
 * fait qu'une web app a l'air d'une web app.
 *
 * Pourquoi ICI plutôt que dans l'export `viewport` du root layout, qui sait
 * pourtant écrire un `themeColor` : Next n'y accepte qu'une valeur STATIQUE, au
 * mieux déclinée par `prefers-color-scheme`. Or le thème de minddy ne se déduit
 * pas du système — il vient de localStorage, et l'app force `dark` par défaut
 * même sur un OS en clair (MIN-60). Une balise statique serait donc fausse pour
 * le cas le plus courant. Ce script, lui, a déjà résolu le thème réel : il n'a
 * qu'à écrire la couleur correspondante.
 *
 * L'observateur qui suit tient la balise à jour quand l'utilisateur bascule le
 * thème en cours de route. Il regarde la classe de <html> — ce que le
 * ThemeProvider de mangue-ui modifie — plutôt que de s'abonner à un provider qui
 * vit dans node_modules : un seul observateur, filtré sur un seul attribut.
 */

/**
 * `--background` des deux thèmes, en hexadécimal.
 *
 * `theme-color` est lu par le navigateur HORS de la page : il ne peut pas
 * pointer sur `var(--background)`, et tous les moteurs ne savent pas encore
 * parser `oklch()` dans cette balise. D'où la conversion, faite à la main —
 * `lib/mobile-touch.test.ts` relit les tokens de mangue-ui et échoue si l'un des
 * deux `--background` bouge, pour qu'on recalcule au lieu de dériver.
 */
const THEME_COLOR = {
  light: "#f5f7fb", // oklch(0.975 0.006 266)
  dark: "#070809", // oklch(0.135 0.003 250)
} as const;
export function ThemeInitScript({ defaultTheme }: { defaultTheme: "dark" | "system" }) {
  // Le callback peut être appelé à chaque flush du stream : on n'insère qu'une fois.
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var r=document.documentElement;function p(d){var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);}m.setAttribute("content",d?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");}try{var t=localStorage.getItem("mangue-ui-theme")||"${defaultTheme}";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);}catch(e){r.classList.toggle("dark",${
            defaultTheme === "system"
              ? `matchMedia("(prefers-color-scheme: dark)").matches`
              : "true"
          });}p(r.classList.contains("dark"));try{new MutationObserver(function(){p(r.classList.contains("dark"));}).observe(r,{attributes:true,attributeFilter:["class"]});}catch(e){}})();`,
        }}
      />
    );
  });
  return null;
}
