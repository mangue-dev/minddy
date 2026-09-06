"use client";

import { useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "mangue-ui";
import { Pencil, Settings2 } from "lucide-react";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { PROPERTY_ICONS } from "./database-property-icons";
import type { PageSummary } from "@/lib/pages-api";
import type { DatabaseProperty } from "@/lib/page-databases";
import { usePageDatabase } from "@/lib/use-page-database";

export function DatabaseColumnName({
  projectId,
  database,
  property,
  onEdit,
  onDragStart,
  onDragEnd,
  dragging = false,
  disabled = false,
}: {
  projectId: string;
  database: PageSummary;
  property?: DatabaseProperty;
  onEdit?: (property: DatabaseProperty) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("PageDatabase");
  const name = property?.name ?? database.database_title_name ?? t("name");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressClick = useRef(false);
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
    setEditing(true);
  };
  const save = async () => {
    if (saving.current || cancelled.current) return;
    const next = draft.trim();
    if (!next || next === name) {
      setEditing(false);
      return;
    }
    saving.current = true;
    const schema = base.database_schema ?? [];
    const ok = property
      ? await saveSchema(
          base,
          schema.map((p) => (p.id === property.id ? { ...p, name: next } : p)),
        )
      : await saveSchema(base, schema, next);
    saving.current = false;
    if (ok) setEditing(false);
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
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        if (!open || (!dragging && !suppressClick.current)) setMenuOpen(open);
      }}
    >
      <AppTooltip
        label={property ? `${name} · ${t("dragColumnHint")}` : t("columnActions", { name })}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-database-column-trigger={property?.id ?? "title"}
            className={`flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-left outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "cursor-grabbing bg-muted" : "cursor-pointer"}`}
            aria-label={t("columnActions", { name })}
            disabled={disabled || pending}
            draggable={!!property && !disabled && !pending}
            onPointerDownCapture={(event) => {
              if (event.button === 0) {
                suppressClick.current = false;
                event.stopPropagation();
              }
            }}
            onClick={(event) => {
              if (suppressClick.current) {
                event.preventDefault();
                return;
              }
              setMenuOpen(true);
            }}
            onDoubleClick={start}
            onDragStart={(event) => {
              suppressClick.current = true;
              setMenuOpen(false);
              onDragStart?.(event);
            }}
            onDragEnd={onDragEnd}
            onKeyDown={(event) => {
              if (event.key === "F2") {
                event.preventDefault();
                start();
              } else if (["Enter", " ", "ArrowDown"].includes(event.key)) {
                suppressClick.current = false;
              }
            }}
          >
            {Icon && <Icon className="size-3.5 shrink-0" />}
            <span className="min-w-0 truncate">
              {name}
            </span>
          </button>
        </DropdownMenuTrigger>
      </AppTooltip>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => {
          if (editing) event.preventDefault();
        }}
      >
        <DropdownMenuItem onSelect={start}>
          <Pencil className="size-4" />
          {t("rename")}
        </DropdownMenuItem>
        {property && onEdit && (
          <DropdownMenuItem onSelect={() => onEdit(property)}>
            <Settings2 className="size-4" />
            {t("editColumn")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
