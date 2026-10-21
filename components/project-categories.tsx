"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { useState, type KeyboardEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import { InlineEditField } from "@/components/settings/inline-edit-field";
import { SettingsEmpty, SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_NAMES,
  DEFAULT_CATEGORY_COLOR,
} from "@/lib/category-colors";
import type { Category } from "@/lib/types";
import { AppTooltip } from "@/components/ui/app-tooltip";

function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const t = useTranslations("Categories");
  const tColors = useTranslations("Categories.colors");
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <AppTooltip label={t("colorSwatchAria", { color: tColors(CATEGORY_COLOR_NAMES[c]) })} key={c}>
          <button
            type="button"
            onClick={() => onChange(c)}
            aria-label={t("colorSwatchAria", { color: tColors(CATEGORY_COLOR_NAMES[c]) })}
            className={cn(
              "size-5 rounded-full ring-offset-2 ring-offset-background transition-shadow",
              value === c && "ring-2 ring-ring"
            )}
            style={{ backgroundColor: c }}
          />
        </AppTooltip>
      ))}
    </div>
  );
}

/** The color of a category: a dot that opens the swatches (a sheet on a
    phone). Picking one applies at once. */
function ColorButton({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void | Promise<unknown>;
  label: string;
}) {
  const t = useTranslations("Categories");
  const [open, setOpen] = useState(false);
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <AppTooltip label={label}>
        <ResponsivePopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className="size-3.5 rounded-full ring-1 ring-black/5 dark:ring-white/10"
              style={{ backgroundColor: value }}
            />
          </button>
        </ResponsivePopoverTrigger>
      </AppTooltip>
      <ResponsivePopoverContent align="start" className="w-auto p-3" mobileTitle={t("colorLabel")}>
        <Swatches
          value={value}
          onChange={(color) => {
            setOpen(false);
            void onChange(color);
          }}
        />
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

// Rows only move up and down the list.
const verticalDrag: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function CategoryRow({
  category,
  sortable,
  onUpdate,
  onDelete,
}: {
  category: Category;
  /** False while the list cannot be reordered (a single category). */
  sortable: boolean;
  onUpdate: (updates: { name?: string; color?: string }) => Promise<unknown>;
  onDelete: () => void;
}) {
  const t = useTranslations("Categories");
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: category.id, disabled: !sortable });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/category relative flex items-center gap-2 bg-card py-2",
        isDragging && "z-10 shadow-sm"
      )}
    >
      {sortable && (
        <AppTooltip label={t("reorderHint")}>
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={t("reorderAria", { name: category.name })}
            {...attributes}
            {...listeners}
            // A touch on the handle drags; the rest of the row still scrolls.
            style={{ touchAction: "none" }}
            className="-mx-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" />
          </button>
        </AppTooltip>
      )}
      <ColorButton
        value={category.color}
        label={t("changeColor", { name: category.name })}
        onChange={async (color) => {
          try {
            await onUpdate({ color });
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
      {/* Renamed in place, like the project and profile names. */}
      <InlineEditField
        value={category.name}
        onSave={async (name) => {
          await onUpdate({ name });
        }}
        label={t("nameLabel")}
        editLabel={t("rename", { name: category.name })}
        validate={(next) => (next ? null : t("nameRequired"))}
        className="flex min-w-0 flex-1 items-center"
        inputClassName="h-8 max-w-xs"
      >
        <span className="truncate text-sm">{category.name}</span>
      </InlineEditField>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("deleteAria", { name: category.name })}
        onClick={onDelete}
        // Shown on hover and focus with a pointer; always there on touch.
        className="shrink-0 text-muted-foreground hover:text-destructive pointer-fine:opacity-0 pointer-fine:group-hover/category:opacity-100 pointer-fine:focus-visible:opacity-100"
      >
        <HugeiconsIcon icon={Delete02Icon} />
      </Button>
    </li>
  );
}

/** The category being added: a row at the top of the list, focused. Enter
    creates it, Escape or an empty field leaves. */
function NewCategoryRow({
  onCreate,
  onDone,
}: {
  onCreate: (input: { name: string; color: string }) => Promise<unknown>;
  onDone: () => void;
}) {
  const t = useTranslations("Categories");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onDone();
      return;
    }
    setCreating(true);
    try {
      await onCreate({ name: trimmed, color });
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void create();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <li className="flex items-center gap-2 py-2">
      <ColorButton value={color} onChange={setColor} label={t("colorLabel")} />
      <Input
        autoFocus
        aria-label={t("newCategoryLabel")}
        value={name}
        disabled={creating}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t("newCategoryPlaceholder")}
        className="h-8 max-w-xs flex-1"
      />
      <Button size="sm" disabled={creating || !name.trim()} onClick={() => void create()}>
        {creating && <Spinner />}
        {t("addCategory")}
      </Button>
    </li>
  );
}

/** Project → Categories (MIN-737): one row per category, edited where it is
    shown — color from its dot, name in place — and a new one added at the
    top from the card's title line. The handle drags a row to set the order
    every category picker follows (MIN-760). */
export function ProjectCategories({ projectId }: { projectId: string }) {
  const t = useTranslations("Categories");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const tSettings = useTranslations("Settings");
  const { categories, createCategory, updateCategory, reorderCategories, deleteCategory } =
    useCategoriesQuery(projectId);

  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // The order shown here is the order of every category picker and filter.
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = categories.map((category) => category.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    reorderCategories(next).catch((err: unknown) => toast.error((err as Error).message));
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectCategories}
      title={tSettings("categoriesTab")}
      action={
        <Button type="button" size="sm" disabled={adding} onClick={() => setAdding(true)}>
          <HugeiconsIcon icon={Add01Icon} />
          {t("newCategoryLabel")}
        </Button>
      }
    >
      {adding || categories.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {adding && (
            <NewCategoryRow onCreate={createCategory} onDone={() => setAdding(false)} />
          )}
          <DndContext
            accessibility={{ screenReaderInstructions: { draggable: t("reorderHint") } }}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[verticalDrag]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={categories.map((category) => category.id)}
              strategy={verticalListSortingStrategy}
            >
              {categories.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  sortable={categories.length > 1}
                  onUpdate={(updates) => updateCategory(c.id, updates)}
                  onDelete={() => setToDelete(c)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </ul>
      ) : (
        <SettingsEmpty>
          {t("emptyState", { noCategories: tf("noCategories") })}
        </SettingsEmpty>
      )}

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(next) => {
          if (!next) setToDelete(null);
        }}
        title={toDelete ? t("deleteCategoryTitle", { name: toDelete.name }) : ""}
        description={t("deleteCategoryDescription")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteCategory(toDelete.id);
            toast.success(t("categoryDeleted"));
            setToDelete(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </SettingsGroup>
  );
}
