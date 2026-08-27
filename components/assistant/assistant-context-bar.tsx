"use client";

// The context row of Numo's composer: what he has in front of him, plus the
// @ button that lets you add one.
//
// The row NEVER crosses the line — a board with view, cycle and selection
// would make the composition grow by three rows. It scrolls horizontally, without
// visible bar, with two chevrons which only appear on hover and
// only if there is something left to see on this side.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AtSign,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Target,
  User,
} from "lucide-react";
import { Button, CommandGroup, CommandItem, cn } from "mangue-ui";
import { SearchMenu } from "@/components/search-menu";
import { StatusIndicator } from "@/components/issue-indicators";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { UserAvatar } from "@/components/user-avatar";
import { ContextPill } from "@/components/assistant/context-pill";
import { displayName } from "@/lib/display-name";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import { useMentionSources } from "@/lib/use-mention-sources";
import { usePagesQuery } from "@/lib/use-pages-query";
import { flattenPageTree } from "@/lib/pages";
import { useProjects } from "@/lib/projects-context";
import { useNumoBoard, useNumoMembers } from "@/lib/use-numo-mentionables";
import type { AssistantContextChip } from "@/lib/assistant-context";
import type { AssistantPinnedContext } from "@/lib/assistant-types";

// ── Horizontal scrolling ────────────────────── ───────────────────────

