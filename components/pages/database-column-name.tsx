"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "mangue-ui";
import type { PageSummary } from "@/lib/pages-api";
import type { DatabaseProperty } from "@/lib/page-databases";
import { usePageDatabase } from "@/lib/use-page-database";

export function DatabaseColumnName({
  projectId,
  database,
  property,
}: {
  projectId: string;
  database: PageSummary;
  property?: DatabaseProperty;
}) {
  const t = useTranslations("PageDatabase");
  const name = property?.name ?? database.database_title_name ?? t("name");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [base, setBase] = useState(database);
  const saving = useRef(false);
  const cancelled = useRef(false);
  const { saveSchema, pending } = usePageDatabase(projectId);
  const start = () => {
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
        className="min-w-0 w-full"
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
    <button
      type="button"
      className="h-7 w-full min-w-0 overflow-hidden whitespace-nowrap text-clip text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={t("renameColumn", { name })}
      onDoubleClick={start}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          start();
        }
      }}
    >
      {name}
    </button>
  );
}
