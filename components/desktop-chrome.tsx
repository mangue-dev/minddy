"use client";

import { useEffect } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import { useAffirmWindowButtons } from "@/lib/use-window-buttons";
import { startDesktopTrace } from "@/lib/desktop/trace";

/**
 * Marque le document quand il est rendu DANS l'app de bureau (MIN-291).
 *
 * Une seule chose en dépend, et elle ne peut pas se faire autrement : **les
 * zones par lesquelles on déplace la fenêtre**. La barre de titre native est
 * masquée (`titleBarStyle: "hiddenInset"`), pour que l'app n'ait pas une bande
 * grise au-dessus de son propre en-tête ; en échange, macOS ne sait plus par où
 * la saisir, et c'est à la page de le dire — `-webkit-app-region: drag` est une
 * propriété CSS, elle ne peut venir que d'ici. Sans ça, la fenêtre ne se déplace
 * pas du tout : c'était le cas au premier essai.
 *
 * L'attribut est posé sur `<html>` par un effet, jamais au rendu : le pont
 * n'existe pas côté serveur, et le supposer ferait diverger l'hydratation. Les
 * règles qui le lisent vivent dans app/globals.css, section « app de bureau ».
 *
 * Il porte une seconde chose, pour la même raison qu'il porte la première : il
 * est monté au layout RACINE, donc sur tous les écrans — la connexion, `/f/`,
 * `/p/`, la page 404 comprises. C'est ce qui lui permet de réaffirmer au main
 * process ce que le document veut des feux macOS (MIN-304) ; le composant qui
 * les dessine, lui, ne vit que sous l'app authentifiée.
 */
export function DesktopChrome() {
  useAffirmWindowButtons();

  useEffect(() => {
    if (!getDesktopBridge()) return;
    const root = document.documentElement;
    root.setAttribute("data-desktop-app", "");
    return () => root.removeAttribute("data-desktop-app");
  }, []);

  // La trace de MIN-307, éteinte par défaut : elle ne s'installe qu'avec
  // `localStorage.minddy.trace = "1"`, et seulement dans la coquille. Montée
  // ici parce que c'est le composant qui garantit déjà les deux conditions.
  useEffect(() => startDesktopTrace(), []);

  return null;
}
