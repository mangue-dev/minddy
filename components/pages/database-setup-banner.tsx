"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, toast } from "mangue-ui";
import { Sparkles, Upload, X } from "lucide-react";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import {
  dismissDatabaseSetup,
  isDatabaseSetupPending,
} from "@/lib/page-database-setup";
import { waitForPageCreation } from "@/lib/page-creation-settlement";
import { DatabaseImportDialog } from "./database-import-dialog";
import type { PageSummary } from "@/lib/pages-api";

export function DatabaseSetupBanner({
  projectId,
  page,
}: {
  projectId: string;
  page: PageSummary;
}) {
  const t = useTranslations("PageDatabase");
  const assistant = useAssistantPanel();
  const [visible, setVisible] = useState(() => isDatabaseSetupPending(page.id));
  const [importing, setImporting] = useState(false);
  const [opening, setOpening] = useState(false);
  const dismiss = () => {
    dismissDatabaseSetup(page.id);
    setVisible(false);
  };
  if (!visible) return null;
  const ask = async () => {
    setOpening(true);
    try {
      await waitForPageCreation(page.id);
      assistant.open({
        projectId,
        prompt: t("setupPrompt"),
        pageContext: {
          projectId,
          pageId: page.id,
          pageTitle: page.title,
          pageIcon: page.icon,
        },
      });
      dismiss();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setOpening(false);
    }
  };
  return (
    <>
      <div
        data-database-setup
        className="mb-6 rounded-xl border border-border bg-muted/30 p-3"
      >
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-sm font-medium">{t("newDatabase")}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("dismissSetup")}
            onClick={dismiss}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-auto min-h-9 whitespace-normal text-left"
            disabled={opening}
            onClick={() => void ask()}
          >
            <Sparkles className="size-4 shrink-0" />
            {t("setupAction")}
          </Button>
          <Button
            variant="ghost"
            className="h-auto min-h-9 whitespace-normal text-left"
            onClick={() => setImporting(true)}
          >
            <Upload className="size-4 shrink-0" />
            {t("importAction")}
          </Button>
        </div>
      </div>
      {importing && (
        <DatabaseImportDialog
          projectId={projectId}
          database={page}
          onClose={() => setImporting(false)}
          onImported={dismiss}
        />
      )}
    </>
  );
}
