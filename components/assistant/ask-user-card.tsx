"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  IconButton,
  Input,
  cn,
} from "mangue-ui";
import { Square, SquareCheck, X } from "lucide-react";
import { SendShortcutTooltip, isSendShortcut } from "@/components/send-shortcut";
import {
  composeAskUserReply,
  type AskUserQuestion,
} from "@/lib/ask-user";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Carte de questions `ask_user` (MIN-86) — partagée entre le chat Numo et le fil
 * de l'agent de code, en parité avec l'outil AskUserQuestion de Claude Code :
 * PAGINÉE (un set de questions à la fois, chips-onglets + Précédent/Suivant),
 * options en liste verticale avec description et badge « Recommandé », radio
 * (choix exclusif, cercle plein quand coché) ou checkboxes (`multiSelect`),
 * « Autre chose… » qui se transforme en champ de saisie inline, un ENVOI GLOBAL
 * (un seul bouton Envoyer valide l'ensemble) et une croix pour PASSER les
 * questions sans répondre.
 *
 * La carte VIVANTE remplace le composer (pattern Claude Code/Codex) — rendue par
 * la surface hôte avec `onAnswer`/`onSkip`. Sans `onAnswer`, elle est le simple
 * enregistrement inerte d'une question passée, affiché dans le fil.
 */

interface AskUserCardProps {
  questions: AskUserQuestion[];
  /** Envoie la réponse composée comme message utilisateur. Absent = carte inerte. */
  onAnswer?: (text: string) => void;
  /** Passe les questions sans répondre (croix en haut à droite de la carte). */
  onSkip?: () => void;
}

/** Brouillon de réponse d'une question : options cochées + saisie libre. */
type Draft = { values: string[]; other: boolean; otherValue: string };

/** Délai avant l'avance automatique au set suivant après un choix radio : le
    temps de VOIR l'option se cocher — sans lui, le changement d'onglet
    immédiat ressemble à un bug. */
const AUTO_ADVANCE_MS = 250;

const EMPTY_DRAFT: Draft = { values: [], other: false, otherValue: "" };

function draftAnswered(d: Draft | undefined): boolean {
  return !!d && (d.values.length > 0 || d.otherValue.trim().length > 0);
}

/** Réponse d'une question : options cochées + éventuelle saisie libre, jointes. */
function draftAnswer(d: Draft | undefined): string {
  if (!d) return "";
  const parts = [...d.values];
  if (d.otherValue.trim()) parts.push(d.otherValue.trim());
  return parts.join(", ");
}

export function AskUserCard({ questions, onAnswer, onSkip }: AskUserCardProps) {
  const t = useTranslations("ToolCall");
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Avance automatique différée (choix radio) — annulée par toute interaction
  // intermédiaire (désélection, navigation manuelle) et au démontage.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    []
  );
  const clearAdvance = () => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };
  const goTo = (i: number) => {
    clearAdvance();
    setCurrent(i);
  };

  if (questions.length === 0) return null;

  const live = !!onAnswer && !submitted;
  const sets = questions.length;
  const page = Math.min(current, sets - 1);
  const q = questions[page];
  const draft = drafts[page];
  const isLast = page === sets - 1;
  const allAnswered = questions.every((_, i) => draftAnswered(drafts[i]));
  const showSkip = live && !!onSkip;
  // Sans options, la question appelle une réponse libre : le champ s'affiche
  // directement, sans passer par la ligne « Autre chose… ».
  const freeOnly = q.options.length === 0;

  const submit = () => {
    if (!onAnswer || !allAnswered) return;
    const entries = questions.map((question, i) => ({
      question: question.question,
      answer: draftAnswer(drafts[i]),
    }));
    setSubmitted(true);
    onAnswer(composeAskUserReply(entries));
  };

  const skip = () => {
    if (!showSkip) return;
    setSubmitted(true);
    onSkip!();
  };

  const setDraft = (index: number, next: Draft) =>
    setDrafts((prev) => ({ ...prev, [index]: next }));

  const pickOption = (label: string) => {
    if (!live) return;
    const d = drafts[page] ?? EMPTY_DRAFT;
    if (q.multiSelect) {
      // Checkbox : on combine librement, la saisie libre reste indépendante.
      const values = d.values.includes(label)
        ? d.values.filter((v) => v !== label)
        : [...d.values, label];
      setDraft(page, { ...d, values });
    } else {
      // Radio : choix exclusif — sélectionner ferme « Autre chose… », re-cliquer désélectionne.
      const selecting = !d.values.includes(label);
      clearAdvance();
      setDraft(page, {
        values: selecting ? [label] : [],
        other: false,
        otherValue: "",
      });
      // Répondre en radio fait avancer au set suivant tout seul, après un court
      // délai qui laisse VOIR la sélection (les checkboxes restent manuelles —
      // on en coche plusieurs). Jamais d'envoi automatique : depuis le dernier
      // set, c'est le bouton Envoyer qui valide.
      if (selecting && sets > 1 && !isLast) {
        advanceTimer.current = setTimeout(() => {
          advanceTimer.current = null;
          setCurrent(page + 1);
        }, AUTO_ADVANCE_MS);
      }
    }
  };

  const pickOther = () => {
    if (!live) return;
    clearAdvance();
    const d = drafts[page] ?? EMPTY_DRAFT;
    if (q.multiSelect) {
      // Checkbox : « Autre chose… » se coche/décoche comme une option.
      setDraft(page, d.other ? { ...d, other: false, otherValue: "" } : { ...d, other: true });
    } else {
      setDraft(page, { values: [], other: true, otherValue: "" });
    }
  };

  // Indicateur de sélection : radio = cercle PLEIN quand coché ; checkbox = case.
  const OptionIcon = ({ selected }: { selected: boolean }) => {
    if (q.multiSelect) {
      const Icon = selected ? SquareCheck : Square;
      return (
        <Icon
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            selected ? "text-primary" : "opacity-50"
          )}
        />
      );
    }
    // Radio classique : anneau + espace + point plein quand coché. Encre
    // (`primary`), comme la Checkbox de mangue-ui — pas de couleur de marque.
    return (
      <span
        aria-hidden
        className={cn(
          "mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-muted-foreground/40"
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
    );
  };

  const optionRow = (
    label: string,
    description: string,
    recommended: boolean,
    selected: boolean,
    onClick: () => void
  ) => (
    <button
      key={label}
      type="button"
      disabled={!live}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
        selected
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        !live && "cursor-default opacity-60 hover:bg-transparent"
      )}
    >
      <OptionIcon selected={selected} />
      <span className="flex min-w-0 flex-col">
        <span className="leading-snug">
          {label}
          {recommended && (
            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-foreground">
              {t("recommendedBadge")}
            </span>
          )}
        </span>
        {description && (
          <span className="text-xs leading-snug opacity-70">{description}</span>
        )}
      </span>
    </button>
  );

  // `withIcon` : l'input REMPLACE la ligne « Autre chose… » (radio / question
  // libre) et garde son indicateur ; sans icône, il s'affiche SOUS la ligne
  // cochée (multi-sélection).
  const otherInput = (withIcon: boolean) => (
    <div className={cn("flex items-center gap-2 py-1", withIcon ? "px-2.5" : "pl-8 pr-2.5")}>
      {withIcon && (
        <span
          aria-hidden
          className={cn(
            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
            draft?.otherValue.trim()
              ? "border-primary"
              : "border-muted-foreground/40"
          )}
        >
          {!!draft?.otherValue.trim() && (
            <span className="h-2 w-2 rounded-full bg-primary" />
          )}
        </span>
      )}
      <Input
        autoFocus={!freeOnly}
        value={draft?.otherValue ?? ""}
        disabled={!live}
        placeholder={t("freeAnswerPlaceholder")}
        onChange={(e) =>
          setDraft(page, {
            ...(drafts[page] ?? EMPTY_DRAFT),
            other: true,
            otherValue: e.target.value,
          })
        }
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          // Entrée : avance au set suivant, ou envoie depuis le dernier.
          if (!isLast) goTo(page + 1);
          else if (allAnswered) submit();
        }}
        className="h-7 flex-1 bg-background text-sm"
      />
    </div>
  );

  return (
    // La carte prend la PLACE du composer : elle en reprend la surface (carte
    // bordée, ombre légère, rounded-2xl) plutôt qu'une teinte de marque — elle
    // suit ainsi le thème clair/sombre comme le reste de l'interface.
    //
    // Elle en reprend aussi le RACCOURCI : ⌘/Ctrl+Entrée envoie les réponses,
    // depuis n'importe lequel de ses champs. Entrée seule garde son rôle de
    // navigation (question suivante) — dans un champ d'une ligne, elle n'a pas
    // de saut de ligne à insérer.
    <div
      className="relative rounded-2xl border border-border bg-card px-3.5 py-3 text-sm shadow-sm"
      onKeyDown={(e) => {
        if (!isSendShortcut(e) || !live || !allAnswered) return;
        e.preventDefault();
        submit();
      }}
    >
      {/* Croix « passer les questions » — coin haut droit de la carte. */}
      {showSkip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={skip}
              aria-label={t("skipQuestions")}
              className="absolute right-2 top-2 size-6 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {t("skipQuestions")}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Chips-onglets des sets — uniquement à plusieurs questions. */}
      {sets > 1 && (
        <div
          className={cn(
            "mb-2.5 flex flex-wrap items-center gap-1.5 border-b border-border pb-2.5",
            showSkip && "pr-7"
          )}
        >
          {questions.map((question, i) => {
            const active = i === page;
            return (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  "cursor-pointer rounded-full border px-2 py-0.5 text-xs transition-colors",
                  active
                    ? "border-border bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <span className="block max-w-24 truncate">
                  {question.header || `${i + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Set courant : question + options en liste verticale. */}
      <div className="flex flex-col gap-1.5">
        <p
          className={cn(
            "leading-relaxed",
            sets === 1 && showSkip && "pr-7"
          )}
        >
          {q.question}
        </p>
        <div className="flex flex-col gap-0.5">
          {q.options.map((o) =>
            optionRow(
              o.label,
              o.description,
              o.recommended,
              !!draft && draft.values.includes(o.label),
              () => pickOption(o.label)
            )
          )}
          {/* « Autre chose… » : la ligne se transforme en champ de saisie au clic. */}
          {freeOnly || (draft?.other && !q.multiSelect)
            ? otherInput(true)
            : optionRow(t("otherOption"), "", false, !!draft?.other, pickOther)}
          {/* En multi-sélection, « Autre chose… » reste cochée ET ouvre le champ dessous. */}
          {q.multiSelect && draft?.other && otherInput(false)}
        </div>
      </div>

      {/* Pied : navigation libre entre les sets, envoi GLOBAL au dernier. */}
      {(sets > 1 || live) && (
        <div className="mt-1 flex items-center justify-between gap-2 pt-1.5">
          <div>
            {sets > 1 && page > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => goTo(page - 1)}
                className="h-7 rounded-full px-3 text-muted-foreground"
              >
                {t("answerPrev")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sets > 1 && !isLast && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goTo(page + 1)}
                className="h-7 rounded-full px-3"
              >
                {t("answerNext")}
              </Button>
            )}
            {live && (isLast || allAnswered) && (
              <SendShortcutTooltip label={t("answerSend")}>
                <Button
                  type="button"
                  size="sm"
                  disabled={!allAnswered}
                  onClick={submit}
                  className="h-7 rounded-full px-3.5"
                >
                  {t("answerSend")}
                </Button>
              </SendShortcutTooltip>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
