"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { Delete02Icon, Edit04Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { PROPERTY_ICONS } from "./database-property-icons";
import { DatabaseOptionsDialog } from "./database-property-dialogs";
import type { PageSummary } from "@/lib/pages-api";
import type { DatabaseProperty } from "@/lib/page-databases";
import { usePageDatabase } from "@/lib/use-page-database";

export function DatabaseColumnName({
  projectId,
  database,
  property,
  onEdit,
  dragHandleProps,
  dragging = false,
  disabled = false,
}: {
  projectId: string;
  database: PageSummary;
  property?: DatabaseProperty;
  onEdit?: (property: DatabaseProperty) => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  dragging?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("PageDatabase");
  const name = property?.name ?? database.database_title_name ?? t("name");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // The schema the deletion was asked on, so a concurrent edit is not undone.
  const [removeBase, setRemoveBase] = useState<PageSummary | null>(null);
  const hasOptions = property?.type === "select" || property?.type === "multi_select";
  const suppressClick = useRef(false);
  useEffect(() => {
    if (dragging) { suppressClick.current = true; setMenuOpen(false); }
  }, [dragging]);
  const Icon = property ? PROPERTY_ICONS[property.type] : null;
  const [draft, setDraft] = useState(name);
  const [base, setBase] = useState(database);
  const saving = useRef(false);
  const cancelled = useRef(false);
  const { saveSchema, pending } = usePageDatabase(projectId);
  const start = () => {
    setMenuOpen(false);
    setBase(database);
    setDraft(name);
    cancelled.current = false;
    saving.current = false;
    setEditing(true);
  };
  const save = () => {
    if (saving.current || cancelled.current) return;
    const next = draft.trim();
    if (!next || next === name) {
      setEditing(false);
      return;
    }
    saving.current = true;
    const schema = base.database_schema ?? [];
    setEditing(false);
    const request = property
      ? saveSchema(
          base,
          schema.map((p) => (p.id === property.id ? { ...p, name: next } : p)),
        )
      : saveSchema(base, schema, next);
    void request;
  };
  if (editing)
    return (
      <form
        className="min-w-0 w-full px-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input
          autoFocus
          aria-label={t("renameColumn", { name })}
          className="h-7 min-w-0"
          maxLength={80}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
      </form>
    );
  return (
    <>
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        if (!open || (!dragging && !suppressClick.current)) setMenuOpen(open);
      }}
    >
      <AppTooltip
        label={property ? `${name} · ${t("dragColumnHint")}` : t("columnActions", { name })}
      >
        <DropdownMenuTrigger asChild onPointerDown={(event) => event.preventDefault()}>
          <button
            type="button"
            data-database-column-trigger={property?.id ?? "title"}
            className={`flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-left outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "cursor-grabbing bg-muted" : "cursor-default"}`}
            aria-label={t("columnActions", { name })}
            disabled={disabled || pending}
            {...dragHandleProps}
            style={{ touchAction: "pan-y" }}
            onPointerDownCapture={(event) => {
              if (event.button === 0) {
                suppressClick.current = false;
              }
            }}
            onClick={(event) => {
              if (dragging || suppressClick.current) {
                event.preventDefault();
                return;
              }
              setMenuOpen(true);
            }}
            onDoubleClick={start}
            onContextMenu={(event) => {
              if (dragging) return;
              event.preventDefault();
              suppressClick.current = false;
              setMenuOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "F8" || dragging) dragHandleProps?.onKeyDown?.(event);
              if (event.defaultPrevented) return;
              if (event.key === "F2") {
                event.preventDefault();
                start();
              } else if (["Enter", " ", "ArrowDown"].includes(event.key)) {
                suppressClick.current = false;
              }
            }}
          >
            {Icon && <AppIcon icon={Icon} className="size-3.5 shrink-0" />}
            <span className="min-w-0 truncate">
              {name}
            </span>
          </button>
        </DropdownMenuTrigger>
      </AppTooltip>
      <DropdownMenuContent
        align="start"
        className="[&_[role=menuitem]]:rounded-sm"
        onCloseAutoFocus={(event) => {
          if (editing) event.preventDefault();
        }}
      >
        <DropdownMenuItem onSelect={start}>
          <HugeiconsIcon icon={Edit04Icon} className="size-4" />
          {t("rename")}
        </DropdownMenuItem>
        {property && onEdit && (
          <DropdownMenuItem onSelect={() => onEdit(property)}>
            <HugeiconsIcon icon={Settings02Icon} className="size-4" />
            {t("editColumn")}
          </DropdownMenuItem>
        )}
        {/* A select column's choices, without going through the column
            dialog: the same editor as the cells' "Edit options". */}
        {property && hasOptions && (
          <DropdownMenuItem onSelect={() => setOptionsOpen(true)}>
            <AppIcon icon={PROPERTY_ICONS[property.type]} className="size-4" />
            {t("editOptions")}
          </DropdownMenuItem>
        )}
        {property && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoveBase(database)}>
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              {t("deleteProperty")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {property && optionsOpen && (
      <DatabaseOptionsDialog
        projectId={projectId}
        database={database}
        property={property}
        onClose={() => setOptionsOpen(false)}
      />
    )}
    {property && (
      <ConfirmDeleteDialog
        open={removeBase !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveBase(null);
        }}
        title={t("deleteProperty")}
        description={t("deletePropertyBody", { name })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => {
          if (!removeBase) return;
          void saveSchema(
            removeBase,
            (removeBase.database_schema ?? []).filter((p) => p.id !== property.id),
          );
        }}
      />
    )}
    </>
  );
}
