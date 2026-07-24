"use client";

// The minddy command palette (built on @clement/command-palette, extracted from
// minddy v1). Opened by the header search pill and by ⌘K / ⌘P (VS Code reflex) /
// F. It consumes the same `paletteGroups` the mobile nav uses (créer, aller à,
// projets, pages, issues, objectifs, compte) so both stay in sync by construction.
// On top of that: tickets carry their status icon and a ⌘; action menu (statut,
// priorité, effort, assigné, copier le prompt, copier l'identifiant) wired to the
// real API (updateIssueApi + react-query invalidation); the theme options collapse
// into a single "Changer le thème" submenu; "Se déconnecter" is omitted.
//
// Bulk mode (MIN-75): a board's selection pill opens the palette via
// useBulkActions; the list then shows the selection's options (Numo, change
// status/priority/effort/assignee, delete) as plain rows in place of the normal
// content — configurable fields open the same inline form as "Changer le thème".
//
// Open state is owned by AppShellChrome (so the header pill and the shortcuts
// share it); this component is controlled via `open` / `onOpenChange`.

import { useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast, useTheme } from "mangue-ui";
import { Copy, UserRound, Gauge, ClipboardCopy, SunMoon, Sun, Moon, Monitor, Trash2, CircleDashed, SignalHigh } from "lucide-react";
import {
  CommandPalette as CommandPaletteShell,
  type ActionProvider,
  type ActionResult,
  type CategoryDefinition,
  type ContextualAction,
  type FormSelectOption,
  type PaletteItem as CpPaletteItem,
} from "@/lib/command-palette";
import { NumoIcon } from "@/components/numo-icon";
import { useBulkActions } from "@/lib/bulk-actions-context";
import { displayName } from "@/lib/display-name";
import { updateIssueApi } from "@/lib/issues-api";
import { buildIssuePrompt } from "@/lib/issue-prompt";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import {
  resolvePaletteFavorites,
  togglePaletteFavorite,
  PALETTE_FAVORITES_META_KEY,
} from "@/lib/palette-favorites";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  STATUS_MAP,
  PRIORITY_MAP,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { useMembersQuery } from "@/lib/use-members-query";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { eventKey } from "@/lib/keyboard/event-key";
import type { Issue } from "@/lib/types";
import type { PaletteGroup } from "@/components/header-search-pill";
import "./command-palette.css";

/** Boosts de recherche par groupe — même philosophie que minddy v1 :
 *  les commandes restent au-dessus des données à pertinence égale. */
const GROUP_BOOSTS: Record<string, number> = {
  create: 300,
  goto: 250,
  projects: 200,
  pages: 150,
  account: 100,
  issues: 80,
  objectives: 80,
};

/** Icône de statut d'un ticket (celle du board, avec sa couleur). */
function statusIcon(status: IssueStatus) {
  const meta = STATUS_MAP[status];
  const Icon = meta.icon;
  return <Icon className={`size-4 ${meta.color}`} />;
}

/** Visage de Numo en icône d'action statique (pas de clignement dans la popover). */
const NumoActionIcon = (props: SVGProps<SVGSVGElement>) => (
  <NumoIcon animated={false} {...props} />
);
NumoActionIcon.displayName = "NumoActionIcon";

