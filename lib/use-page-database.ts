"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Page } from "./pages";
import type { PageSummary } from "./pages-api";
import {
  isDatabaseMetadataType,
  type DatabaseProperty,
  type DatabasePropertyType,
  type DatabaseValue,
  type DatabaseValues,
} from "./page-databases";
import type { DatabaseConversionPreview } from "./page-database-conversion";
import { pagesKey, pageKey } from "./use-pages-query";
import { beginPageWrite, queuePageWrite } from "./optimistic-page-writes";
import {
  patchDatabaseSchema,
  databaseSchemaValueChanges,
} from "./page-database-schema-patch";
import { waitForPageCreation } from "./page-creation-settlement";
import { useUndoHistory } from "./undo/undo-context";
import { replayGestures } from "./undo/undo-core";

const isDeepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A database page's columns, as an undo entry keeps them. */
type SchemaState = { schema: DatabaseProperty[]; titleName: string | null };

export function usePageDatabase(projectId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("PageDatabase");
  const undo = useUndoHistory();
  const [pendingCount, setPendingCount] = useState(0);
  const request = useCallback(
    async (pageId: string, input: unknown) => {
      await waitForPageCreation(pageId);
      const response = await fetch(
        `/api/projects/${projectId}/pages/${pageId}/database`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("saveFailed"));
      return data as Page | DatabaseConversionPreview;
    },
    [projectId, t],
  );
  const fail = (error: unknown, quiet = false) => {
    // A replayed edit reports through the undo history's own toast.
    if (!quiet) toast.error(error instanceof Error ? error.message : t("saveFailed"));
    void queryClient.invalidateQueries({ queryKey: pagesKey(projectId) });
  };
  /** The row as the list holds it now: a replay starts from the present. */
  const current = (page: PageSummary): PageSummary =>
    queryClient.getQueryData<PageSummary[]>(pagesKey(projectId))
      ?.find((row) => row.id === page.id) ?? page;
  /** A replay that failed says so, and the history drops its entry. */
  const replayed = async (write: Promise<boolean>) => {
    if (!(await write)) throw new Error(t("saveFailed"));
  };
  const writeSchema = (
    page: PageSummary,
    schema: DatabaseProperty[],
    titleName: string | null,
    quiet: boolean,
  ) => {
    const apply = (row: PageSummary): PageSummary => ({
      ...row,
      database_schema: patchDatabaseSchema(
        row.database_schema ?? [],
        page.database_schema ?? [],
        schema,
      ),
      database_title_name:
        titleName !== (page.database_title_name ?? null)
          ? titleName
          : row.database_title_name,
      database_revision: (row.database_revision ?? 0) + 1,
    });
    const write = beginPageWrite(
      queryClient,
      projectId,
      page,
      ["database_schema", "database_title_name", "database_revision"],
      apply,
    );
    const before: SchemaState = {
      schema: write.base().database_schema ?? [],
      titleName: write.base().database_title_name ?? null,
    };
    const next = apply(write.base());
    const after: SchemaState = {
      schema: next.database_schema ?? [],
      titleName: next.database_title_name ?? null,
    };
    /** The values this edit strips, per entry, so an undo can put them back. */
    const stripped: { page: PageSummary; values: DatabaseValues }[] = [];
    const cells = (
      queryClient.getQueryData<PageSummary[]>(pagesKey(projectId)) ?? []
    )
      .filter((row) => row.parent_id === page.id)
      .flatMap((row) => {
        const changes = databaseSchemaValueChanges(
          before.schema,
          after.schema,
          row.property_values ?? {},
        );
        const ids = Object.keys(changes);
        if (!ids.length) return [];
        stripped.push({
          page: row,
          values: Object.fromEntries(ids.map((id) => [id, row.property_values?.[id] ?? null])),
        });
        const applyValues = (entry: PageSummary) => ({
          ...entry,
          property_values: { ...entry.property_values, ...changes },
        });
        return [
          {
            apply: applyValues,
            write: beginPageWrite(
              queryClient,
              projectId,
              row,
              ids.map((id) => `value:${id}` as const),
              applyValues,
            ),
          },
        ];
      });
    const done = queuePageWrite(
      queryClient,
      `database:${projectId}:${page.id}`,
      async () => {
        try {
          const base = write.base();
          const result = await request(page.id, {
            operation: "schema",
            schema: apply(base).database_schema,
            titleName: apply(base).database_title_name,
            revision: write.chained
              ? (base.database_revision ?? 0)
              : (page.database_revision ?? 0),
          });
          write.settle(result as Page);
          for (const cell of cells)
            cell.write.settle(cell.apply(cell.write.base()));
          return true;
        } catch (error) {
          write.settle();
          for (const cell of cells) cell.write.settle();
          fail(error, quiet);
          return false;
        }
      },
    );
    return { done, before, after, stripped };
  };
  const writeValues = (
    page: PageSummary,
    values: DatabaseValues,
    expected: DatabaseValues,
    quiet: boolean,
  ): Promise<boolean> => {
    const ids = Object.keys(values);
    const write = beginPageWrite(
      queryClient,
      projectId,
      page,
      ids.map((id) => `value:${id}` as const),
      (row) => ({
        ...row,
        property_values: { ...row.property_values, ...values },
      }),
    );
    return queuePageWrite(
      queryClient,
      `database:${projectId}:${page.parent_id ?? page.id}`,
      async () => {
        try {
          const base = write.base().property_values ?? {};
          const previous = (id: string) =>
            write.chained ? (base[id] ?? null) : (expected[id] ?? null);
          // One cell keeps the single-cell request the previous release reads.
          const result = await request(page.id, ids.length === 1
            ? { operation: "value", propertyId: ids[0], value: values[ids[0]],
                expected: previous(ids[0]) }
            : { operation: "values", values,
                expected: Object.fromEntries(ids.map((id) => [id, previous(id)])) });
          write.settle(result as Page);
          return true;
        } catch (error) {
          write.settle();
          fail(error, quiet);
          return false;
        }
      },
    );
  };
  /** Bring a database's columns from one recorded state to the other. */
  const replaySchema = async (
    database: PageSummary,
    from: SchemaState,
    to: SchemaState,
    restore: { page: PageSummary; values: DatabaseValues }[],
  ) => {
    const row = current(database);
    const schema = writeSchema(
      { ...row, database_schema: from.schema, database_title_name: from.titleName },
      to.schema,
      to.titleName,
      true,
    );
    // Values go back once their column or option exists again: same queue.
    const values = restore.map(({ page, values: saved }) => {
      const entry = current(page);
      const expected = Object.fromEntries(Object.keys(saved).map((id) =>
        [id, entry.property_values?.[id] ?? null]));
      return writeValues(entry, saved, expected, true);
    });
    await replayed(schema.done);
    await Promise.all(values.map(replayed));
  };
  const saveSchema = (
    page: PageSummary,
    schema: DatabaseProperty[],
    titleName = page.database_title_name ?? null,
  ): Promise<boolean> => {
    const { done, before, after, stripped } = writeSchema(page, schema, titleName, false);
    if (isDeepEqual(before, after)) return done;
    const gestures = replayGestures(
      done,
      () => replaySchema(page, after, before, stripped),
      () => replaySchema(page, before, after, []),
    );
    const recorded = undo.record(
      { kind: "replay", projectId, label: "databaseColumns", ...gestures },
      done,
    );
    void done.then((saved) => { if (!saved) recorded?.retract(); });
    return done;
  };
  const saveValue = (
    page: PageSummary,
    propertyId: string,
    value: DatabaseValue,
    expected: DatabaseValue = page.property_values?.[propertyId] ?? null,
  ): Promise<boolean> => {
    const done = writeValues(page, { [propertyId]: value }, { [propertyId]: expected }, false);
    if (isDeepEqual(value, expected)) return done;
    const gestures = replayGestures(
      done,
      () => replayed(writeValues(current(page), { [propertyId]: expected }, { [propertyId]: value }, true)),
      () => replayed(writeValues(current(page), { [propertyId]: value }, { [propertyId]: expected }, true)),
    );
    const recorded = undo.record(
      { kind: "replay", projectId, label: "databaseValue", ...gestures },
      done,
    );
    void done.then((saved) => { if (!saved) recorded?.retract(); });
    return done;
  };
  const previewConversion = async (
    page: PageSummary,
    propertyId: string,
    targetType: DatabasePropertyType,
    name: string,
    quiet = false,
  ): Promise<DatabaseConversionPreview | null> => {
    setPendingCount((count) => count + 1);
    try {
      const result = await queuePageWrite(
        queryClient,
        `database:${projectId}:${page.id}`,
        () =>
          request(page.id, {
            operation: "convert",
            propertyId,
            targetType,
            name,
            revision: page.database_revision ?? 0,
            preview: true,
          }),
      );
      return "status" in result ? result : null;
    } catch (error) {
      fail(error, quiet);
      return null;
    } finally {
      setPendingCount((count) => count - 1);
    }
  };

  /**
   * Converting a column is undoable (MIN-990): the column goes back to its
   * former type through the same guarded conversion, takes its former
   * definition (name, options, format) and gets back the values the
   * conversion changed or cleared.
   */
  const convertColumn = (
    page: PageSummary,
    propertyId: string,
    targetType: DatabasePropertyType,
    name: string,
    preview: DatabaseConversionPreview,
    confirmLoss: boolean,
  ): Promise<boolean> => {
    const original = current(page).database_schema?.find((p) => p.id === propertyId);
    const entries = (queryClient.getQueryData<PageSummary[]>(pagesKey(projectId)) ?? [])
      .filter((row) => row.parent_id === page.id);
    const saved = entries.flatMap((row) => {
      const value = row.property_values?.[propertyId] ?? null;
      return value === null ? [] : [{ page: row, value }];
    });
    const done = convertRaw(page, propertyId, targetType, name, preview, confirmLoss, false);
    if (!original) return done;
    /** One guarded conversion of the column as it stands now. */
    const convertTo = async (type: DatabasePropertyType, label: string, loss: boolean) => {
      const row = current(page);
      const next = await previewConversion(row, propertyId, type, label, true);
      if (!next) throw new Error(t("saveFailed"));
      await replayed(convertRaw(row, propertyId, type, label, next, loss, true));
    };
    const gestures = replayGestures(
      done,
      async () => {
        // Clearing what cannot convert back is safe: the saved values follow.
        await convertTo(original.type, original.name, true);
        const row = current(page);
        await replayed(writeSchema(row, (row.database_schema ?? []).map((p) =>
          p.id === propertyId ? original : p), row.database_title_name ?? null, true).done);
        await Promise.all(saved.map(({ page: entry, value }) => {
          const now = current(entry).property_values?.[propertyId] ?? null;
          return isDeepEqual(now, value) ? undefined
            : replayed(writeValues(current(entry), { [propertyId]: value }, { [propertyId]: now }, true));
        }));
      },
      () => convertTo(targetType, name, confirmLoss),
    );
    const recorded = undo.record(
      { kind: "replay", projectId, label: "databaseColumns", ...gestures },
      done,
    );
    void done.then((ok) => { if (!ok) recorded?.retract(); });
    return done;
  };

  const convertRaw = async (
    page: PageSummary,
    propertyId: string,
    targetType: DatabasePropertyType,
    name: string,
    preview: DatabaseConversionPreview,
    confirmLoss: boolean,
    quiet: boolean,
  ): Promise<boolean> => {
    const entries =
      queryClient.getQueryData<PageSummary[]>(pagesKey(projectId)) ?? [];
    const column = preview.column;
    const write = column
      ? beginPageWrite(
          queryClient,
          projectId,
          page,
          ["database_schema", "database_revision"],
          (row) => ({
            ...row,
            database_schema: row.database_schema?.map((p) =>
              p.id === propertyId ? column : p,
            ),
            database_revision: (row.database_revision ?? 0) + 1,
          }),
        )
      : null;
    const cells =
      column && preview.values
        ? entries
            .filter((row) => row.parent_id === page.id)
            .map((row) => ({
              page: row,
              write: beginPageWrite(
                queryClient,
                projectId,
                row,
                [`value:${propertyId}`],
                (entry) => ({
                  ...entry,
                  property_values: {
                    ...entry.property_values,
                    [propertyId]:
                      isDatabaseMetadataType(targetType)
                        ? null
                        : (preview.values![row.id] ?? null),
                  },
                }),
              ),
            }))
        : [];
    return queuePageWrite(
      queryClient,
      `database:${projectId}:${page.id}`,
      async () => {
        try {
          const result = await request(page.id, {
            operation: "convert",
            propertyId,
            targetType,
            name,
            revision: page.database_revision ?? 0,
            preview: false,
            token: preview.token,
            confirmLoss,
          });
          if ("status" in result) throw new Error(t("saveFailed"));
          write?.settle(result);
          const values = (
            result as Page & {
              conversion_values?: Record<string, DatabaseValue>;
            }
          ).conversion_values;
          for (const cell of cells)
            cell.write.settle({
              ...cell.page,
              property_values: {
                ...cell.page.property_values,
                [propertyId]:
                  isDatabaseMetadataType(targetType)
                    ? null
                    : (values?.[cell.page.id] ??
                      preview.values?.[cell.page.id] ??
                      null),
              },
            });
          if (!write) {
            queryClient.setQueryData<PageSummary[]>(
              pagesKey(projectId),
              (rows) =>
                rows?.map((row) =>
                  row.id === page.id
                    ? {
                        ...row,
                        database_schema: result.database_schema,
                        database_revision: result.database_revision,
                      }
                    : row,
                ),
            );
            void queryClient.invalidateQueries({
              queryKey: pagesKey(projectId),
            });
            void queryClient.invalidateQueries({ queryKey: pageKey(page.id) });
            for (const entry of entries)
              if (entry.parent_id === page.id)
                void queryClient.invalidateQueries({
                  queryKey: pageKey(entry.id),
                });
          }
          return true;
        } catch (error) {
          write?.settle();
          for (const cell of cells) cell.write.settle();
          fail(error, quiet);
          return false;
        }
      },
    );
  };
  return {
    saveSchema,
    saveValue,
    previewConversion,
    convertColumn,
    pending: pendingCount > 0,
  };
}
