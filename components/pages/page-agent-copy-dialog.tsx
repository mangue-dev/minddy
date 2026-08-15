"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Textarea,
} from "mangue-ui";
import { FormDialog } from "@/components/form-dialog";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";

/**
 * « Copier pour l'agent » : le dialog qui demande — sans l'exiger — ce qu'on
 * veut voir fait de cette page.
 *
 * Cousin du prompt personnalisé d'un ticket
 * ([custom-prompt-dialog.tsx](components/agent/custom-prompt-dialog.tsx)), et
 * volontairement PAS le même composant, pour la règle qui les sépare : là-bas
 * la consigne est le geste (un bouton « Personnalisé » sans consigne ne veut
 * rien dire, le bouton reste donc désactivé tant que le champ est vide), ici
 * elle est FACULTATIVE — copier une page pour la donner à un agent est déjà un
 * geste complet, et le champ ne fait que l'armer. D'où un bouton toujours
 * actif, et une paire de composants qui ne peuvent pas fusionner sans que l'un
 * des deux mente.
 *
 * Le champ prend le focus à l'ouverture : ⌘⇧L puis ⌘Entrée copie sans consigne,
 * ⌘⇧L puis une phrase puis ⌘Entrée copie avec. Le geste rapide reste rapide.
 *
 * « Annuler » est là bien qu'Échap ferme déjà : la sortie d'un dialog doit être
 * VISIBLE. Sans bouton, on ne quitte l'écran qu'en connaissant la touche, ou en
 * cliquant à l'extérieur — deux gestes que rien à l'écran n'annonce.
 */
export function PageAgentCopyDialog({
  open,
  pageTitle,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** Le titre est RAPPELÉ dans le sous-titre : le dialog s'ouvre aussi au
      clavier, depuis n'importe où dans la page — on doit voir ce qu'on copie. */
  pageTitle: string;
  onOpenChange: (open: boolean) => void;
  /** La consigne, telle quelle (le rognage vit dans le constructeur de
      prompt) ; chaîne vide = on ne demande rien. */
  onSubmit: (instructions: string) => void;
}) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const isSend = useIsSendShortcut();
  const [instructions, setInstructions] = useState("");

  // Chaque ouverture repart d'un champ vide : une consigne est écrite pour UNE
  // copie, la retrouver à la suivante ferait partir l'ancienne par mégarde.
  useEffect(() => {
    if (open) setInstructions("");
  }, [open]);

  const submitLabel = instructions.trim()
    ? t("copyWithInstructions")
    : t("copyLinkOnly");

  const submit = () => {
    onSubmit(instructions);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("copyForAgent")}
      description={t("copyForAgentDescription", { title: pageTitle })}
      className="sm:max-w-lg"
      submitLabel={submitLabel}
      cancelLabel={tCommon("cancel")}
      onSubmit={submit}
      dictation={{
        onTranscription: (text) => setInstructions((value) => `${value}${value ? " " : ""}${text}`),
      }}
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
        placeholder={t("copyForAgentPlaceholder")}
        rows={5}
        aria-label={t("copyForAgentLabel")}
      />
    </FormDialog>
  );
}
