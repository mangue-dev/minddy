"use client";

import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  MobileNavItem,
} from "mangue-ui";
import { Plus } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useCreateActions } from "@/components/new-menu";

/**
 * Custom actions for the mobile bottom navbar (passed to <MobileNav actions>):
 * a Numo (assistant) launcher and a "+" create menu — the mobile replacements
 * for the desktop assistant FAB and the header "Nouveau" button. Rendered
 * between the navbar's Search and "More" buttons. Mirrors AutoKap's mobile nav.
 */
export function MobileNavActions() {
  const tk = useTranslations("Keyboard.shortcuts");
  const tn = useTranslations("Nav");
  const { toggle } = useAssistantPanel();
  const actions = useCreateActions();

  return (
    <>
      {/* Numo — opens the full-bleed assistant panel. Pas de pastille de
          contexte : le contexte de la page se lit dans le panneau (la puce
          au-dessus du composer), pas sur le bouton qui l'ouvre. */}
      <MobileNavItem label={tk("navAssistant")} onClick={() => toggle()}>
        {/* Statique : une animation d'attributs SVG en boucle sur une barre
            de navigation ne dit rien, et tourne même masquée (MIN-323). */}
        <NumoIcon animated={false} className="size-[22px] text-foreground" />
      </MobileNavItem>

      {/* Hairline divider (matches mangue-ui's internal PileDivider). */}
      <span aria-hidden className="h-6 w-px shrink-0 bg-border/70" />

      {/* "+" — create menu (issue / objective / project), opens upward. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <MobileNavItem label={tn("new")}>
            <Plus className="size-[22px]" strokeWidth={2} />
          </MobileNavItem>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-52">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <DropdownMenuItem
                key={action.key}
                disabled={action.disabled}
                onSelect={action.onSelect}
              >
                <Icon />
                {action.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
