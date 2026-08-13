"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "mangue-ui";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";

/**
 * Où part la consigne écrite ici : le presse-papier (« Copier le prompt » →
 * « Personnalisé ») ou le composer de l'agent Numo (« Lancer l'agent Numo » →
 * « Personnalisé »). Seuls le bouton et le sous-titre en dépendent : le texte
 * saisi est le même des deux côtés — ce qu'on veut voir fait sur ce ticket.
 */
export type CustomPromptTarget = "copy" | "launch";

/**
 * Le dialog de l'entrée « Personnalisé » des deux sous-menus agent d'un ticket.
 * Il ne demande QUE la consigne : le contexte du ticket (champs, plan,
 * commentaires) est fourni par minddy autour d'elle — le prompt copié l'inline
 * dans son bloc `<issue>`, l'agent Numo le reçoit à l'ouverture de la session.
 *
 * Rendu à l'intérieur d'une carte cliquable ET draggable : les événements React
 * remontent l'arbre des composants MALGRÉ le portail, d'où le `stopPropagation`
 * sur le contenu — même précaution que `IssueContextMenu`, plus le `mousedown`
 * (sans lui, sélectionner du texte à la souris dans le champ armerait le
 * capteur de drag de la carte, qui se déclenche à 6 px).
 */
export function CustomPromptDialog({
  target,
  onOpenChange,
  onSubmit,
}: {
  /** Cible ouverte ; `null` = dialog fermé. */
  target: CustomPromptTarget | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (instructions: string, target: CustomPromptTarget) => void;
}) {
  const t = useTranslations("Agent");
  const isSend = useIsSendShortcut();
  const tIssueUI = useTranslations("IssueUI");
  const [instructions, setInstructions] = useState("");

  // Chaque ouverture repart d'un champ vide : une consigne est écrite pour UN
  // lancement, la retrouver au suivant ferait relancer l'ancienne par mégarde.
  useEffect(() => {
    if (target) setInstructions("");
  }, [target]);

  const submitLabel = target === "launch" ? t("menuLaunch") : tIssueUI("copyAsPrompt");

  const submit = () => {
    const trimmed = instructions.trim();
    if (!trimmed || !target) return;
    onSubmit(trimmed, target);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{t("customPromptTitle")}</DialogTitle>
          <DialogDescription>
            {target === "launch"
              ? t("customPromptLaunchDescription")
              : t("customPromptCopyDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <Textarea
            autoFocus
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            // ⌘/Ctrl+Entrée valide ; Entrée seule reste un retour à la ligne,
            // une consigne tenant souvent sur plusieurs — sauf si le compte a
            // mis l'envoi sur Entrée, où Maj+Entrée prend le relais.
            onKeyDown={(e) => {
              if (isSend(e)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("customPromptPlaceholder")}
            rows={6}
            aria-label={t("customPromptTitle")}
          />
          <DialogFooter>
            <SendShortcutTooltip label={submitLabel}>
              <Button type="submit" disabled={!instructions.trim()}>
                {submitLabel}
              </Button>
            </SendShortcutTooltip>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
