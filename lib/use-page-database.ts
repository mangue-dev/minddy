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
import { waitForPageCreation } from "./page-creation-settlement";

export function usePageDatabase(projectId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("PageDatabase");
  const [pending, setPending] = useState(false);
  const mutate = useCallback(
    async (pageId: string, input: unknown) => {
      setPending(true);
      try {
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
        if (data.status === "preview") return data as DatabaseConversionPreview;
        const page = data as Page;
        // Only update metadata: the editor owns its body and unsaved document changes.
        const patch = {
          database_schema: page.database_schema,
          database_revision: page.database_revision,
          database_title_name: page.database_title_name,
          property_values: page.property_values,
        };
        await queryClient.cancelQueries({ queryKey: pagesKey(projectId) });
        queryClient.setQueryData<PageSummary[]>(pagesKey(projectId), (rows) =>
          rows?.map((row) => (row.id === pageId ? { ...row, ...patch } : row)),
        );
        queryClient.setQueryData<Page>(pageKey(pageId), (row) =>
          row ? { ...row, ...patch } : row,
        );
        if ((input as { operation?: string }).operation === "convert") {
          const entries = queryClient.getQueryData<PageSummary[]>(
            pagesKey(projectId),
          );
          for (const entry of entries ?? []) {
            if (entry.parent_id === pageId)
              void queryClient.invalidateQueries({
                queryKey: pageKey(entry.id),
              });
          }
        }
        return page;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("saveFailed"));
        return null;
      } finally {
        setPending(false);
        void queryClient.invalidateQueries({ queryKey: pagesKey(projectId) });
      }
    },
    [projectId, queryClient, t],
  );

  const saveSchema = async (
    page: PageSummary,
    schema: DatabaseProperty[],
    titleName = page.database_title_name ?? null,
  ) =>
    !!(await mutate(page.id, {
      operation: "schema",
      titleName,
      schema,
      revision: page.database_revision ?? 0,
    }));
  const saveValue = async (
    page: PageSummary,
    propertyId: string,
    value: DatabaseValue,
    expected: DatabaseValue = page.property_values?.[propertyId] ?? null,
  ) =>
    !!(await mutate(page.id, {
      operation: "value",
      propertyId,
      value,
      expected,
    }));
  const previewConversion = async (
    page: PageSummary,
    propertyId: string,
    targetType: DatabasePropertyType,
    name: string,
  ): Promise<DatabaseConversionPreview | null> => {
    const result = await mutate(page.id, {
      operation: "convert",
      propertyId,
      targetType,
      name,
      revision: page.database_revision ?? 0,
      preview: true,
    });
    return result && "status" in result ? result : null;
  };
  const convertColumn = async (
    page: PageSummary,
    propertyId: string,
    targetType: DatabasePropertyType,
    name: string,
    preview: DatabaseConversionPreview,
    confirmLoss: boolean,
  ) => {
    const result = await mutate(page.id, {
      operation: "convert",
      propertyId,
      targetType,
      name,
      revision: page.database_revision ?? 0,
      preview: false,
      token: preview.token,
      confirmLoss,
    });
    return !!result && !("status" in result);
  };
  return { saveSchema, saveValue, previewConversion, convertColumn, pending };
}
