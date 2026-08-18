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
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button, CommandGroup, CommandItem, cn, toast } from "mangue-ui";
import { Link2, MessagesSquare, X } from "lucide-react";
import { isClosedStatus, issueIdentifier } from "@/lib/issue-constants";
import { RELATION_PRIORITY, RELATION_TYPES } from "@/lib/relation-constants";
import {
  FEEDBACK_TO_ISSUE_STATUS,
  type IssueLinkedFeedback,
} from "@/lib/feedback/types";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Loaded HERE rather than passed as prop: the panel opens on a ticket at the
  // times, and moving these zeros down to three lines from the page would require
  // each screen that displays a panel (table, list, cycle, global view) to
  // load them for all his tickets first.
  const { data: feedbackData } = useQuery({
    queryKey: ["issue-feedback", issue.id],
    queryFn: async (): Promise<{ feedback: IssueLinkedFeedback[] }> => {
      const res = await fetch(`/api/issues/${issue.id}/feedback`);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const feedback = feedbackData?.feedback ?? [];
  // Current step of the popover: null = choose the type, otherwise = choose the target
  // of this type. The search is controlled to come up empty at each step —
  // otherwise “block” (typed to filter the types) would then filter the
  // tickets and would not show any.
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
          // Wider than the default w-60: in step 2 we choose a ticket
          // by its title, and 240px cut it by a third. Stay in the panel.
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
            // SHORT labels (“Block”, “Blocked by”, “Linked to”): those of
            // the section, and those of the group headers just below. There
            // “Mark as blocking…” formulation is that of the right click
            // a card, where the entry must be announced as an action; here
            // the header already says "Relationships", and the next step continues on
            // “Block which ticket?” ". It remains searchable via keywords.
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
                          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
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

      {/* The feedback from the board that this ticket implements (MIN-196).
 They live in “Relations” because it is one — but in its
 own group, and WITHOUT a cross: the link is undone since the return,
 never from here. A ticket doesn't know how many requests it has, and detaching them from this screen would remove someone from tracking theirs without the screen showing it being in front of them. */}
      {feedback.length > 0 && (
        <div className="flex flex-col pb-2">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessagesSquare className="size-3.5" />
            {t("linkedFeedback")}
          </div>
          <div className="flex flex-col">
            {feedback.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() =>
                  // The return is processed in the Returns tab, never in this
                  // panel: this is where his thread, his moderation and his
                  // promotion. The sign says it exists and leads to it.
                  router.push(
                    `/projects/${issue.project_id}/feedback?post=${post.id}`
                  )
                }
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/60"
              >
                <StatusIndicator
                  status={FEEDBACK_TO_ISSUE_STATUS[post.status]}
                  className="size-4 shrink-0"
                />
                {/* The voices in place of the identifier: a return does not have one,
 and it is its weight which determines whether it should be read. */}
                <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                  {t("votes", { count: post.vote_count })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{post.title}</span>
                {post.comment_count > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <MessagesSquare className="size-3" />
                    {post.comment_count}
                  </span>
                )}
                {/* A private return is not on the board: saying it here avoids
 having to look for something on a public page that is not there. */}
                {!post.is_public && (
                  <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {t("feedbackPrivate")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
