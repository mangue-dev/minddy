"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { Input, Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import { FormDialog } from "@/components/form-dialog";
import { SearchSelect, PICKER_FIELD_TRIGGER } from "@/components/search-select";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { usePageDatabase } from "@/lib/use-page-database";
import {
  DATABASE_PROPERTY_TYPES,
  MAX_DATABASE_PROPERTIES,
  type DatabaseProperty,
  type DatabasePropertyType,
} from "@/lib/page-databases";
import type { PageSummary } from "@/lib/pages-api";
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
  const { saveSchema, pending } = usePageDatabase(projectId);
  const [base] = useState(database);
  const [options, setOptions] = useState(property.options ?? []);
  const [palette, setPalette] = useState<string | null>(null);
  const names = options.map((option) => option.name.trim().toLowerCase());
  const duplicate = new Set(names).size !== names.length;
  const dirty =
    JSON.stringify(options) !== JSON.stringify(property.options ?? []);
  const close = () => {
    if (!pending) onClose();
  };
  return (
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
      onSubmit={async () => {
        if (
          await saveSchema(
            base,
            (base.database_schema ?? []).map((p) =>
              p.id === property.id
                ? {
                    ...p,
                    options: options.map((option) => ({
                      ...option,
                      name: option.name.trim(),
                    })),
                  }
                : p,
            ),
          )
        )
          onClose();
      }}
    >
      <div className="max-h-[min(50dvh,400px)] space-y-2 overflow-y-auto px-0.5 py-1">
        {options.map((option, index) => (
          <div
            key={option.id}
            data-database-option-row
            className="flex h-10 min-w-0 items-center gap-3"
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
            <Popover
              open={palette === option.id}
              onOpenChange={(open) => setPalette(open ? option.id : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={
                    tObjectives("colorFieldLabel") + ": " + option.name
                  }
                  className="flex h-9 w-12 shrink-0 items-center justify-center gap-1.5 rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: option.color }}
                  />
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="grid w-auto grid-cols-5 gap-1 p-2"
              >
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={tObjectives("colorAria", { color })}
                    aria-pressed={color === option.color}
                    className="flex size-7 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => {
                      setOptions((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, color } : row,
                        ),
                      );
                      setPalette(null);
                    }}
                  >
                    <span
                      className="flex size-4 items-center justify-center rounded-full"
                      style={{ backgroundColor: color }}
                    >
                      {color === option.color && (
                        <Check className="size-3 text-white" />
                      )}
                    </span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        ))}
        {!options.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("noOptions")}
          </p>
        )}
      </div>
      {duplicate && (
        <p role="alert" className="text-sm text-destructive">
          {t("optionNamesUnique")}
        </p>
      )}
    </FormDialog>
  );
}

export function DatabaseCreatePropertyDialog({
  database,
  projectId,
  onClose,
}: {
  database: PageSummary;
  projectId: string;
  onClose: () => void;
}) {
  const t = useTranslations("PageDatabase");
  const { saveSchema, pending } = usePageDatabase(projectId);
  const [base] = useState(database);
  const [name, setName] = useState("");
  const [type, setType] = useState<DatabasePropertyType>("text");
  const full = (base.database_schema?.length ?? 0) >= MAX_DATABASE_PROPERTIES;
  const Icon = PROPERTY_ICONS[type];
  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      title={t("addProperty")}
      className="sm:max-w-md"
      contentProps={{
        "aria-describedby": undefined,
        onInteractOutside: keepOverlayOpenForPopper,
      }}
      submitLabel={t("addProperty")}
      cancelLabel={t("cancel")}
      submitting={pending}
      submitDisabled={!name.trim() || full}
      onSubmit={async () => {
        if (
          await saveSchema(base, [
            ...(base.database_schema ?? []),
            { id: crypto.randomUUID(), name: name.trim(), type },
          ])
        )
          onClose();
      }}
    >
      <label className="grid gap-2 text-sm font-medium">
        {t("propertyName")}
        <Input
          autoFocus
          value={name}
          maxLength={80}
          required
          disabled={pending}
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
              icon: <TypeIcon className="size-4 text-muted-foreground" />,
            };
          })}
          trigger={
            <button
              type="button"
              aria-label={t("propertyType")}
              disabled={pending}
              className={PICKER_FIELD_TRIGGER}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" />
                {t(type)}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
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
  );
}
