"use client";

import { cn } from "mangue-ui";
import { IsoIcon, type SceneIcon } from "@/components/illustrations/iso-icon";

/**
 * A wizard's choice card: an isometric block, a label, a
 * description when the option requires one.
 *
 * It is the drawing that makes the choice, the label confirms — hence the illustration
 * PLACED on the card instead only framed: no background, no net, the background of the
 * card runs from one end to the other and the block floats in it.
 *
 * The alignment of the text follows what is to be read. A single label is centered
 * under its design; as soon as a description accompanies it, everything goes to the left —
 * two or three centered lines are poorly read, the eye loses the beginning of
 * each line.
 *
 * To place in a container `role="radiogroup"`: these cards are the options
 * of the same choice, not independent buttons.
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
  /** What the option implies, when the wording is not enough. */
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
        // `active:scale`: the card is tapped as well as clicked, and
        // finger there is no hover to say that the gesture was carried out. It's a
        // <button> handwritten, so the global rule of globals.css — which
        // aims for `[data-slot="button"]` — doesn't hit it. 0.99 and not 0.97:
        // the depth is adjusted to the size, and this is large.
        "group flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card outline-none transition-all hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.99] motion-reduce:active:scale-100",
        selected ? "border-brand/50" : "border-border hover:border-brand/40",
      )}
    >
      {/* A single column, two explicit gaps: as much air above the
 drawing as below the text, and a clear gap between the two. */}
      <span className="flex flex-col gap-4 px-5 py-6">
        <IsoIcon
          icon={icon}
          // 200 ms, not 500: beyond ~300 ms, interaction feedback ceases
          // to be a return and becomes an animation that we watch — and on
          // mobile, where the hover remains stuck after pressing, we looked at it
          // Really. It is the CHILD who moves and not the card: a parent
          // that grows under the cursor pulls out from underneath and flashes
          // its own hover state.
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
