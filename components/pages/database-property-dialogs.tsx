"use client";

import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { arrayMove } from "@dnd-kit/sortable";
import { createUuid } from "@/lib/create-uuid";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { FormDialog } from "@/components/form-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { SearchSelect, PICKER_FIELD_TRIGGER } from "@/components/search-select";
import { pickFreeCategoryColor } from "@/lib/category-colors";
import { ColorSelect } from "@/components/color-select";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { usePageDatabase } from "@/lib/use-page-database";
import {
  DATABASE_PROPERTY_TYPES,
  MAX_DATABASE_PROPERTIES,
  MAX_DATABASE_OPTIONS,
  type DatabaseProperty,
  type DatabasePropertyType,
} from "@/lib/page-databases";
import type { PageSummary } from "@/lib/pages-api";
import type { DatabaseConversionPreview } from "@/lib/page-database-conversion";
import { PROPERTY_ICONS } from "./database-property-icons";

/** Mount once per edit so incoming revisions cannot replace an unsaved draft. */
export function DatabaseOptionsDialog({
  database,
  property,
  projectId,
  onClose,
}: {
  database: PageSummary;
  property: DatabaseProperty;
  projectId: string;
  onClose: () => void;
}) {
  const t = useTranslations("PageDatabase");
  const tObjectives = useTranslations("Objectives");
  const locale = useLocale();
  const { saveSchema, pending } = usePageDatabase(projectId);
  const [base] = useState(database);
  const [options, setOptions] = useState(property.options ?? []);
  const names = options.map((option) => option.name.trim().toLowerCase());
  const duplicate = new Set(names).size !== names.length;
  const dirty =
    JSON.stringify(options) !== JSON.stringify(property.options ?? []);
  const close = () => {
    if (!pending) onClose();
  };
  // Saving strips deleted options from every entry, permanently: name them
  // and ask before the save goes through (MIN-743).
  const [confirmRemoved, setConfirmRemoved] = useState<string[] | null>(null);
  const save = () => {
    void saveSchema(base, (base.database_schema ?? []).map((p) =>
      p.id === property.id ? { ...p, options: options.map((option) => ({ ...option, name: option.name.trim() })) } : p));
    onClose();
  };
  const listFormat = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  return (
    <>
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t("editOptions")}
      description={property.name}
      className="sm:max-w-lg"
      contentProps={{ onInteractOutside: keepOverlayOpenForPopper }}
      submitLabel={t("save")}
      cancelLabel={t("cancel")}
      submitting={pending}
      submitDisabled={!dirty || duplicate || names.some((name) => !name)}
      onSubmit={() => {
        const kept = new Set(options.map((option) => option.id));
        const removed = (property.options ?? [])
          .filter((option) => !kept.has(option.id))
          .map((option) => `“${option.name}”`);
        if (removed.length > 0) setConfirmRemoved(removed);
        else save();
      }}
    >
      <div className="max-h-[min(50dvh,400px)] space-y-2 overflow-y-auto px-0.5 py-1">
        {options.map((option, index) => (
          <div
            key={option.id}
            data-database-option-row
            className="flex min-h-11 min-w-0 items-center gap-1"
          >
            <Input
              aria-label={t("optionName")}
              value={option.name}
              maxLength={80}
              required
              disabled={pending}
              className="h-9 min-w-0 flex-1"
              onChange={(event) =>
                setOptions((rows) =>
                  rows.map((row, i) =>
                    i === index ? { ...row, name: event.target.value } : row,
                  ),
                )
              }
            />
            <ColorSelect
              value={option.color}
              align="end"
              tooltip={tObjectives("colorFieldLabel") + ": " + option.name}
              onChange={(color) => {
                if (!color) return;
                setOptions((rows) =>
                  rows.map((row, i) => (i === index ? { ...row, color } : row)),
                );
              }}
              trigger={
                <button
                  type="button"
                  disabled={pending}
                  aria-label={tObjectives("colorFieldLabel") + ": " + option.name}
                  className="flex h-9 w-12 shrink-0 items-center justify-center gap-1.5 rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: option.color }}
                  />
                  <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 text-muted-foreground" />
                </button>
              }
            />
            <Button type="button" variant="ghost" size="icon"
              className="size-9 shrink-0 app-mobile:size-11"
              disabled={pending || index === 0}
              aria-label={t("moveOptionUp", { name: option.name })}
              onClick={() => setOptions((rows) => arrayMove(rows, index, index - 1))}>
              <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon"
              className="size-9 shrink-0 app-mobile:size-11"
              disabled={pending || index === options.length - 1}
              aria-label={t("moveOptionDown", { name: option.name })}
              onClick={() => setOptions((rows) => arrayMove(rows, index, index + 1))}>
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-destructive app-mobile:size-11"
              disabled={pending}
              aria-label={t("deleteOption", { name: option.name })}
              onClick={() => {
                setOptions((rows) => rows.filter((row) => row.id !== option.id));
              }}>
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </Button>
          </div>
        ))}
        {!options.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("noOptions")}
          </p>
        )}
        <Button type="button" variant="ghost" disabled={pending || options.length >= MAX_DATABASE_OPTIONS}
          onClick={() => setOptions((rows) => [...rows, { id: createUuid(), name: "", color: pickFreeCategoryColor(rows.map((row) => row.color)) }])}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          {t("addOption")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("deleteOptionHint")}</p>
      {duplicate && (
        <p role="alert" className="text-sm text-destructive">
          {t("optionNamesUnique")}
        </p>
      )}
    </FormDialog>
    <ConfirmDeleteDialog
      open={confirmRemoved !== null}
      onOpenChange={(open) => {
        if (!open) setConfirmRemoved(null);
      }}
      title={t("deleteOptionsTitle", {
        count: confirmRemoved?.length ?? 0,
        property: property.name,
      })}
      description={t("deleteOptionsDescription", {
        names: listFormat.format(confirmRemoved ?? []),
      })}
      confirmLabel={t("deleteOptionsConfirm")}
      cancelLabel={t("cancel")}
      onConfirm={save}
    />
    </>
  );
}