function HScroller({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Assistant");
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // The content moves without the row changing size (a pill that
    // is added, a wording which arrives): we observe BOTH.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);

  const scrollBy = (direction: -1 | 1) => {
    ref.current?.scrollBy({
      left: direction * Math.max(120, (ref.current.clientWidth || 0) * 0.6),
      behavior: "smooth",
    });
  };

  return (
    <div className="group/scroller relative min-w-0 flex-1">
      <div
        ref={ref}
        onScroll={measure}
        className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max items-center gap-1.5">{children}</div>
      </div>
      {(["left", "right"] as const).map((side) =>
        edges[side] ? (
          <button
            key={side}
            type="button"
            aria-label={side === "left" ? t("contextScrollPrev") : t("contextScrollNext")}
            onClick={() => scrollBy(side === "left" ? -1 : 1)}
            className={cn(
              "absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/scroller:opacity-100 focus-visible:opacity-100",
              side === "left" ? "left-0" : "right-0",
            )}
          >
            {side === "left" ? (
              <ChevronLeft className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ) : null,
      )}
    </div>
  );
}

// ── @ button: add context ─────────────────────────────────────────────

type AddKind = "member" | "project" | "issue" | "objective" | "page";

function AddContextButton({
  scopeProjectId,
  onAdd,
  disabled,
}: {
  scopeProjectId: string | null;
  onAdd: (item: AssistantPinnedContext) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Assistant");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AddKind | null>(null);
  // The search field is CHECKED and cleared between the two steps —
  // and above all it remains mounted: it is he who keeps the focus when the list
  // changes, otherwise the focus falls back on the body and Radix closes the menu.
  const [query, setQuery] = useState("");
  const { projects } = useProjects();
  const { members, loading: membersLoading } = useNumoMembers(
    open && kind === "member",
    scopeProjectId,
  );
  const boardOn = open && kind === "issue";
  const board = useNumoBoard(boardOn);
  // Exact project caches are only needed after the user chooses a contextual
  // entity type. Keeping the closed assistant mounted must not preload issues,
  // objectives, and pages on every project route.
  const needsProjectEntities =
    open && (kind === "issue" || kind === "objective" || kind === "page");
  const mentionSources = useMentionSources(
    scopeProjectId,
    needsProjectEntities,
  );
  // The page picker needs hierarchy in addition to the flat mention source.
  const pagesQuery = usePagesQuery(
    open && kind === "page" ? scopeProjectId : null,
  );
  const pages = useMemo(
    () =>
      flattenPageTree(pagesQuery.tree)
        // A page WITHOUT A TITLE cannot be pinned: the pill would be displayed
        // empty, and Numo would have nothing to name it.
        .filter((page) => page.title.trim()),
    [pagesQuery.tree],
  );

  // The Numo panel is a Sheet modal: react-remove-scroll blocks the scroll wheel
  // on anything set to <body>. We therefore carry the menu INTO the panel,
  // otherwise its list does not scroll (same fix as the history popover).
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const anchorRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(
      node ? (node.closest('[data-slot="sheet-content"]') as HTMLElement | null) : null,
    );
  }, []);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const issues = useMemo(() => {
    const list = board.data?.issues ?? [];
    // Open first — closed ones remain selectable.
    return [...list].sort(
      (a, b) => (isClosedStatus(a.status) ? 1 : 0) - (isClosedStatus(b.status) ? 1 : 0),
    );
  }, [board.data]);

  const close = () => {
    setOpen(false);
    setKind(null);
    setQuery("");
  };

  const pick = (item: AssistantPinnedContext) => {
    onAdd(item);
    close();
  };

  const KIND_ROWS: Array<{ kind: AddKind; icon: React.ReactNode; label: string }> = [
    { kind: "member", icon: <User className="size-4" />, label: t("addContextMember") },
    { kind: "project", icon: <Folder className="size-4" />, label: t("addContextProject") },
    { kind: "issue", icon: <FileText className="size-4" />, label: t("addContextIssue") },
    // The target remains NEUTRAL here: the line designates the notion “an objective”,
    // not a lens whose color we follow.
    {
      kind: "objective",
      icon: <Target className="size-4" />,
      label: t("addContextObjective"),
    },
    // The wiki only exists in a project: out of project scope (conversation
    // global), the line would only lead to an empty list, so it only opens
    // not at all.
    ...(scopeProjectId
      ? [
          {
            kind: "page" as const,
            icon: <BookText className="size-4" />,
            label: t("addContextPage"),
          },
        ]
      : []),
  ];

  const loading =
    (kind === "member" && membersLoading) ||
    (boardOn && board.isPending) ||
    (kind === "page" && !!scopeProjectId && pagesQuery.loading);

  return (
    <div ref={anchorRef} className="shrink-0">
      <SearchMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setKind(null);
            setQuery("");
          }
        }}
        align="end"
        container={container}
        tooltip={t("addContext")}
        searchValue={query}
        onSearchValueChange={setQuery}
        searchPlaceholder={
          kind === "member"
            ? t("addContextMemberSearch")
            : kind === "project"
              ? t("addContextProjectSearch")
              : kind === "issue"
                ? t("addContextIssueSearch")
                : kind === "objective"
                  ? t("addContextObjectiveSearch")
                  : kind === "page"
                    ? t("addContextPageSearch")
                    : t("addContext")
        }
        emptyText={loading ? t("addContextLoading") : undefined}
        // Wider than the w-60 by default: at the “ticket” stage we recognize
        // a line in its title, and 240px cuts it to a third.
        contentClassName="w-80"
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t("addContext")}
            className="size-6 rounded-full text-muted-foreground"
          >
            <AtSign className="size-3.5" />
          </Button>
        }
      >
        {kind === null ? (
          <CommandGroup>
            {KIND_ROWS.map((row) => (
              <CommandItem
                key={row.kind}
                value={row.label}
                onSelect={() => {
                  setKind(row.kind);
                  setQuery("");
                }}
                className="gap-2"
              >
                <span className="text-muted-foreground">{row.icon}</span>
                {row.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <CommandGroup>
            {kind === "member" &&
              members.map((m) => (
                <CommandItem
                  key={m.user_id}
                  value={`${displayName(m)} ${m.email ?? ""}`}
                  onSelect={() =>
                    pick({
                      kind: "member",
                      id: m.user_id,
                      label: displayName(m),
                      avatarSeed: m.avatar_seed,
                      ...(m.email ? { detail: m.email } : {}),
                    })
                  }
                  className="gap-2"
                >
                  <UserAvatar seed={m.avatar_seed} className="size-5" />
                  <span className="truncate">{displayName(m)}</span>
                </CommandItem>
              ))}
            {kind === "project" &&
              projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.key}`}
                  onSelect={() => pick({ kind: "project", id: p.id, label: p.name })}
                  className="gap-2"
                >
                  <ProjectOrb seed={projectOrbSeed(p)} iconUrl={p.icon_url} className="size-5" />
                  <span className="truncate">{p.name}</span>
                </CommandItem>
              ))}
            {kind === "objective" &&
              mentionSources.objectives.map((objective) => (
                <CommandItem
                  key={objective.id}
                  value={`${objective.name} ${projectById.get(objective.project_id)?.name ?? ""}`}
                  onSelect={() =>
                    pick({
                      kind: "objective",
                      id: objective.id,
                      label: objective.name,
                      color: objective.color,
                    })
                  }
                  className="gap-2"
                >
                  <ObjectiveIconBadge
                    color={objective.color}
                    className="size-4 rounded-full"
                    iconClassName="size-2.5"
                  />
                  <span className="truncate">{objective.name}</span>
                </CommandItem>
              ))}
            {kind === "page" &&
              pages.map((page) => (
                <CommandItem
                  key={page.id}
                  value={page.id}
                  keywords={[page.title]}
                  onSelect={() =>
                    pick({ kind: "page", id: page.id, label: page.title })
                  }
                  className="gap-2"
                >
                  {/* Her emoji when she has one, otherwise the figure from the wiki —
 that of the page tree and its context pill. */}
                  <span className="flex size-5 shrink-0 items-center justify-center text-sm">
                    {page.icon ?? (
                      <BookText className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="truncate">{page.title}</span>
                </CommandItem>
              ))}
            {kind === "issue" &&
              issues.map((issue) => {
                const project = projectById.get(issue.project_id);
                const identifier = issueIdentifier(project?.key ?? "", issue.number);
                return (
                  <CommandItem
                    key={issue.id}
                    value={`${identifier} ${issue.title} ${project?.name ?? ""}`}
                    onSelect={() =>
                      pick({
                        kind: "issue",
                        id: issue.id,
                        label: identifier,
                        detail: issue.title,
                      })
                    }
                    className="gap-2"
                  >
                    <StatusIndicator status={issue.status} className="size-4" />
                    <span className="truncate">
                      <span className="text-muted-foreground">{identifier}</span>{" "}
                      {issue.title}
                    </span>
                  </CommandItem>
                );
              })}
          </CommandGroup>
        )}
      </SearchMenu>
    </div>
  );
}

// ── The row ──────────────────────────── ─────────────────────────────

export function AssistantContextBar({
  chips,
  disabledKeys,
  onToggle,
  onRemove,
  onAdd,
  scopeProjectId,
  inputDisabled,
}: {
  chips: AssistantContextChip[];
  disabledKeys: ReadonlySet<string>;
  /** Turns off/on an ambient pill (the eye). */
  onToggle: (key: string) => void;
  /** Remove a pill pinned to the hand (the cross). */
  onRemove: (key: string) => void;
  onAdd: (item: AssistantPinnedContext) => void;
  scopeProjectId: string | null;
  inputDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 pt-2.5">
      {chips.length > 0 && (
        <HScroller>
          {chips.map((chip) => (
            <ContextPill
              key={chip.key}
              chip={chip}
              radius="md"
              className="shadow-none"
              disabled={disabledKeys.has(chip.key)}
              {...(chip.pinned
                ? { onRemove: () => onRemove(chip.key) }
                : { onToggle: () => onToggle(chip.key) })}
            />
          ))}
        </HScroller>
      )}
      <AddContextButton
        scopeProjectId={scopeProjectId}
        onAdd={onAdd}
        disabled={inputDisabled}
      />
    </div>
  );
}
