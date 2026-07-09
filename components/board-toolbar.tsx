"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  SplitButton,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  Check,
  CircleUser,
  ListFilter,
  ArrowUpDown,
  Loader2,
  Lock,
  MoreHorizontal,
  Plug,
  Plus,
  Save,
  Pencil,
  Share2,
  Trash2,
  Triangle,
} from "lucide-react";
import {
  StatusIndicator,
  PriorityIndicator,
} from "@/components/issue-indicators";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import { ShareViewDialog } from "@/components/share-view-dialog";
import {
  STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { ME_ASSIGNEE, activeFilterCount } from "@/lib/view-filter";
import { displayName } from "@/lib/display-name";
import type {
  Category,
  Integration,
  Member,
  Objective,
  Project,
  View,
  ViewConfig,
  ViewFilters,
  ViewSort,
} from "@/lib/types";

const SORTS: ViewSort[] = ["manual", "priority", "created", "updated", "due"];

function toggle<T>(arr: T[] | undefined, value: T): T[] {
  const set = new Set(arr ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

function ToggleRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {active && <Check className="size-4 shrink-0" />}
    </button>
  );
}

function FiltersPopover({
  config,
  onChange,
  members,
  categories,
  objectives,
  integrations,
  projects,
  lockedToMe,
  withNumo,
  onAskNumo,
}: {
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  integrations: Integration[];
  /** Global board only — a project board has no project facet. */
  projects: Project[];
  /** System view: the assignee facet is pinned to "@me" and not editable. */
  lockedToMe: boolean;
  withNumo: boolean;
  onAskNumo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const f = config.filters;
  const setFilters = (next: ViewFilters) =>
    onChange({ ...config, filters: next });
  const count = activeFilterCount(config);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const ts = useTranslations("Status");
  const tp = useTranslations("Priority");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label={tc("filters")}>
              <ListFilter className={cn(count > 0 && "text-primary")} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tc("filters")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="max-h-[70vh] w-64 overflow-y-auto p-2">
        {withNumo && (
          <>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAskNumo();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <NumoIcon animated={false} className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{t("askNumo")}</span>
            </button>
            <Separator className="my-1.5" />
          </>
        )}
        {projects.length > 0 && (
          <>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("project")}
            </p>
            {projects.map((p) => (
              <ToggleRow
                key={p.id}
                active={!!f.project?.includes(p.id)}
                onClick={() =>
                  setFilters({ ...f, project: toggle<string>(f.project, p.id) })
                }
              >
                <ProjectOrb seed={p.id} className="size-4 shrink-0" />
                <span className="truncate">{p.name}</span>
              </ToggleRow>
            ))}
            <Separator className="my-1.5" />
          </>
        )}
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("status")}</p>
        {STATUSES.map((s) => (
          <ToggleRow
            key={s.value}
            active={!!f.status?.includes(s.value)}
            onClick={() =>
              setFilters({ ...f, status: toggle<IssueStatus>(f.status, s.value) })
            }
          >
            <StatusIndicator status={s.value} className="size-4" />
            {ts(s.value)}
          </ToggleRow>
        ))}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("priority")}</p>
        {PRIORITIES.map((p) => (
          <ToggleRow
            key={p.value}
            active={!!f.priority?.includes(p.value)}
            onClick={() =>
              setFilters({
                ...f,
                priority: toggle<IssuePriority>(f.priority, p.value),
              })
            }
          >
            <PriorityIndicator priority={p.value} className="size-4" />
            {tp(p.value)}
          </ToggleRow>
        ))}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("assignee")}</p>
        {lockedToMe ? (
          /* System view: nothing else to pick — one non-interactive locked row. */
          <div
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
            aria-disabled
            title={t("myViewLockedHint")}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <CircleUser className="size-4 shrink-0 text-muted-foreground" />
              {tf("assignedToMe")}
            </span>
            <Lock className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <>
            <ToggleRow
              active={!!f.assignee?.includes(ME_ASSIGNEE)}
              onClick={() =>
                setFilters({ ...f, assignee: toggle(f.assignee, ME_ASSIGNEE) })
              }
            >
              <CircleUser className="size-4 shrink-0 text-muted-foreground" />
              {tf("assignedToMe")}
            </ToggleRow>
            <ToggleRow
              active={!!f.assignee?.includes(null)}
              onClick={() => setFilters({ ...f, assignee: toggle(f.assignee, null) })}
            >
              {tf("unassigned")}
            </ToggleRow>
            {members.map((m) => (
              <ToggleRow
                key={m.user_id}
                active={!!f.assignee?.includes(m.user_id)}
                onClick={() =>
                  setFilters({ ...f, assignee: toggle(f.assignee, m.user_id) })
                }
              >
                <span className="truncate">{displayName(m)}</span>
              </ToggleRow>
            ))}
          </>
        )}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("effort")}</p>
        {EFFORTS.map((e) => (
          <ToggleRow
            key={e.value}
            active={!!f.effort?.includes(e.value)}
            onClick={() =>
              setFilters({ ...f, effort: toggle<IssueEffort>(f.effort, e.value) })
            }
          >
            <Triangle className="size-4 text-muted-foreground" />
            {e.label}
          </ToggleRow>
        ))}

        {categories.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("categories")}
            </p>
            {categories.map((c) => (
              <ToggleRow
                key={c.id}
                active={!!f.category?.includes(c.id)}
                onClick={() =>
                  setFilters({ ...f, category: toggle<string>(f.category, c.id) })
                }
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="truncate">{c.name}</span>
              </ToggleRow>
            ))}
          </>
        )}

        {objectives.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("objective")}
            </p>
            <ToggleRow
              active={!!f.objective?.includes(null)}
              onClick={() =>
                setFilters({ ...f, objective: toggle(f.objective, null) })
              }
            >
              {tf("noObjective")}
            </ToggleRow>
            {objectives.map((o) => (
              <ToggleRow
                key={o.id}
                active={!!f.objective?.includes(o.id)}
                onClick={() =>
                  setFilters({ ...f, objective: toggle(f.objective, o.id) })
                }
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
                  aria-hidden
                />
                <span className="truncate">{o.name}</span>
              </ToggleRow>
            ))}
          </>
        )}

        {integrations.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("integration")}
            </p>
            <ToggleRow
              active={!!f.integration?.includes(null)}
              onClick={() =>
                setFilters({ ...f, integration: toggle(f.integration, null) })
              }
            >
              {tf("noIntegration")}
            </ToggleRow>
            {integrations.map((i) => (
              <ToggleRow
                key={i.id}
                active={!!f.integration?.includes(i.id)}
                onClick={() =>
                  setFilters({ ...f, integration: toggle(f.integration, i.id) })
                }
              >
                <Plug className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="truncate">{i.name}</span>
              </ToggleRow>
            ))}
          </>
        )}

        <Separator className="my-1.5" />
        <ToggleRow
          active={!!config.display.hideDone}
          onClick={() =>
            onChange({
              ...config,
              display: { ...config.display, hideDone: !config.display.hideDone },
            })
          }
        >
          {t("hideDone")}
        </ToggleRow>
      </PopoverContent>
    </Popover>
  );
}

