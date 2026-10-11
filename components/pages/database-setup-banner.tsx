"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, toast } from "mangue-ui";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { NumoIcon } from "@/components/numo-icon";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
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
  const assistant = useAssistantPanelActions();
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
        className="mb-6"
      >
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-sm font-medium">{t("newDatabase")}</p>
          <AppTooltip label={t("dismissSetup")}><Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("dismissSetup")}
            onClick={dismiss}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button></AppTooltip>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto min-h-32 w-full flex-col items-start justify-between gap-8 rounded-xl px-5 py-5 text-left whitespace-normal"
            disabled={opening}
            onClick={() => void ask()}
          >
            <NumoIcon animated={false} className="size-5 shrink-0" />
            {t("setupAction")}
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-32 w-full flex-col items-start justify-between gap-8 rounded-xl px-5 py-5 text-left whitespace-normal"
            onClick={() => setImporting(true)}
          >
            <HugeiconsIcon icon={Upload01Icon} className="size-4 shrink-0" />
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
