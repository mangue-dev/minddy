"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "mangue-ui/components/ui/popover";

/**
 * The little "i" in the lines of the price table: the detail of a line reads
 * on demand, without weighing on the line itself.
 *
 * Popover and not Tooltip, while the rest of the app uses Tooltip for this
 * gesture: a Radix tooltip only opens on hover and keyboard focus, and
 * its trigger closes ON CLICK — on the finger, the "i" would therefore do nothing of the
 * everything and the explanation would be lost for all mobile traffic, which is far
 * from being marginal on a pricing page. The popover opens by clicking
 * as well as by touch; hovering is added on top for the mouse, which has
 * no reason to lose immediate opening.
 */
export function PricingInfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The text IS the information: without it here, a screen reader
          // n'annoncerait qu'un bouton « i » sans contenu.
          aria-label={text}
          // Filtered on the mouse: when touched, the browser synthesizes a
          // hover just before the click, and the popover would reopen then
          // would close in the same tap.
          onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
          className="inline-flex shrink-0 rounded-full text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // The focus must neither enter the bubble when opening, nor return
        // place on the “i” when closing: hovering opens and closes it
        // without anyone asking, and the default behavior
        // would leave a focus ring behind each mouse pass. At
        // keyboard, nothing is lost: the focus has never left the button.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="max-w-[280px] text-xs leading-relaxed text-pretty text-muted-foreground"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