export interface CommandPaletteProps {
  groups: PaletteGroup[];
  /** Controlled open state (owned by AppShellChrome). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ groups, open, onOpenChange }: CommandPaletteProps) {
  const locale = useLocale();
  const tIssueUI = useTranslations("IssueUI");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const tField = useTranslations("Field");
  const tBulk = useTranslations("BulkActions");
  const tNav = useTranslations("Nav");
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, updateUserMetadata } = useAuth();
  const { projects } = useProjects();
  const { theme, setTheme } = useTheme();

  // Sélection groupée (MIN-75) : une board publie sa sélection via le contexte.
  // La pill « Actions » ouvre ⌘K en MODE BULK — la palette affiche alors les
  // options de la sélection (Numo, changer statut/priorité/effort/assigné,
  // supprimer) comme des lignes normales, à la place du contenu habituel. Les
  // champs configurables ouvrent le formulaire inline (le « sous-menu », comme
  // « Changer le thème »).
  const { request: bulkRequest, openSignal } = useBulkActions();
  const [bulkMode, setBulkMode] = useState(false);

  // Favorites persisted in the account (user_metadata.palette_favorites) — same
  // mechanism as the account preferences, so they survive reloads and sync
  // across devices (vs the package's device-local localStorage default). Local
  // state mirrors the metadata and updates optimistically, reverting on failure.
  const serverFavorites = resolvePaletteFavorites(user?.user_metadata);
  const [favorites, setFavorites] = useState<string[]>(serverFavorites);
  const favoritesRef = useRef(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);
  // Re-sync when the account metadata changes (another tab/device, or after a
  // write settles). Keyed on the serialized value to avoid an identity-churn loop.
  const serverFavoritesKey = serverFavorites.join(" ");
  useEffect(() => {
    setFavorites(serverFavorites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverFavoritesKey]);

  const handleToggleFavorite = useCallback(
    (id: string) => {
      const prev = favoritesRef.current;
      const next = togglePaletteFavorite(prev, id);
      setFavorites(next);
      favoritesRef.current = next;
      updateUserMetadata({ [PALETTE_FAVORITES_META_KEY]: next }).catch(() => {
        setFavorites(prev);
        favoritesRef.current = prev;
      });
    },
    [updateUserMetadata]
  );

  const currentProjectId = projectIdFromPath(pathname);
  const { members } = useMembersQuery(currentProjectId, !!currentProjectId);
  const { categories: projectCategories } = useCategoriesQuery(currentProjectId);
  const categoryNameById = useMemo(
    () => new Map(projectCategories.map((c) => [c.id, c.name])),
    [projectCategories]
  );

  // Global open shortcuts. ⌘K / ⌘P toggle from anywhere (modifier combos are
  // safe even inside inputs — the standard "summon" behaviour, and it captures
  // the VS Code reflex); ⌘P also overrides the browser print dialog. F opens
  // when not editing text (the documented "search" key). Escape / click-outside
  // close via the palette itself.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const key = eventKey(e);

      if (isMod && !e.shiftKey && !e.altKey && (key === "k" || key === "p")) {
        e.preventDefault();
        onOpenChange(!openRef.current);
        return;
      }

      if (!isMod && !e.altKey && key === "f") {
        const el = e.target as HTMLElement | null;
        const typing =
          el &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.isContentEditable);
        if (typing) return; // F = plain text in editors
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  // Une pill de board a demandé les actions groupées → on ouvre la palette en
  // mode bulk (elle affichera alors les options de la sélection).
  useEffect(() => {
    if (openSignal === 0) return;
    onOpenChange(true);
    setBulkMode(true);
  }, [openSignal, onOpenChange]);

  // Toute fermeture (Échap, clic dehors, ⌘K) sort du mode bulk : la prochaine
  // ouverture ⌘K/⌘P retrouve la palette normale.
  useEffect(() => {
    if (!open) setBulkMode(false);
  }, [open]);

  // Les groupes cmdk deviennent les catégories de la palette (ordre préservé).
  const categories = useMemo<CategoryDefinition[]>(
    () =>
      groups.map((g, i) => {
        const id = g.key ?? g.heading ?? `group-${i}`;
        return {
          id,
          label: g.heading ?? id,
          searchBoost: GROUP_BOOSTS[id] ?? 0,
        };
      }),
    [groups]
  );

  const isFr = locale.startsWith("fr");
  const themeLabel = isFr ? "Changer le thème" : "Change theme";

  // Chaque PaletteItem cmdk devient un item de la palette. metaText (identifiant
  // PQ-42, nom du projet) devient le contextLabel dim ; les tickets reçoivent
  // l'icône (colorée) de leur statut. Les 3 options de thème à plat sont
  // remplacées par un seul « Changer le thème » (sous-menu select) et
  // « Se déconnecter » est retiré.
  const items = useMemo<CpPaletteItem[]>(() => {
    const HIDDEN_KEYS = new Set(["cmd-light", "cmd-dark", "cmd-system", "cmd-signout"]);

    const mapped = groups.flatMap((g, gi) => {
      const cat = g.key ?? g.heading ?? `group-${gi}`;
      return g.items
        .filter((it) => !HIDDEN_KEYS.has(it.key))
        .map((it): CpPaletteItem => {
          const Icon = it.icon;
          const issue = it.entityType === "issue" ? (it.data as Issue) : null;
          return {
            id: it.key,
            title: it.label,
            keywords: it.keywords,
            icon: issue
              ? statusIcon(issue.status)
              : Icon
                ? <Icon className="size-4" />
                : undefined,
            contextLabel: it.metaText,
            filterCategory: cat,
            entityType: it.entityType,
            data: it.data,
            execute: () => {
              it.onSelect?.();
            },
          };
        });
    });

    // « Changer le thème » : Enter/⌘; ouvre le select inline (provider "theme")
    mapped.push({
      id: "cmd-theme",
      title: themeLabel,
      keywords: ["theme", "thème", "apparence", "appearance", "dark", "light", "sombre", "clair"],
      icon: <SunMoon className="size-4" />,
      filterCategory: "account",
      entityType: "theme",
    });

    return mapped;
  }, [groups, themeLabel]);

  // === Actions contextuelles des tickets (⌘; / →) ===
  // Chaque action ouvre un formulaire inline à un champ : le select s'ouvre
  // auto-focus, choisir une option auto-soumet → PATCH + invalidation du cache
  // ["issues", projectId] (le board et la palette se rafraîchissent), toast.
  const issueProvider = useMemo<ActionProvider>(() => {
    const update = async (
      issue: Issue,
      updates: Parameters<typeof updateIssueApi>[1],
      message: string
    ): Promise<ActionResult> => {
      await updateIssueApi(issue.id, updates);
      await queryClient.invalidateQueries({ queryKey: ["issues", issue.project_id] });
      toast.success(message);
      // closeMenu:false → retour à la recherche, l'icône de statut se met à jour
      return { success: true, closeMenu: false };
    };

    const selectField = (
      key: string,
      label: string,
      options: FormSelectOption[]
    ) => ({
      // Pas de prefill : le champ vide reçoit l'autofocus, donc le dropdown
      // s'ouvre immédiatement et Enter sur une option auto-soumet.
      fields: [{ key, type: "select" as const, label, options }],
    });

    return {
      id: "issue-actions",
      handles: ["issue"],
      priority: 50,
      getActions: (item): ContextualAction[] => {
        const issue = item.data as Issue | undefined;
        if (!issue) return [];

        const actions: ContextualAction[] = [];

        // — Statut —
        actions.push({
          id: "issue.status",
          label: tIssueUI("changeStatusAria"),
          icon: STATUS_MAP[issue.status].icon,
          category: "secondary",
          priority: 40,
          requiresForm: {
            ...selectField(
              "status",
              tIssueUI("changeStatusAria"),
              ALL_STATUSES.map((s) => ({
                value: s.value,
                label: tStatus(s.value),
                icon: <s.icon className={`size-4 ${s.color}`} />,
                description: s.value === issue.status ? "•" : undefined,
              }))
            ),
            onSubmit: (values) =>
              update(
                issue,
                { status: values.status as IssueStatus },
                `${tIssueUI("changeStatusAria")} → ${tStatus(values.status as IssueStatus)}`
              ),
          },
        });

        // — Priorité —
        actions.push({
          id: "issue.priority",
          label: tIssueUI("changePriorityAria"),
          icon: PRIORITY_MAP[issue.priority].icon,
          category: "secondary",
          priority: 30,
          requiresForm: {
            ...selectField(
              "priority",
              tIssueUI("changePriorityAria"),
              PRIORITIES.map((p) => ({
                value: p.value,
                label: tPriority(p.value),
                icon: <p.icon className={`size-4 ${p.color}`} />,
                description: p.value === issue.priority ? "•" : undefined,
              }))
            ),
            onSubmit: (values) =>
              update(
                issue,
                { priority: values.priority as IssuePriority },
                `${tIssueUI("changePriorityAria")} → ${tPriority(values.priority as IssuePriority)}`
              ),
          },
        });

        // — Effort —
        actions.push({
          id: "issue.effort",
          label: tIssueUI("changeEffortAria"),
          icon: Gauge,
          category: "secondary",
          priority: 20,
          requiresForm: {
            ...selectField(
              "effort",
              tIssueUI("changeEffortAria"),
              EFFORTS.map((e) => ({
                value: e.value,
                label: e.label,
                description: e.value === issue.effort ? "•" : undefined,
              }))
            ),
            onSubmit: (values) =>
              update(
                issue,
                { effort: values.effort as IssueEffort },
                `${tIssueUI("changeEffortAria")} → ${String(values.effort).toUpperCase()}`
              ),
          },
        });

        // — Assigné —
        actions.push({
          id: "issue.assignee",
          label: tIssueUI("changeAssigneeAria"),
          icon: UserRound,
          category: "secondary",
          priority: 10,
          requiresForm: {
            ...selectField("assignee", tIssueUI("changeAssigneeAria"), [
              { value: "__none__", label: tField("unassigned") },
              ...members.map((m) => ({
                value: m.user_id,
                label: m.full_name ?? m.email ?? m.user_id,
                description: m.user_id === issue.assignee_id ? "•" : undefined,
              })),
            ]),
            onSubmit: (values) =>
              update(
                issue,
                {
                  assignee_id:
                    values.assignee === "__none__"
                      ? null
                      : (values.assignee as string),
                },
                tIssueUI("changeAssigneeAria")
              ),
          },
        });

        // — Copier le prompt (le ⇧P du board : XML agent + auto-start MIN-20) —
        actions.push({
          id: "issue.copy-prompt",
          label: tIssueUI("copyAsPrompt"),
          icon: ClipboardCopy,
          category: "secondary",
          priority: 5,
          execute: async (): Promise<ActionResult> => {
            const project = projects.find((p) => p.id === issue.project_id);
            const autoStart =
              resolvePromptCopyAutoStart(user?.user_metadata) &&
              shouldAutoStartOnPromptCopy(issue.status);
            // Le XML copié reflète l'état APRÈS auto-start (comme sur le board)
            const promptIssue = autoStart
              ? { ...issue, status: "in_progress" as const }
              : issue;
            const promptCategories = issue.category_ids
              .map((cid) => categoryNameById.get(cid))
              .filter((name): name is string => !!name);
            const prompt = buildIssuePrompt({
              issue: promptIssue,
              projectId: issue.project_id,
              projectKey: project?.key ?? "",
              categories: promptCategories,
              // Relations non résolues ici (données board) — bloc omis du prompt
              attachmentCount: issue.attachment_count,
            });
            await navigator.clipboard.writeText(prompt);
            if (autoStart) {
              await updateIssueApi(issue.id, { status: "in_progress" });
              await queryClient.invalidateQueries({
                queryKey: ["issues", issue.project_id],
              });
              toast.success(tIssueUI("promptCopiedMoved"));
            } else {
              toast.success(tIssueUI("promptCopied"));
            }
            return { success: true, closeMenu: false };
          },
        });

        // — Copier l'identifiant (PQ-42) —
        if (item.contextLabel) {
          actions.push({
            id: "issue.copy-id",
            label: `Copier « ${item.contextLabel} »`,
            icon: Copy,
            category: "secondary",
            priority: 0,
            execute: async (): Promise<ActionResult> => {
              await navigator.clipboard.writeText(item.contextLabel as string);
              toast.success(item.contextLabel as string);
              return { success: true, closeMenu: false };
            },
          });
        }

        return actions;
      },
    };
  }, [queryClient, members, projects, user, categoryNameById, tIssueUI, tStatus, tPriority, tField]);

  // === « Changer le thème » : un seul item, le select inline fait le sous-menu ===
  const themeProvider = useMemo<ActionProvider>(() => {
    const THEME_OPTIONS: { value: string; label: string; icon: typeof Sun }[] = [
      { value: "light", label: tNav("themeLight"), icon: Sun },
      { value: "dark", label: tNav("themeDark"), icon: Moon },
      { value: "system", label: tNav("themeSystem"), icon: Monitor },
    ];

    return {
      id: "theme",
      handles: ["theme"],
      priority: 50,
      getActions: (): ContextualAction[] => [
        {
          id: "theme.change",
          label: themeLabel,
          icon: SunMoon,
          category: "primary",
          requiresForm: {
            fields: [
              {
                key: "theme",
                type: "select",
                label: themeLabel,
                options: THEME_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  icon: <o.icon className="size-4" />,
                  description: o.value === theme ? "•" : undefined,
                })),
              },
            ],
            onSubmit: async (values): Promise<ActionResult> => {
              setTheme(values.theme as "light" | "dark" | "system");
              return { success: true, closeMenu: false };
            },
          },
        },
      ],
    };
  }, [theme, setTheme, tNav, themeLabel]);

  // === Sélection groupée (MIN-75) : options comme lignes normales de la palette ===
  // En mode bulk, `bulkItems` REMPLACE la liste habituelle. Numo et Supprimer
  // s'exécutent directement (`execute`) ; les champs configurables portent
  // entityType "bulk-field" et n'ont pas d'`execute` → les sélectionner ouvre le
  // formulaire inline (le « sous-menu », comme « Changer le thème »), servi par
  // `bulkFieldProvider`.
  const bulkItems = useMemo<CpPaletteItem[]>(() => {
    if (!bulkRequest) return [];
    const { count, onDelete, onAskNumo } = bulkRequest;
    const field = (f: string): Partial<CpPaletteItem> => ({
      filterCategory: "bulk",
      entityType: "bulk-field",
      favoritable: false,
      data: { field: f },
    });

    const list: CpPaletteItem[] = [
      {
        id: "bulk-ask-numo",
        title: tBulk("askNumo"),
        icon: <NumoActionIcon className="size-4" />,
        keywords: ["numo", "agent", "ai", "demander"],
        filterCategory: "bulk",
        favoritable: false,
        execute: () => {
          onAskNumo();
        },
      },
      {
        id: "bulk-status",
        title: tIssueUI("changeStatusAria"),
        icon: <CircleDashed className="size-4" />,
        keywords: ["statut", "status"],
        ...field("status"),
      } as CpPaletteItem,
      {
        id: "bulk-priority",
        title: tIssueUI("changePriorityAria"),
        icon: <SignalHigh className="size-4" />,
        keywords: ["priorité", "priority"],
        ...field("priority"),
      } as CpPaletteItem,
      {
        id: "bulk-effort",
        title: tIssueUI("changeEffortAria"),
        icon: <Gauge className="size-4" />,
        keywords: ["effort", "estimation"],
        ...field("effort"),
      } as CpPaletteItem,
      {
        id: "bulk-assignee",
        title: tIssueUI("changeAssigneeAria"),
        icon: <UserRound className="size-4" />,
        keywords: ["assigné", "assignee", "responsable"],
        ...field("assignee"),
      } as CpPaletteItem,
    ];

    if (onDelete) {
      list.push({
        id: "bulk-delete",
        title: tBulk("delete", { count }),
        icon: <Trash2 className="size-4" />,
        keywords: ["supprimer", "delete", "remove"],
        filterCategory: "bulk",
        favoritable: false,
        execute: () => {
          if (
            typeof window !== "undefined" &&
            window.confirm(tBulk("deleteConfirm", { count }))
          ) {
            onDelete();
          } else {
            // Annulation : garder la palette ouverte sur la liste bulk.
            return false;
          }
        },
      });
    }

    return list;
  }, [bulkRequest, tBulk, tIssueUI]);

  // Un seul groupe, intitulé du nombre de tickets sélectionnés.
  const bulkCategories = useMemo<CategoryDefinition[]>(
    () =>
      bulkRequest
        ? [{ id: "bulk", label: tBulk("selected", { count: bulkRequest.count }) }]
        : [],
    [bulkRequest, tBulk]
  );

  // Formulaire inline (le « sous-menu ») pour les champs configurables. Chaque
  // item "bulk-field" a une action primaire à formulaire, sans `execute` : la
  // sélectionner ouvre le select inline, dont la validation applique le patch.
  const bulkFieldProvider = useMemo<ActionProvider>(() => {
    const selectField = (
      key: string,
      label: string,
      options: FormSelectOption[]
    ) => ({ fields: [{ key, type: "select" as const, label, options }] });

    return {
      id: "bulk-field-actions",
      handles: ["bulk-field"],
      priority: 60,
      getActions: (item): ContextualAction[] => {
        const req = bulkRequest;
        if (!req) return [];
        const fieldKey = (item.data as { field?: string } | undefined)?.field;
        if (!fieldKey) return [];

        // closeMenu:false → retour à la liste bulk, on peut enchaîner un autre champ.
        const update = async (
          patch: Parameters<typeof req.onUpdate>[0],
          message: string
        ): Promise<ActionResult> => {
          req.onUpdate(patch);
          toast.success(message);
          return { success: true, closeMenu: false };
        };

        if (fieldKey === "status") {
          return [
            {
              id: "bulk.status",
              label: tIssueUI("changeStatusAria"),
              icon: CircleDashed,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "status",
                  tIssueUI("changeStatusAria"),
                  ALL_STATUSES.map((s) => ({
                    value: s.value,
                    label: tStatus(s.value),
                    icon: <s.icon className={`size-4 ${s.color}`} />,
                  }))
                ),
                onSubmit: (values) =>
                  update(
                    { status: values.status as IssueStatus },
                    `${tIssueUI("changeStatusAria")} → ${tStatus(values.status as IssueStatus)}`
                  ),
              },
            },
          ];
        }
        if (fieldKey === "priority") {
          return [
            {
              id: "bulk.priority",
              label: tIssueUI("changePriorityAria"),
              icon: SignalHigh,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "priority",
                  tIssueUI("changePriorityAria"),
                  PRIORITIES.map((p) => ({
                    value: p.value,
                    label: tPriority(p.value),
                    icon: <p.icon className={`size-4 ${p.color}`} />,
                  }))
                ),
                onSubmit: (values) =>
                  update(
                    { priority: values.priority as IssuePriority },
                    `${tIssueUI("changePriorityAria")} → ${tPriority(values.priority as IssuePriority)}`
                  ),
              },
            },
          ];
        }
        if (fieldKey === "effort") {
          return [
            {
              id: "bulk.effort",
              label: tIssueUI("changeEffortAria"),
              icon: Gauge,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "effort",
                  tIssueUI("changeEffortAria"),
                  EFFORTS.map((e) => ({ value: e.value, label: e.label }))
                ),
                onSubmit: (values) =>
                  update(
                    { effort: values.effort as IssueEffort },
                    `${tIssueUI("changeEffortAria")} → ${String(values.effort).toUpperCase()}`
                  ),
              },
            },
          ];
        }
        if (fieldKey === "assignee") {
          return [
            {
              id: "bulk.assignee",
              label: tIssueUI("changeAssigneeAria"),
              icon: UserRound,
              category: "primary",
              requiresForm: {
                ...selectField("assignee", tIssueUI("changeAssigneeAria"), [
                  { value: "__none__", label: tField("unassigned") },
                  ...req.members.map((m) => ({
                    value: m.user_id,
                    label: displayName(m),
                  })),
                ]),
                onSubmit: (values) =>
                  update(
                    {
                      assignee_id:
                        values.assignee === "__none__"
                          ? null
                          : (values.assignee as string),
                    },
                    tIssueUI("changeAssigneeAria")
                  ),
              },
            },
          ];
        }
        return [];
      },
    };
  }, [bulkRequest, tIssueUI, tStatus, tPriority, tField]);

  const providers = useMemo(
    () => [issueProvider, themeProvider, bulkFieldProvider],
    [issueProvider, themeProvider, bulkFieldProvider]
  );

  // En mode bulk, la palette affiche les options de la sélection à la place du
  // contenu normal (navigation, création…).
  const showBulk = bulkMode && !!bulkRequest;
  const paletteItems = showBulk ? bulkItems : items;
  const paletteCategories = showBulk ? bulkCategories : categories;

  return (
    <CommandPaletteShell
      isOpen={open}
      onClose={() => onOpenChange(false)}
      items={paletteItems}
      categories={paletteCategories}
      providers={providers}
      locale={locale}
      storagePrefix="minddy-cp"
      actionsShortcutKey=";"
      favorites={favorites}
      onToggleFavorite={handleToggleFavorite}
      onToast={(message, type) => {
        if (type === "error") toast.error(message);
        else if (type === "success") toast.success(message);
        else toast(message);
      }}
    />
  );
}
