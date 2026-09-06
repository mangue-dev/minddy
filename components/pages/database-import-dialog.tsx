"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, toast } from "mangue-ui";
import { Upload } from "lucide-react";
import {
  WizardDialog,
  type WizardStep,
} from "@/components/wizard/wizard-dialog";
import { SearchSelect } from "@/components/search-select";
import { useMembersQuery } from "@/lib/use-members-query";
import { displayName } from "@/lib/display-name";
import { pagesKey, pageKey } from "@/lib/use-pages-query";
import { readDatabaseArchive } from "@/lib/database-import/archive";
import { prepareImportPages } from "@/lib/database-import/prepare";
import {
  MAX_IMPORT_BYTES,
  type ImportColumn,
  type ImportColumnType,
  type PreparedDatabaseImport,
} from "@/lib/database-import/types";
import { waitForPageCreation } from "@/lib/page-creation-settlement";
import type { PageSummary } from "@/lib/pages-api";

const TYPES: ImportColumnType[] = [
  "title",
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "people",
  "checkbox",
];
export function DatabaseImportDialog({
  projectId,
  database,
  onClose,
  onImported,
}: {
  projectId: string;
  database: PageSummary;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations("PageDatabase");
  const cache = useQueryClient();
  const { members } = useMembersQuery(projectId, true);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedDatabaseImport | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [columns, setColumns] = useState<ImportColumn[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mappingTouched = useRef(false);
  const source = prepared?.sources.find((source) => source.id === sourceId);
  useEffect(() => {
    if (!source || source.native) return;
    mappingTouched.current = false;
    const abort = new AbortController();
    void fetch("/api/projects/" + projectId + "/pages/import-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        columns: source.columns.map((column, index) => ({
          ...column,
          samples: source.rows
            .slice(0, 8)
            .map((row) => row[index].slice(0, 200)),
        })),
      }),
    })
      .then((response) => response.json())
      .then((result) => {
        if (
          !abort.signal.aborted &&
          !mappingTouched.current &&
          Array.isArray(result.types) &&
          result.types.length === source.columns.length &&
          result.types.every((type: ImportColumnType) => TYPES.includes(type))
        )
          setColumns(
            source.columns.map((column, index) => ({
              ...column,
              type: result.types[index],
            })),
          );
      })
      .catch(() => {});
    return () => abort.abort();
  }, [source, projectId]);
  const changeColumns = (
    update: (columns: ImportColumn[]) => ImportColumn[],
  ) => {
    mappingTouched.current = true;
    setColumns(update);
  };
  const errorMessage = (error: unknown) => {
    const keys = [
      "importInvalidArchive",
      "importTooLarge",
      "importNoDatabase",
      "importInvalidMapping",
      "importUnmatchedPeople",
      "importLongText",
    ] as const;
    const key = keys.find(
      (key) => error instanceof Error && error.message === key,
    );
    return key
      ? t(key)
      : error instanceof Error
        ? error.message
        : t("importFailed");
  };
  const preview = useMemo(() => {
    if (!prepared || !source) return null;
    const aliases = new Map<string, string>();
    for (const member of members)
      for (const label of [displayName(member), member.email, member.user_id])
        if (label)
          aliases.set(label.trim().toLocaleLowerCase(), member.user_id);
    try {
      return {
        pages: prepareImportPages(prepared, source, columns, aliases),
        error: null,
      };
    } catch (error) {
      return { pages: [], error };
    }
  }, [prepared, source, columns, members]);
  const loadFile = async (next: File) => {
    setError("");
    setBusy(true);
    try {
      if (next.size > MAX_IMPORT_BYTES) throw new Error("importTooLarge");
      const data = readDatabaseArchive(
        new Uint8Array(await next.arrayBuffer()),
        next.name,
      );
      if (!data.sources.length) throw new Error("importNoDatabase");
      setFile(next);
      setPrepared(data);
      setSourceId(data.sources[0].id);
      setColumns(data.sources[0].columns);
      setPeople({});
      requestId.current = crypto.randomUUID();
      setStep(1);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!file || !source || preview?.error) return;
    setBusy(true);
    setError("");
    try {
      await waitForPageCreation(database.id);
      const form = new FormData();
      form.set("file", file);
      form.set(
        "options",
        JSON.stringify({
          requestId: requestId.current,
          sourceId,
          columns,
          people,
          revision: database.database_revision ?? 0,
        }),
      );
      const response = await fetch(
        "/api/projects/" + projectId + "/pages/" + database.id + "/import",
        { method: "POST", body: form },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("importFailed"));
      await Promise.all([
        cache.invalidateQueries({ queryKey: pagesKey(projectId) }),
        cache.invalidateQueries({ queryKey: pageKey(database.id) }),
      ]);
      toast.success(t("importSuccess", { count: result.count }));
      onImported();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const steps: WizardStep[] = [
    {
      id: "source",
      title: t("importTitle"),
      subtitle: t("importDescription"),
      wide: true,
      hideSubmit: true,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("importInstructions")}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.csv"
            className="sr-only"
            aria-label={t("importChooseFile")}
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (next) void loadFile(next);
            }}
          />
          <button
            type="button"
            className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-6 hover:bg-muted/50"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!busy && event.dataTransfer.files[0])
                void loadFile(event.dataTransfer.files[0]);
            }}
          >
            <Upload className="size-6 text-muted-foreground" />
            <span>{busy ? t("importAnalyzing") : t("importChooseFile")}</span>
            <span className="text-sm text-muted-foreground">
              {t("importFormats")}
            </span>
          </button>
        </div>
      ),
    },
    {
      id: "mapping",
      title: t("importMappingTitle"),
      subtitle: t("importMappingDescription"),
      wide: true,
      submitDisabled: !source || !!preview?.error,
      content: source && (
        <div className="space-y-5">
          {prepared!.sources.length > 1 && (
            <SearchSelect
              value={sourceId}
              onChange={(id) => {
                const next = prepared!.sources.find(
                  (source) => source.id === id,
                );
                if (next) {
                  setSourceId(next.id);
                  setColumns(next.columns);
                  setPeople({});
                }
              }}
              options={prepared!.sources.map((source) => ({
                value: source.id,
                label: source.title,
              }))}
              trigger={
                <Button variant="outline" className="w-full justify-start">
                  {source.title}
                </Button>
              }
            />
          )}
          {source.native ? (
            <p className="text-sm">{t("importNative")}</p>
          ) : (
            <div className="space-y-2">
              {columns.map((column, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)] items-start gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <Input
                      aria-label={t("importColumnName", { index: index + 1 })}
                      value={column.name}
                      maxLength={80}
                      onChange={(event) =>
                        changeColumns((current) =>
                          current.map((column, i) =>
                            i === index
                              ? { ...column, name: event.target.value }
                              : column,
                          ),
                        )
                      }
                    />
                    <p className="truncate text-xs text-muted-foreground">
                      {source.rows
                        .slice(0, 3)
                        .map((row) => row[index])
                        .filter(Boolean)
                        .join(" · ") || t("emptyValue")}
                    </p>
                  </div>
                  <SearchSelect
                    value={column.type}
                    onChange={(type) => {
                      if (type)
                        changeColumns((current) =>
                          current.map((column, i) =>
                            i === index
                              ? { ...column, type: type as ImportColumnType }
                              : column,
                          ),
                        );
                    }}
                    options={TYPES.map((type) => ({
                      value: type,
                      label: type === "title" ? t("name") : t(type),
                    }))}
                    trigger={
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        aria-label={t("importColumnType", {
                          name: column.name,
                        })}
                      >
                        {column.type === "title" ? t("name") : t(column.type)}
                      </Button>
                    }
                  />
                </div>
              ))}
            </div>
          )}
          {source.native?.people.map((person) => (
            <div key={person.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm">
                {person.name}
              </span>
              <SearchSelect
                value={
                  people[person.id] ??
                  (members.some((member) => member.user_id === person.id)
                    ? person.id
                    : null)
                }
                onChange={(id) => {
                  if (id)
                    setPeople((current) => ({ ...current, [person.id]: id }));
                }}
                options={members.map((member) => ({
                  value: member.user_id,
                  label: displayName(member),
                }))}
                trigger={
                  <Button variant="outline" className="max-w-1/2 truncate">
                    {displayName(
                      members.find(
                        (member) =>
                          member.user_id === (people[person.id] ?? person.id),
                      ) ?? {},
                      t("importMatchPerson"),
                    )}
                  </Button>
                }
              />
            </div>
          ))}
          {preview?.error != null && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(preview.error)}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "review",
      title: t("importReviewTitle"),
      subtitle: t("importReviewDescription"),
      wide: true,
      submitLabel: t("importConfirm"),
      submitDisabled: !source || !!preview?.error,
      content: (
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <p className="font-medium">{source?.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("importSummary", {
                count: Math.max(0, (preview?.pages.length ?? 1) - 1),
                columns: preview?.pages[0]?.database_schema?.length ?? 0,
              })}
            </p>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border px-4">
            {preview?.pages.slice(1, 6).map((page) => (
              <li key={page.id} className="py-3 text-sm">
                {page.title || t("newEntry")}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {t("importPreservation")}
          </p>
        </div>
      ),
    },
  ];
  return (
    <WizardDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      label={t("importTitle")}
      steps={steps}
      stepIndex={step}
      onStepIndexChange={(index) => {
        if (!busy) {
          setStep(index);
          setError("");
        }
      }}
      onSubmit={() => {
        if (step < 2) {
          mappingTouched.current = true;
          setStep(step + 1);
        } else void commit();
      }}
      submitting={busy}
      error={error}
    />
  );
}
