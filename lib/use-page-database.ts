"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import type { Page } from "./pages";
import type { PageSummary } from "./pages-api";
import type { DatabaseProperty, DatabaseValue } from "./page-databases";
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
        const page = data as Page;
        // Only update metadata: the editor owns its body and unsaved document changes.
        const patch = {
          database_schema: page.database_schema,
          database_revision: page.database_revision,
          property_values: page.property_values,
        };
        await queryClient.cancelQueries({ queryKey: pagesKey(projectId) });
        queryClient.setQueryData<PageSummary[]>(pagesKey(projectId), (rows) =>
          rows?.map((row) => (row.id === pageId ? { ...row, ...patch } : row)),
        );
        queryClient.setQueryData<Page>(pageKey(pageId), (row) =>
          row ? { ...row, ...patch } : row,
        );
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("saveFailed"));
        return false;
      } finally {
        setPending(false);
        void queryClient.invalidateQueries({ queryKey: pagesKey(projectId) });
      }
    },
    [projectId, queryClient, t],
  );

  const saveSchema = (page: PageSummary, schema: DatabaseProperty[]) =>
    mutate(page.id, {
      operation: "schema",
      schema,
      revision: page.database_revision ?? 0,
    });
  const saveValue = (
    page: PageSummary,
    propertyId: string,
    value: DatabaseValue,
    expected: DatabaseValue = page.property_values?.[propertyId] ?? null,
  ) => mutate(page.id, { operation: "value", propertyId, value, expected });
  return { saveSchema, saveValue, pending };
}
