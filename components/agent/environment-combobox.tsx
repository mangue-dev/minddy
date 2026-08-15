"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Cloud, FolderPlus, Laptop } from "lucide-react";
import {
  Button,
  Command,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "mangue-ui";
import type { LocalRepoRefusal } from "@/lib/desktop/local-repo";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * OÙ LA CONVERSATION TOURNE (MIN-359) — le quatrième chip du composer, à côté du
 * modèle, du raisonnement et de la branche.
 *
 * **Choisi au début d'une conversation, figé ensuite** (D1 de
 * [docs/audits/agent-local-2026-08-14.md](../../docs/audits/agent-local-2026-08-14.md)),
 * exactement comme ses trois voisins et pour la raison écrite depuis MIN-286 :
 * chaque environnement relit SA mémoire dans le checkpoint. Une conversation qui
 * changerait d'environnement en cours de vie ne perdrait pas un réglage, elle
 * perdrait son historique. D'où l'absence de repli à chaud : un run local qui ne
 * peut pas partir repart dans le cloud **avant son premier tour**, jamais après.
 *
 * ## Il n'apparaît que là où il veut dire quelque chose
 *
 * Pas de pont (donc pas d'app de bureau), pas de dossier attaché à ce projet sur
 * CETTE machine : le chip n'est pas rendu du tout. C'est l'appelant qui tranche,
 * avec `useLocalRepo` — un chip grisé promettrait une bascule qui n'existe pas,
 * et un membre du projet sur Windows n'a rien à comprendre ni à refuser.
 *
 * Quand un dossier est attaché mais devenu invalide (déplacé, disque démonté,
 * dépôt re-lié ailleurs), l'entrée « ma machine » se propose quand même — et
 * c'est en la choisissant qu'on rouvre le panneau système. Cacher l'option
 * laisserait quelqu'un sans aucun moyen de comprendre pourquoi elle a disparu.
 */

export type AgentEnvironment = "cloud" | "local";

/**
 * Pourquoi un dossier ne peut pas servir → ce que la personne lit.
 *
 * Exporté depuis ici et écrit dans le namespace `Agent`, alors que le second
 * lecteur est une carte de RÉGLAGES : les quatre refus sont les mêmes des deux
 * côtés, et les recopier sous `Settings` ferait quatre chaînes de plus dans deux
 * catalogues — c'est-à-dire quatre occasions de plus de les faire diverger.
 */
export const LOCAL_REPO_ERROR_KEYS: Record<LocalRepoRefusal, MessageKey<"Agent">> = {
  missing: "localRepoMissing",
  notGit: "localRepoNotGit",
  noRemote: "localRepoNoRemote",
  wrongRepo: "localRepoWrongRepo",
};

export function EnvironmentCombobox({
  value,
  onChange,
  folder,
  needsAttach = false,
  localAvailable = true,
  onAttach,
  disabled,
  disabledTooltip,
  bare = false,
}: {
  value: AgentEnvironment;
  onChange: (value: AgentEnvironment) => void;
  /** Le dossier attaché, pour que le chip dise LEQUEL et pas juste « local ». */
  folder?: string | null;
  /** Le dossier retenu ne vaut plus rien : choisir « ma machine » en redemande un. */
  needsAttach?: boolean;
  /** Faux dans le navigateur : le choix est visible mais nécessite l'app Mac. */
  localAvailable?: boolean;
  onAttach?: () => void;
  disabled?: boolean;
  /** Tooltip du chip verrouillé (environnement figé pour la conversation). */
  disabledTooltip?: string;
  /** Variante sans contour, pour la barre de contexte au-dessus du composer. */
  bare?: boolean;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const Icon = value === "local" ? Laptop : Cloud;
  // Le bouton nomme le type d'environnement, jamais le chemin concret. Le
  // dossier reste utile dans l'aide du menu, mais un chemin long rend le chip
  // instable et contredit le vocabulaire local/cloud de l'application.
  const label = value === "local" ? t("environmentLocal") : t("environmentCloud");

  // Verrouillé : chip statique + tooltip, SANS popover — le <span> extérieur
  // porte le hover, un bouton `disabled` n'émettant pas d'événement pointer
  // (même montage que les trois autres pickers du composer).
  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className={cn(
              "pointer-events-none flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/45",
              bare ? "bg-transparent" : "border border-border/60 bg-muted/40",
            )}>
              <Icon className="size-3.5 shrink-0" />
              <span className="max-w-40 truncate">{label}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  const pick = (next: AgentEnvironment) => {
    setOpen(false);
    // Le dossier ne vaut plus rien : on ne bascule PAS sur une promesse creuse,
    // on rouvre le panneau. C'est l'appelant qui rebranchera `value` si le
    // nouveau dossier passe.
    if (next === "local" && needsAttach) {
      onAttach?.();
      return;
    }
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={t("environment")}
          disabled={disabled}
          className={cn(
            "h-8 shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/80",
            bare ? "bg-transparent hover:bg-accent/50" : "border border-border/60 bg-muted/50 hover:bg-muted",
          )}
        >
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-40 truncate">{label}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Deux entrées seulement, mais chacune porte une GLOSE — contrairement au
          picker de raisonnement, où l'ordre des paliers dit déjà ce qu'ils
          valent. Ici les deux mots ne suffisent pas : « ma machine » ouvre un
          dossier réel, avec des fichiers réels, et personne ne doit avoir à
          l'apprendre au premier run. */}
      <PopoverContent className="min-w-64 rounded-xl p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList className="p-1">
            <CommandItem value="cloud" onSelect={() => pick("cloud")}>
              <Cloud className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">
                <span className="block">{t("environmentCloud")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("environmentCloudHint")}
                </span>
              </span>
              <Check
                className={cn("size-4 shrink-0", value === "cloud" ? "opacity-100" : "opacity-0")}
              />
            </CommandItem>
            <CommandItem
              value="local"
              aria-disabled={!localAvailable}
              className={cn(!localAvailable && "cursor-not-allowed opacity-50")}
              onSelect={() => {
                if (localAvailable) pick("local");
              }}
            >
              {needsAttach ? (
                <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Laptop className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1">
                <span className="block">{t("environmentLocal")}</span>
                <span className="block text-xs text-muted-foreground">
                  {!localAvailable ? (
                    <>
                      {t("environmentLocalDesktopHint")} {" "}
                      <Link
                        href="/download"
                        className="font-medium text-foreground underline underline-offset-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {t("environmentLocalDownload")}
                      </Link>
                    </>
                  ) : needsAttach
                    ? t("environmentLocalAttach")
                    : t("environmentLocalHint", { folder: folder ?? "" })}
                </span>
              </span>
              <Check
                className={cn(
                  "size-4 shrink-0",
                  value === "local" && !needsAttach ? "opacity-100" : "opacity-0",
                )}
              />
            </CommandItem>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
