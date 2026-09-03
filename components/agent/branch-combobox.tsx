"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronsUpDown, GitBranch } from "lucide-react";
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
} from "mangue-ui";
import {
  useIssueRepoBranchesQuery,
  useProjectRepoBranchesQuery,
} from "@/lib/use-repo-branches-query";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * Picker of the BASE branch of an agent session — the counterpart of
 * ModelCombobox (compact variant only: it only lives in the bar of the
 * compose). The agent COPIES this branch to create its workspace;
 * `value` is "" for "the default branch of the repository", otherwise a name of
 * branche du listing. Choix possible seulement au lancement (phase compose,
 * new lineage) — everywhere else the picker is a locked chip + tooltip,
 * like the model. No free entry: a non-existent branch would
 * fail the clone, the listing is authentic.
 *
 * Once work begins, the ACTUAL work stream of the session is
 * known (`workBranch`): the locked chip splits into “origin →
 * session branch", the session branch highlighted (this is where
 * the agent pushes). As long as it is not stamped, only the origin is displayed.
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
  workBranch,
  workBranchTooltip,
  bare = false,
  localBranches,
  localLabel,
  cloudLabel,
}: {
  /** Anchoring ISSUE of the listing (ticket sessions). Exclusive with `projectId`. */
  issueId?: string | null;
  /** PROJECT anchoring of the listing (consisting of a run notebook, MIN-84). */
  projectId?: string | null;
  /** "" = default branch of the repository; otherwise a branch name. */
  value: string;
  onChange: (value: string) => void;
  /** Fallback label as long as the default branch is not known. */
  defaultLabel: string;
  /** Apart from the default option (“default”). */
  defaultHint: string;
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  disabled?: boolean;
  /** Locked chip tooltip (frozen branch for session/legacy lineage). */
  disabledTooltip?: string;
  /**
   * Branch displayed by the locked chip (e.g. `base_branch` of the live run,
   * or the basis of the inherited lineage). Fallback: `value`, then the default branch.
   */
  lockedBranch?: string | null;
  /**
   * REAL working branch of the session (e.g. `branch_name` of the live run),
   * known once the work has started. Present → the locked chip splits
   * en « origine → branche de session ». Null/absente → chip d'origine seul.
   */
  workBranch?: string | null;
  /** Split chip tooltip (replaces `disabledTooltip` when `workBranch` exists). */
  workBranchTooltip?: string;
  /** Variant without outline, for the context bar above the composer. */
  bare?: boolean;
  /** Present only in local environment: refs/heads of the attached checkout. */
  localBranches?: readonly string[];
  localLabel?: string;
  cloudLabel?: string;
}) {
  // Chip locked with a known branch → no listing to load: we cannot
  // pays the provider call only when the picker is interactive (or when it is necessary
  // resolve the fault to display). Two exclusive anchors (issue or project),
  // both hooks remain called unconditionally (hook rules).
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
    const local = localBranches ?? [];
    // A branch can exist in both places. It remains local in the
    // menu: selecting it then requires no additional download.
    const entries = [
      ...local.map((branch) => ({ branch, source: "local" as const })),
      ...branches.filter((branch) => !local.includes(branch)).map((branch) => ({ branch, source: "cloud" as const })),
    ];
    if (!q) return entries.slice(0, MAX_RESULTS);
    return entries
      .map((entry) => ({ entry, score: commandFilter(entry.branch, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.entry);
  }, [branches, localBranches, query]);

  const select = (next: string) => {
    // Choose the default branch = follow the default ("").
    onChange(next === defaultBranch ? "" : next);
    setQuery("");
    setOpen(false);
  };

  // Locked: static chip + tooltip, WITHOUT popover (same assembly as the
  // ModelCombobox — the outer <span> carries the hover, a `disabled` button
  // not emitting a pointer event).
  if (disabled && disabledTooltip) {
    const origin = lockedBranch || value || defaultBranch || defaultLabel;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className={cn(
              "pointer-events-none flex h-8 shrink items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/45",
              bare ? "bg-transparent" : "border border-border/60 bg-muted/40",
            )}>
              <GitBranch className="size-3.5 shrink-0" />
              {workBranch ? (
                <>
                  {/* Origin (context, indented) → session branch (put in
 before: this is the actual working branch of the session). */}
                  <span className="max-w-[7rem] truncate">{origin}</span>
                  <ArrowRight className="size-3 shrink-0 opacity-60" />
                  <span className="max-w-[10rem] truncate text-foreground/75">
                    {workBranch}
                  </span>
                </>
              ) : (
                <span className="max-w-[9rem] truncate">{origin}</span>
              )}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {workBranch ? workBranchTooltip ?? disabledTooltip : disabledTooltip}
        </TooltipContent>
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
          className={cn(
            "h-8 shrink gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/80",
            bare ? "bg-transparent hover:bg-accent/50" : "border border-border/60 bg-muted/50 hover:bg-muted",
          )}
        >
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">
            {value || defaultBranch || defaultLabel}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* `rounded-xl`: it is `Command` which paints the surface and it is already imposed
 20px. With the 8px removal from the list, the options (12px) are concentric. */}
      <PopoverContent className="w-80 rounded-xl p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          {/* `p-1`: same 8px removal from FOUR sides as the picker
 pattern — those in the search box just above. */}
          <CommandList className="p-1">
            {results.map(({ branch, source }, index) => {
              const selected = value === branch || (!value && branch === defaultBranch);
              const previousSource = results[index - 1]?.source;
              return (
                <div key={`${source}:${branch}`}>
                  {localBranches && source !== previousSource ? (
                    <div className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
                      {source === "local" ? localLabel : cloudLabel}
                    </div>
                  ) : null}
                  <CommandItem value={branch} onSelect={() => select(branch)}>
                  <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                  <AppTooltip label={branch}>
                    <span className="flex-1 truncate">{branch}</span>
                  </AppTooltip>
                  {branch === defaultBranch ? (
                    <span className="shrink-0 text-xs text-muted-foreground/70">
                      {defaultHint}
                    </span>
                  ) : null}
                  <Check
                    className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
                  />
                  </CommandItem>
                </div>
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
