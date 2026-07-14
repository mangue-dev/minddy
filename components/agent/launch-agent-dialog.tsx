"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Textarea,
  toast,
} from "mangue-ui";
import { launchAgentRunApi } from "@/lib/agent-api";
import { issueAgentRunsQueryKey } from "@/lib/use-agent-runs";
import { useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { ModelCombobox } from "./model-combobox";

/**
 * Dialogue « Lancer l'agent de code » (MIN-46) : picker de modèle (défaut perso
 * ou modèle précis = override), instructions optionnelles, indice quota/BYOK.
 */
export function LaunchAgentDialog({
  open,
  onOpenChange,
  issueId,
  onLaunched,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  onLaunched?: () => void;
}) {
  const t = useTranslations("Agent");
  const queryClient = useQueryClient();
  const { keys } = useAiKeysQuery();
  const hasByok = keys.some((k) => k.provider === "openrouter");

  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [launching, setLaunching] = useState(false);

  const launch = async () => {
    if (launching) return;
    setLaunching(true);
    try {
      await launchAgentRunApi(issueId, {
        prompt: prompt.trim() || undefined,
        model: model || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) });
      toast.success(t("launchedToast"));
      setPrompt("");
      setModel("");
      onOpenChange(false);
      onLaunched?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("modelLabel")}</label>
            <ModelCombobox
              value={model}
              onChange={setModel}
              defaultLabel={t("modelDefault")}
              placeholder={t("modelSearchPlaceholder")}
              emptyLabel={t("modelSearchEmpty")}
              loadingLabel={t("modelSearchLoading")}
              disabled={launching}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("promptLabel")}</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("promptPlaceholder")}
              rows={3}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {hasByok ? t("byokUnlimited") : t("platformCapped")}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => void launch()} disabled={launching}>
            {launching && <Spinner />}
            {t("launch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
