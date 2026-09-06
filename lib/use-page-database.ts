"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import type { Page } from "./pages";
import type { PageSummary } from "./pages-api";
import type {
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseValue,
} from "./page-databases";
import type { DatabaseConversionPreview } from "./page-database-conversion";
import { pagesKey, pageKey } from "./use-pages-query";
import { beginPageWrite, queuePageWrite } from "./optimistic-page-writes";
import {
  patchDatabaseSchema,
  databaseSchemaValueChanges,
} from "./page-database-schema-patch";
import { waitForPageCreation } from "./page-creation-settlement";

export function usePageDatabase(projectId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("PageDatabase");
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
  const fail = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : t("saveFailed"));
    void queryClient.invalidateQueries({ queryKey: pagesKey(projectId) });
  };
  const saveSchema = (
    page: PageSummary,
    schema: DatabaseProperty[],
    titleName = page.database_title_name ?? null,
  ): Promise<boolean> => {
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
    const cells = (
      queryClient.getQueryData<PageSummary[]>(pagesKey(projectId)) ?? []
    )
      .filter((row) => row.parent_id === page.id)
      .flatMap((row) => {
        const changes = databaseSchemaValueChanges(
          write.base().database_schema ?? [],
          apply(write.base()).database_schema ?? [],
          row.property_values ?? {},
        );
        const ids = Object.keys(changes);
        if (!ids.length) return [];
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
    return queuePageWrite(
      queryClient,
      `database:${projectId}:${page.id}`,
      async () => {
        try {
          const base = write.base();
          const next = apply(base);
          const result = await request(page.id, {
            operation: "schema",
            schema: next.database_schema,
            titleName: next.database_title_name,
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
          fail(error);
          return false;
        }
      },
    );
  };
  const saveValue = (
    page: PageSummary,
    propertyId: string,
    value: DatabaseValue,
    expected: DatabaseValue = page.property_values?.[propertyId] ?? null,
  ): Promise<boolean> => {
    const write = beginPageWrite(
      queryClient,
      projectId,
      page,
      [`value:${propertyId}`],
      (row) => ({
        ...row,
        property_values: { ...row.property_values, [propertyId]: value },
      }),
    );
    return queuePageWrite(
      queryClient,
      `database:${projectId}:${page.parent_id ?? page.id}`,
      async () => {
        try {
          const result = await request(page.id, {
            operation: "value",
            propertyId,
            value,
            expected: write.chained
              ? (write.base().property_values?.[propertyId] ?? null)
              : expected,
          });
          write.settle(result as Page);
          return true;
        } catch (error) {
          write.settle();
          fail(error);
          return false;
        }
      },
    );
  };
  const previewConversion = async (
    page: PageSummary,
    propertyId: string,
    targetType: DatabasePropertyType,
    name: string,
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
      fail(error);
      return null;
    } finally {
      setPendingCount((count) => count - 1);
    }
  };

  const convertColumn = async (
    page: PageSummary,
    propertyId: string,
    targetType: DatabasePropertyType,
    name: string,
    preview: DatabaseConversionPreview,
    confirmLoss: boolean,
  ) => {
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
                      targetType === "created_at"
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
                  targetType === "created_at"
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
          fail(error);
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
