"use client";

import {
  useAnyModalOpen,
  useHoldWindowButtons,
  useWideLayout,
  useWindowButtonsSlot,
} from "@/lib/use-window-buttons";

/**
 * Retire les boutons macOS tant qu'une boîte de dialogue est ouverte (MIN-291).
 *
 * Ils sont natifs : le système les dessine par-dessus la vue web, et **aucun
 * `z-index` ne les dépasse**. Un dialogue ou un wizard les gardait donc en
 * travers de son coin, par-dessus le voile et l'ombre — l'inverse exact de ce
 * qu'un modal raconte. On ne peut pas les faire passer derrière ; on peut les
 * retirer le temps qu'il est là, et c'est cohérent : pendant ce temps, la
 * fenêtre n'est de toute façon pas ce qu'on manipule.
 *
 * Aucun rendu, et rien du tout hors de l'app de bureau. Monté à côté des autres
 * effets de l'app dans app-providers.
 */
export function DesktopWindowButtons() {
  useHoldWindowButtons("modal", useAnyModalOpen());
  return null;
}

/**
 * La largeur que les boutons occupent dans le coin haut-gauche de la fenêtre :
 * de leur bord gauche (19) au bord droit de la dernière pastille (65 + 14 = 79),
 * plus une marge.
 *
 * C'est ce que réserve `.sidebar-brand-row[data-window-buttons]` dans
 * app/globals.css, ce que réserve l'en-tête en mode compact, et ce que la garde
 * du rail reconnaît comme « le pointeur est parti sur les boutons ». Un seul
 * chiffre, et il se relit avec `TRAFFIC_LIGHTS` (desktop/src/main.ts).
 */
export const WINDOW_BUTTONS_WIDTH = 84;

/**
 * Les LEURRES des boutons macOS (MIN-291).
 *
 * Trois pastilles inertes, dessinées exactement là où le système dessine les
 * vraies, et seulement quand celles-ci sont retirées le temps d'une boîte de
 * dialogue. Elles ne sont pas là pour tromper : elles sont là pour que **rien ne
 * saute**. Les vrais boutons sont natifs, rien ne passe devant eux, il faut donc
 * les retirer ; mais laisser leur place se refermer ferait glisser la marque (ou
 * le bouton retour de l'en-tête) à chaque ouverture de dialogue, pour un objet
 * qu'on ne regarde même pas. Les leurres, eux, passent sous le voile comme le
 * reste de l'app.
 *
 * **La géométrie est RELEVÉE, pas déduite.** On a d'abord repris les chiffres
 * qu'on donne à Electron (`trafficLightPosition`) et un pas supposé de 20 px :
 * faux, et ça se voyait. Une capture d'écran système, décodée pixel par pixel,
 * dit : bord gauche à 19, haut à 22, **14 px de diamètre**, **23 px de centre à
 * centre** — soit 9 px entre deux pastilles. Le seul chiffre que
 * `trafficLightPosition` donnait juste était son origine.
 *
 * `fixed` et non `absolute` : les vrais boutons appartiennent à la FENÊTRE, pas
 * au meuble qui leur garde la place. C'est ce qui permet de les rendre depuis la
 * barre latérale ou depuis l'en-tête sans deux géométries différentes — et ce
 * qui reste juste sur ultrawide, où la coquille est une carte centrée alors que
 * le système, lui, dessine toujours dans le coin de la fenêtre.
 *
 * `z-40`, donc SOUS le voile des dialogues (50) : c'est tout le but.
 *
 * Les couleurs sont celles du système, en dur : les mêmes en thème clair comme
 * en sombre, et elles n'appartiennent pas à minddy.
 *
 * `aria-hidden` : un lecteur d'écran n'a rien à annoncer ici, et surtout pas
 * trois boutons qui n'en sont pas.
 */
const DECOY_COLORS = ["#FF5F57", "#FEBC2E", "#28C840"];

export function WindowButtonDecoys() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-[22px] left-[19px] z-40 flex gap-[9px]"
    >
      {DECOY_COLORS.map((color) => (
        <span
          key={color}
          className="size-3.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/**
 * La place des boutons macOS DANS L'EN-TÊTE, sous 768 px (MIN-293).
 *
 * Sous cette largeur l'AppShell ne rend plus les barres latérales : le coin
 * haut-gauche de la fenêtre n'est plus la ligne de marque, c'est l'en-tête — et
 * les boutons y tombaient pile sur le bouton retour du fil d'Ariane, qui occupe
 * le même coin. Deux boutons superposés, dont un que la page ne peut même pas
 * recevoir.
 *
 * D'où ce coin de garde, monté dans la ligne compacte du fil d'Ariane : il
 * pousse le retour au-delà des pastilles, et dessine les leurres quand un
 * dialogue retire les vraies — le pendant exact de ce que fait la ligne de
 * marque, pour l'écran qui n'a pas de barre latérale.
 *
 * La largeur retranche le `px-4` de l'en-tête : c'est de là que part la ligne.
 */
const HEADER_PADDING_PX = 16;

export function HeaderWindowButtonsSlot() {
  const slot = useWindowButtonsSlot(!useWideLayout());
  if (!slot.reserved) return null;
  return (
    <>
      {slot.decoy && <WindowButtonDecoys />}
      <div
        aria-hidden
        className="shrink-0"
        style={{ width: WINDOW_BUTTONS_WIDTH - HEADER_PADDING_PX }}
      />
    </>
  );
}
