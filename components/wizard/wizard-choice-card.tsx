"use client";

import { cn } from "mangue-ui";
import { IsoIcon, type SceneIcon } from "@/components/illustrations/iso-icon";

/**
 * Une carte de choix de wizard : un bloc isométrique, un libellé, une
 * description quand l'option en demande une.
 *
 * C'est le dessin qui fait le choix, le libellé confirme — d'où l'illustration
 * POSÉE sur la carte plutôt qu'encadrée : aucun fond, aucun filet, le fond de la
 * carte court d'un bout à l'autre et le bloc flotte dedans.
 *
 * L'alignement du texte suit ce qu'il y a à lire. Un libellé seul se centre
 * sous son dessin ; dès qu'une description l'accompagne, tout passe à gauche —
 * deux ou trois lignes centrées se lisent mal, le regard perd le début de
 * chaque ligne.
 *
 * À poser dans un conteneur `role="radiogroup"` : ces cartes sont les options
 * d'un même choix, pas des boutons indépendants.
 */
export function WizardChoiceCard({
  icon,
  label,
  description,
  selected,
  onSelect,
}: {
  icon: SceneIcon;
  label: string;
  /** Ce que l'option implique, quand le libellé ne suffit pas. */
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        // `active:scale` : la carte est tapée au doigt autant que cliquée, et au
        // doigt il n'y a pas de survol pour dire que le geste a porté. C'est un
        // <button> écrit à la main, donc la règle globale de globals.css — qui
        // vise `[data-slot="button"]` — ne l'atteint pas. 0.99 et pas 0.97 :
        // l'enfoncement se règle sur la taille, et celle-ci est grande.
        "group flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card outline-none transition-all hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.99] motion-reduce:active:scale-100",
        selected ? "border-brand/50" : "border-border hover:border-brand/40",
      )}
    >
      {/* Une seule colonne, deux écarts explicites : autant d'air au-dessus du
          dessin qu'en dessous du texte, et un intervalle net entre les deux. */}
      <span className="flex flex-col gap-4 px-5 py-6">
        <IsoIcon
          icon={icon}
          // 200 ms, pas 500 : au-delà de ~300 ms un retour d'interaction cesse
          // d'être un retour et devient une animation qu'on regarde — et sur
          // mobile, où le survol reste collé après l'appui, on le regardait
          // vraiment. C'est bien l'ENFANT qui bouge et pas la carte : un parent
          // qui grandit sous le curseur se retire de dessous et fait clignoter
          // son propre survol.
          className="w-full max-w-36 self-center transition-transform duration-200 ease-out group-hover:scale-[1.04]"
        />
        <span
          className={cn(
            "flex flex-col gap-1",
            description ? "text-left" : "items-center text-center",
          )}
        >
          <span className="text-base font-medium">{label}</span>
          {description && (
            <span className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
