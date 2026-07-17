"use client";

// Side-panel relations (MIN-25), rendered as a row of the key/value property
// table — label left, a link button right — with the issue's relations grouped
// by type just under it, each removable.
//
// Adding is two steps in ONE popover: the link button opens the list of relation
// types, and picking one advances the SAME popover to the searchable list of
// candidate issues. (The board's right-click menu and the MCP tool are the other
// entry points; the menu chains two overlays instead, which it can afford —
// there's no Dialog around a card.)

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, CommandGroup, CommandItem, cn, toast } from "mangue-ui";
import { Link2, X } from "lucide-react";
import { isClosedStatus, issueIdentifier } from "@/lib/issue-constants";
import { RELATION_PRIORITY, RELATION_TYPES } from "@/lib/relation-constants";
import { RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { SearchMenu } from "@/components/search-menu";
import type { ChipRelation } from "@/components/relation-chips";
import type { Issue, IssueRelationType } from "@/lib/types";

export function RelationsSection({
  issue,
  relations,
  allIssues,
  projectKey,
  onOpenIssue,
  onAddRelation,
  onRemoveRelation,
}: {
  issue: Issue;
  /** This issue's relations, resolved (with otherNumber) and priority-sorted. */
  relations: ChipRelation[];
  allIssues: Issue[];
  projectKey: string;
  onOpenIssue: (issueId: string) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  onRemoveRelation: (relationId: string) => void;
}) {
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  // Étape courante du popover : null = choisir le type, sinon = choisir la cible
  // de ce type. La recherche est contrôlée pour repartir vide à chaque étape —
  // sans quoi « bloc » (tapé pour filtrer les types) filtrerait ensuite les
  // tickets et n'en montrerait aucun.
  const [step, setStep] = useState<IssueRelationType | null>(null);
  const [query, setQuery] = useState("");

  const issueById = useMemo(
    () => new Map(allIssues.map((i) => [i.id, i])),
    [allIssues]
  );

  // Candidates: other OPEN issues not already linked here — relating to
  // done/canceled work is pointless (a closed blocker doesn't block, and the
  // resolver would mark it spent immediately).
  const candidates = useMemo<Issue[]>(() => {
    const linked = new Set(relations.map((r) => r.otherId));
    return allIssues.filter(
      (i) => i.id !== issue.id && !linked.has(i.id) && !isClosedStatus(i.status)
    );
  }, [allIssues, relations, issue.id]);

  const grouped = useMemo(
    () =>
      RELATION_PRIORITY.map((type) => ({
        type,
        items: relations.filter((r) => r.relation === type),
      })).filter((g) => g.items.length > 0),
    [relations]
  );

  const close = () => {
    setOpen(false);
    setStep(null);
    setQuery("");
  };

  return (
    <>
      <PropertyRow label={t("relations")}>
        <SearchMenu
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setStep(null);
              setQuery("");
            }
          }}
          align="end"
          tooltip={t("addRelationAria")}
          searchValue={query}
          onSearchValueChange={setQuery}
          searchPlaceholder={step ? t("searchIssue") : undefined}
          // Plus large que le w-60 par défaut : à l'étape 2 on choisit un ticket
          // par son titre, et 240px le coupaient au tiers. Reste dans le panneau.
          contentClassName="w-80"
          trigger={
            <button
              type="button"
              aria-label={t("addRelationAria")}
              className={cn(TRIGGER, "text-muted-foreground")}
            >
              <Link2 className="size-4" />
            </button>
          }
        >
          {step === null ? (
            // Libellés COURTS (« Bloque », « Bloqué par », « Lié à ») : ceux de
            // la section, et ceux des en-têtes de groupes juste dessous. La
            // formulation « Marquer comme bloquant… » est celle du clic droit
            // d'une carte, où l'entrée doit s'annoncer comme une action ; ici
            // l'en-tête dit déjà « Relations », et l'étape suivante enchaîne sur
            // « Bloque quel ticket ? ». Elle reste cherchable via les keywords.
            <CommandGroup heading={t("relations")}>
              {RELATION_TYPES.map((type) => (
                <CommandItem
                  key={type}
                  value={type}
                  keywords={[t(`action_${type}`)]}
                  onSelect={() => {
                    setStep(type);
                    setQuery("");
                  }}
                >
                  <RelationIcon relation={type} className="size-4" />
                  <span className="truncate">{t(type)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <CommandGroup heading={t(`pick_${step}`)}>
              {candidates.map((candidate) => {
                const id = issueIdentifier(projectKey, candidate.number);
                return (
                  <CommandItem
                    key={candidate.id}
                    value={candidate.id}
                    keywords={[id, candidate.title]}
                    onSelect={() => {
                      onAddRelation(issue.id, step, candidate.id);
                      close();
                    }}
                  >
                    <StatusIndicator status={candidate.status} className="size-4" />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {id}
                    </span>
                    <span className="truncate">{candidate.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </SearchMenu>
      </PropertyRow>

      {grouped.length > 0 && (
        <div className="flex flex-col gap-3 pb-2">
          {grouped.map((group) => (
            <div key={group.type}>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <RelationIcon relation={group.type} className="size-3.5" />
                {t(group.type)}
              </div>
              <div className="flex flex-col">
                {group.items.map((r) => {
                  const other = issueById.get(r.otherId);
                  const id = issueIdentifier(projectKey, r.otherNumber);
                  return (
                    <div
                      key={r.id}
                      className="group/relrow flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenIssue(r.otherId)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {other && (
                          <StatusIndicator
                            status={other.status}
                            className="size-4 shrink-0"
                          />
                        )}
                        <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                          {id}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            other?.status === "done" &&
                              "text-muted-foreground line-through"
                          )}
                        >
                          {other?.title ?? id}
                        </span>
                        {r.resolved && (
                          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t("resolved")}
                          </span>
                        )}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tCommon("remove")}
                        className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/relrow:opacity-100 focus-visible:opacity-100"
                        onClick={() =>
                          void Promise.resolve(onRemoveRelation(r.id)).catch(
                            (err) => toast.error((err as Error).message)
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
