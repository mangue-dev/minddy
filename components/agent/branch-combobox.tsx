"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, GitBranch } from "lucide-react";
import {
  Button,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  commandFilter,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import {
  useIssueRepoBranchesQuery,
  useProjectRepoBranchesQuery,
} from "@/lib/use-repo-branches-query";

/**
 * Picker de la branche de BASE d'une session d'agent — le pendant du
 * ModelCombobox (variante compacte uniquement : il ne vit que dans la barre du
 * composer). L'agent COPIE cette branche pour créer son espace de travail ;
 * `value` vaut "" pour « la branche par défaut du dépôt », sinon un nom de
 * branche du listing. Choix possible seulement au lancement (phase compose,
 * lignée neuve) — partout ailleurs le picker est un chip verrouillé + tooltip,
 * comme le modèle. Pas de saisie libre : une branche inexistante ferait
 * échouer le clone, le listing fait foi.
 */

const MAX_RESULTS = 50;

export function BranchCombobox({
  issueId = null,
  projectId = null,
  value,
  onChange,
  defaultLabel,
  defaultHint,
  placeholder,
  emptyLabel,
  loadingLabel,
  disabled,
  disabledTooltip,
  lockedBranch,
}: {
  /** Ancrage ISSUE du listing (sessions de ticket). Exclusif avec `projectId`. */
  issueId?: string | null;
  /** Ancrage PROJET du listing (compose d'un run carnet, MIN-84). */
  projectId?: string | null;
  /** "" = branche par défaut du dépôt ; sinon un nom de branche. */
  value: string;
  onChange: (value: string) => void;
  /** Libellé de repli tant que la branche par défaut n'est pas connue. */
  defaultLabel: string;
  /** Aparté sur l'option par défaut (« défaut »). */
  defaultHint: string;
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  disabled?: boolean;
  /** Tooltip du chip verrouillé (branche figée pour la session / lignée héritée). */
  disabledTooltip?: string;
  /**
   * Branche affichée par le chip verrouillé (ex. `base_branch` de la run live,
   * ou la base de la lignée héritée). Repli : `value`, puis la branche par défaut.
   */
  lockedBranch?: string | null;
}) {
  // Chip verrouillé avec une branche connue → aucun listing à charger : on ne
  // paie l'appel provider que quand le picker est interactif (ou qu'il faut
  // résoudre le défaut à afficher). Deux ancrages exclusifs (issue ou projet),
  // les deux hooks restent appelés inconditionnellement (règles des hooks).
  const skipListing = !!(disabled && lockedBranch);
  const issueBranches = useIssueRepoBranchesQuery(skipListing ? null : issueId);
  const projectBranches = useProjectRepoBranchesQuery(
    skipListing || issueId ? null : projectId,
  );
  const { branches, defaultBranch, loading } = issueId ? issueBranches : projectBranches;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return branches.slice(0, MAX_RESULTS);
    return branches
      .map((b) => ({ b, score: commandFilter(b, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.b);
  }, [branches, query]);

  const select = (next: string) => {
    // Choisir la branche par défaut = suivre le défaut ("").
    onChange(next === defaultBranch ? "" : next);
    setQuery("");
    setOpen(false);
  };

  // Verrouillé : chip statique + tooltip, SANS popover (même montage que le
  // ModelCombobox — le <span> extérieur porte le hover, un bouton `disabled`
  // n'émettant pas d'événement pointer).
  if (disabled && disabledTooltip) {
    const shown = lockedBranch || value || defaultBranch || defaultLabel;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className="pointer-events-none flex h-8 shrink items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-foreground/45">
              <GitBranch className="size-3.5 shrink-0" />
              <span className="max-w-[9rem] truncate">{shown}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-8 shrink gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
        >
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">
            {value || defaultBranch || defaultLabel}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          {/* mt-1.5 / px-1 : mêmes retraits que le picker de modèle. */}
          <CommandList className="mt-1.5 px-1">
            {results.map((b) => {
              const selected = value === b || (!value && b === defaultBranch);
              return (
                <CommandItem key={b} value={b} onSelect={() => select(b)}>
                  <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate" title={b}>
                    {b}
                  </span>
                  {b === defaultBranch ? (
                    <span className="shrink-0 text-xs text-muted-foreground/70">
                      {defaultHint}
                    </span>
                  ) : null}
                  <Check
                    className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
                  />
                </CommandItem>
              );
            })}
            {results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                {loading ? (
                  <>
                    <Spinner />
                    {loadingLabel}
                  </>
                ) : (
                  emptyLabel
                )}
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
