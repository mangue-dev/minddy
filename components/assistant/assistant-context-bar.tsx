"use client";

// La rangée de contexte du composer de Numo : ce qu'il a sous les yeux, plus le
// bouton @ qui permet d'en ajouter.
//
// La rangée ne passe JAMAIS à la ligne — un board avec vue, cycle et sélection
// ferait grandir le composer de trois rangs. Elle défile à l'horizontale, sans
// barre visible, avec deux chevrons qui n'apparaissent qu'au survol et
// seulement s'il reste quelque chose à voir de ce côté.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AtSign, ChevronLeft, ChevronRight, FileText, Folder, User } from "lucide-react";
import { Button, CommandGroup, CommandItem, cn } from "mangue-ui";
import { SearchMenu } from "@/components/search-menu";
import { StatusIndicator } from "@/components/issue-indicators";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import { ContextPill } from "@/components/assistant/context-pill";
import { displayName } from "@/lib/display-name";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import { useProjects } from "@/lib/projects-context";
import { useNumoBoard, useNumoMembers } from "@/lib/use-numo-mentionables";
import type { AssistantContextChip } from "@/lib/assistant-context";
import type { AssistantPinnedContext } from "@/lib/assistant-types";

// ── Défilement horizontal ─────────────────────────────────────────────

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
    // Le contenu bouge sans que la rangée change de taille (une pilule qui
    // s'ajoute, un libellé qui arrive) : on observe les DEUX.
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

// ── Bouton @ : ajouter du contexte ────────────────────────────────────

type AddKind = "member" | "project" | "issue";

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
  // Le champ de recherche est CONTRÔLÉ et remis à vide entre les deux étapes —
  // et surtout il reste monté : c'est lui qui garde le focus quand la liste
  // change, sinon le focus retombe sur le body et Radix ferme le menu.
  const [query, setQuery] = useState("");
  const { projects } = useProjects();
  const { members, loading: membersLoading } = useNumoMembers(
    open && kind === "member",
    scopeProjectId,
  );
  const board = useNumoBoard(open && kind === "issue");

  // Le panneau de Numo est un Sheet modal : react-remove-scroll bloque la molette
  // sur tout ce qui est porté à <body>. On porte donc le menu DANS le panneau,
  // sinon sa liste ne défile pas (même correctif que le popover d'historique).
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
    // Ouvertes d'abord — les closes restent choisissables.
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
  ];

  const loading =
    (kind === "member" && membersLoading) || (kind === "issue" && board.isLoading);

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
                : t("addContext")
        }
        emptyText={loading ? t("addContextLoading") : undefined}
        // Plus large que le w-60 par défaut : à l'étape « ticket » on reconnaît
        // une ligne à son titre, et 240px le coupent au tiers.
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
                  <ProjectOrb seed={p.id} iconUrl={p.icon_url} className="size-5" />
                  <span className="truncate">{p.name}</span>
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

// ── La rangée ─────────────────────────────────────────────────────────

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
  /** Éteint / rallume une pilule ambiante (l'œil). */
  onToggle: (key: string) => void;
  /** Retire une pilule épinglée à la main (la croix). */
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
