"use client";

import { Textarea } from "mangue-ui";
import { useTranslations } from "next-intl";

import { DictateButton } from "@/components/ai-elements/dictate-button";

/** Plafond dur d'une instruction, côté serveur comme ici (`MAX_PROMPT_LENGTH`). */
const MAX_PROMPT_LENGTH = 20000;

/**
 * Le champ d'INSTRUCTION d'une routine — le même à la création (étape `job` du
 * wizard) et à la modification (le volet de détail). Un seul composant parce
 * qu'on réécrit une instruction dans exactement les conditions où on l'a
 * écrite : même dictée, même plafond de saisie, même hauteur.
 *
 * **La hauteur est bornée, et c'est le point.** Le `Textarea` de mangue-ui est
 * en `field-sizing-content` : il grandit avec son contenu, sans fin. Une
 * instruction de routine étant un cahier des charges de plusieurs milliers de
 * signes, le champ atteignait plusieurs milliers de pixels et poussait tout ce
 * qui le suivait — la cadence, et surtout le bouton « Enregistrer » — hors de
 * l'écran. `max-h-64` l'arrête à une dizaine de lignes ; au-delà, c'est le
 * champ qui défile, comme n'importe quel éditeur de texte.
 *
 * `pb-12` réserve le coin où flotte le bouton de dictée : sans lui, la dernière
 * ligne passe dessous.
 */
export function RoutinePromptField({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Grise la dictée pendant une écriture en cours (création, enregistrement). */
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations("Routines");

  return (
    <div className="relative">
      <Textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("promptPlaceholder")}
        aria-label={t("promptLabel")}
        maxLength={MAX_PROMPT_LENGTH}
        rows={6}
        className="max-h-64 min-h-36 resize-none overflow-y-auto pb-12"
      />
      {/* La dictée s'AJOUTE à ce qui est déjà là, elle ne le remplace pas : on
          complète une instruction à la voix aussi souvent qu'on en dicte une. */}
      <DictateButton
        floating
        disabled={disabled}
        onTranscription={(text) =>
          onChange(value.trim() ? `${value.trim()} ${text}` : text)
        }
      />
    </div>
  );
}