type ColumnDialogProps = {
  database: PageSummary;
  projectId: string;
  onClose: () => void;
};

export function DatabaseCreatePropertyDialog(props: ColumnDialogProps) {
  return <DatabaseColumnDialog {...props} />;
}

export function DatabaseEditPropertyDialog(
  props: ColumnDialogProps & { property: DatabaseProperty },
) {
  return <DatabaseColumnDialog {...props} />;
}

function DatabaseColumnDialog({
  database,
  property,
  projectId,
  onClose,
}: ColumnDialogProps & { property?: DatabaseProperty }) {
  const t = useTranslations("PageDatabase");
  const { saveSchema, previewConversion, convertColumn, pending } =
    usePageDatabase(projectId);
  const [base] = useState(database);
  const [name, setName] = useState(property?.name ?? "");
  const [type, setType] = useState<DatabasePropertyType>(
    property?.type ?? "text",
  );
  const [warning, setWarning] = useState<DatabaseConversionPreview | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const busy = pending || saving;
  const full =
    !property && (base.database_schema?.length ?? 0) >= MAX_DATABASE_PROPERTIES;
  const Icon = PROPERTY_ICONS[type];
  const applyConversion = async (
    preview: DatabaseConversionPreview,
    confirmLoss: boolean,
  ) => {
    if (!property) return;
    const request = convertColumn(base, property.id, type, name.trim(), preview, confirmLoss);
    if (preview.column) {
      onClose();
      void request;
    } else {
      setSaving(true);
      try { if (await request) onClose(); else setWarning(null); }
      finally { setSaving(false); }
    }
  };
  return (
    <>
      {!warning && (
        <FormDialog
          open
          onOpenChange={(next) => {
            if (!next && !busy && !warning) onClose();
          }}
          title={t(property ? "editColumn" : "addProperty")}
          className="sm:max-w-md"
          contentProps={{
            "aria-describedby": undefined,
            onInteractOutside: keepOverlayOpenForPopper,
          }}
          submitLabel={t(property ? "save" : "addProperty")}
          cancelLabel={t("cancel")}
          submitting={busy}
          submitDisabled={
            !name.trim() ||
            full ||
            (!!property &&
              name.trim() === property.name &&
              type === property.type)
          }
          onSubmit={async () => {
            setSaving(true);
            try {
              if (property && type !== property.type) {
                const preview = await previewConversion(
                  base,
                  property.id,
                  type,
                  name.trim(),
                );
                if (!preview) return;
                if (preview.incompatibleCount) setWarning(preview);
                else await applyConversion(preview, false);
              } else {
                const schema = base.database_schema ?? [];
                const next = property
                  ? schema.map((p) =>
                      p.id === property.id ? { ...p, name: name.trim() } : p,
                    )
                  : [
                      ...schema,
                      { id: createUuid(), name: name.trim(), type },
                    ];
                void saveSchema(base, next);
                onClose();
              }
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="grid gap-2 text-sm font-medium">
            {t("propertyName")}
            <Input
              autoFocus={allowInputAutoFocus()}
              value={name}
              maxLength={80}
              required
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="grid gap-2 pb-2 text-sm font-medium">
            <span>{t("propertyType")}</span>
            <SearchSelect
              value={type}
              onChange={(next) => {
                if (next) setType(next as DatabasePropertyType);
              }}
              searchPlaceholder={t("searchPropertyTypes")}
              options={DATABASE_PROPERTY_TYPES.map((kind) => {
                const TypeIcon = PROPERTY_ICONS[kind];
                return {
                  value: kind,
                  label: t(kind),
                  icon: <AppIcon icon={TypeIcon} className="size-4 text-muted-foreground" />,
                };
              })}
              trigger={
                <button
                  type="button"
                  aria-label={t("propertyType")}
                  disabled={busy}
                  className={PICKER_FIELD_TRIGGER}
                >
                  <span className="flex items-center gap-2">
                    <AppIcon icon={Icon} className="size-4 text-muted-foreground" />
                    {t(type)}
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground" />
                </button>
              }
            />
          </div>
          {full && (
            <p className="text-sm text-muted-foreground">
              {t("propertyLimit", { count: MAX_DATABASE_PROPERTIES })}
            </p>
          )}
        </FormDialog>
      )}
      <AlertDialog
        open={!!warning}
        onOpenChange={(next) => {
          if (!next && !busy) setWarning(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("conversionWarningTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {type === "created_at"
                ? t("conversionMetadataWarning", {
                    count: warning?.incompatibleCount ?? 0,
                  })
                : t("conversionWarningDescription", {
                    count: warning?.incompatibleCount ?? 0,
                    from: t(property?.type ?? "text"),
                    to: t(type),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (warning) void applyConversion(warning, true);
              }}
            >
              {t(
                type === "created_at"
                  ? "confirmMetadataConversion"
                  : "confirmConversion",
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