function ViewNameDialog({
  open,
  onOpenChange,
  title,
  initialName,
  onSubmit,
  withDescription = false,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialName: string;
  onSubmit: (name: string, description?: string) => Promise<void>;
  /** Show a "describe the view to Numo" field (create flow only). */
  withDescription?: boolean;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const tc = useTranslations("Common");
  const t = useTranslations("Board");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(initialName);
          setDescription("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            setBusy(true);
            try {
              await onSubmit(
                trimmed,
                withDescription ? description.trim() || undefined : undefined
              );
              onOpenChange(false);
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("viewNamePlaceholder")}
          />
          {withDescription && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <NumoIcon animated={false} className="size-3.5 text-primary" />
                {t("askNumoOptional")}
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("viewDescriptionPlaceholder")}
                rows={3}
                className="resize-none"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {submitLabel ?? tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BoardToolbar({
  views,
  activeViewId,
  generatingViewIds,
  onSelectView,
  config,
  onConfigChange,
  members,
  categories,
  objectives,
  integrations,
  projects = [],
  dirty,
  onCreateView,
  onUpdateActiveView,
  onRenameView,
  onDeleteView,
  withNumo = true,
  withShare = true,
  onAskNumo,
}: {
  views: View[];
  activeViewId: string | null;
  generatingViewIds: Set<string>;
  onSelectView: (id: string | null) => void;
  config: ViewConfig;
  onConfigChange: (config: ViewConfig) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  integrations: Integration[];
  /** Global board only: enables the project facet in the filters popover. */
  projects?: Project[];
  dirty: boolean;
  onCreateView: (name: string, description?: string) => Promise<void>;
  onUpdateActiveView: () => Promise<void>;
  onRenameView: (view: View, name: string) => Promise<void>;
  onDeleteView: (view: View) => Promise<void>;
  /** Numo is project-scoped — the global board hides its affordances. */
  withNumo?: boolean;
  /** Global views are not shareable (v1) — the global board hides Share. */
  withShare?: boolean;
  onAskNumo: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  // "Save as new view" from the Save split button: same create flow, but the
  // config to save already exists — no Numo description step.
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<View | null>(null);
  const [shareTarget, setShareTarget] = useState<View | null>(null);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const tSort = useTranslations("Sort");

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  // The system view is neither renamable, nor deletable, nor unlockable.
  const isSystem = activeView?.kind === "my";
  const customCount = views.filter((v) => v.kind !== "my").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Views bar */}
        <div className="flex flex-wrap items-center gap-1">
          {views.map((v) => (
            <ViewChip
              key={v.id}
              view={v}
              active={v.id === activeViewId}
              generating={generatingViewIds.has(v.id)}
              onSelect={() => onSelectView(v.id)}
            />
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("newView")}
                onClick={() => setCreateOpen(true)}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("newView")}</TooltipContent>
          </Tooltip>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {dirty && activeView && (
            <SplitButton
              size="sm"
              onClick={() => void onUpdateActiveView()}
              menuLabel={t("saveOptions")}
              menu={
                <DropdownMenuItem onSelect={() => setSaveAsOpen(true)}>
                  <Plus />
                  {t("saveAsNewView")}
                </DropdownMenuItem>
              }
            >
              <Save />
              {tc("save")}
            </SplitButton>
          )}
          {dirty && !activeView && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Save />
              {t("saveAsView")}
            </Button>
          )}

          {/* Order — icon only, accent-coloured when a non-default sort is active */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label={tf("order")}>
                    <ArrowUpDown
                      className={cn(config.sort !== "manual" && "text-primary")}
                    />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{tf("order")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {SORTS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => onConfigChange({ ...config, sort: s })}
                >
                  {tSort(s)}
                  {config.sort === s && <Check className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filters — icon only, accent-coloured when any filter is active */}
          <FiltersPopover
            config={config}
            onChange={onConfigChange}
            members={members}
            categories={categories}
            objectives={objectives}
            integrations={integrations}
            projects={projects}
            lockedToMe={isSystem}
            withNumo={withNumo}
            onAskNumo={onAskNumo}
          />

          {/* Active view actions — rename / share / delete (the system view
              only shares; without Share the menu would be empty → disabled) */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!activeView || (isSystem && !withShare)}
                    aria-label={t("viewOptions", { name: activeView?.name ?? "" })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {t("viewOptions", { name: activeView?.name ?? "" })}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {!isSystem && (
                <DropdownMenuItem
                  onSelect={() => activeView && setRenameTarget(activeView)}
                >
                  <Pencil />
                  {t("renameView")}
                </DropdownMenuItem>
              )}
              {withShare && (
                <DropdownMenuItem
                  onSelect={() => activeView && setShareTarget(activeView)}
                >
                  <Share2 />
                  {t("shareView")}
                </DropdownMenuItem>
              )}
              {!isSystem && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={customCount <= 1}
                    onSelect={() => activeView && void onDeleteView(activeView)}
                  >
                    <Trash2 />
                    {t("deleteView")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ViewNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("newView")}
        initialName=""
        onSubmit={onCreateView}
        withDescription={withNumo}
        submitLabel={withNumo ? tc("continue") : undefined}
      />
      <ViewNameDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        title={t("saveAsNewView")}
        initialName=""
        onSubmit={(name) => onCreateView(name)}
      />
      <ViewNameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={t("renameViewTitle")}
        initialName={renameTarget?.name ?? ""}
        onSubmit={(name) =>
          renameTarget ? onRenameView(renameTarget, name) : Promise.resolve()
        }
      />
      <ShareViewDialog
        view={shareTarget}
        open={shareTarget !== null}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
      />
    </div>
  );
}

function ViewChip({
  view,
  active,
  generating,
  onSelect,
}: {
  view: View;
  active: boolean;
  generating: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("Board");
  // The system view's label follows the viewer's language (the stored name is
  // only for API consumers).
  const isSystem = view.kind === "my";
  return (
    <button
      type="button"
      onClick={onSelect}
      title={generating ? t("viewGenerating") : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {generating && (
        <Loader2
          className="size-3 shrink-0 animate-spin"
          aria-label={t("viewGenerating")}
        />
      )}
      {isSystem && <CircleUser className="size-3 shrink-0" aria-hidden />}
      {isSystem ? t("myView") : view.name}
    </button>
  );
}
