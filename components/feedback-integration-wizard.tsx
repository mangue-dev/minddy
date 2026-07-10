"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { ArrowLeft, Check, Copy, Globe, Plug } from "lucide-react";
import { integrationsQueryKey } from "@/lib/use-integrations-query";

/**
 * « Intégrer dans mon app » (MIN-37) : wizard 2-3 étapes qui génère un prompt
 * tout-en-un à coller dans un agent de code (Claude Code, Cursor…). Le prompt
 * embarque instructions + secrets (URL du board, secret SSO ou clé API neuve)
 * — pas de MCP, prêt à l'emploi. Étapes : type (board/API) → SSO (board
 * uniquement, fortement recommandé) → instruction libre de placement.
 */

type Mode = "board" | "api";
type StepId = "type" | "sso" | "placement";

function OptionCard({
  selected,
  icon: Icon,
  label,
  description,
  badge,
  onSelect,
}: {
  selected: boolean;
  icon?: typeof Globe;
  label: string;
  description: string;
  badge?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        selected ? "border-primary/60 bg-primary/5" : "hover:border-foreground/25"
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            selected ? "text-primary" : "text-muted-foreground"
          )}
        />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {badge && (
            <Badge variant="secondary" className="border-brand/30 text-brand">
              {badge}
            </Badge>
          )}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

export function FeedbackIntegrationWizard({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("board");
  const [sso, setSso] = useState(true);
  const [placement, setPlacement] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [keyCreated, setKeyCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  const steps: StepId[] = mode === "board" ? ["type", "sso", "placement"] : ["type", "placement"];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;

  const reset = () => {
    setMode("board");
    setSso(true);
    setPlacement("");
    setStepIndex(0);
    setPrompt(null);
    setKeyCreated(false);
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    setOpen(next);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("feedbackWizardCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Le panneau affiche le prompt : la copie manuelle reste possible.
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/feedback/integration-prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            sso: mode === "board" ? sso : false,
            placement: placement.trim(),
          }),
        }
      );
      const data = (await response.json().catch(() => null)) as {
        prompt?: string;
        key_created?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !data?.prompt) {
        throw new Error(data?.error || "Error");
      }
      setPrompt(data.prompt);
      setKeyCreated(data.key_created === true);
      // Le board/la clé ont pu être provisionnés : rafraîchir les vues settings.
      void queryClient.invalidateQueries({ queryKey: ["feedback-settings", projectId] });
      void queryClient.invalidateQueries({ queryKey: integrationsQueryKey(projectId) });
      await copyToClipboard(data.prompt);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 rounded-lg border border-brand/25 bg-brand/5 p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium">{t("feedbackWizardTitle")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("feedbackWizardDesc")}
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
          {t("feedbackWizardButton")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          {prompt ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="size-4 text-emerald-500" />
                  {t("feedbackWizardDoneTitle")}
                </DialogTitle>
                <DialogDescription>{t("feedbackWizardCopied")}</DialogDescription>
              </DialogHeader>
              <textarea
                readOnly
                value={prompt}
                className="h-48 w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs outline-none"
              />
              <p className="text-xs text-muted-foreground">
                {t("feedbackWizardSecretsWarning")}
                {keyCreated && <> {t("feedbackWizardDoneKeyNote")}</>}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => void copyToClipboard(prompt)}>
                  {copied ? <Check className="text-emerald-500" /> : <Copy />}
                  {t("feedbackWizardCopy")}
                </Button>
                <Button onClick={() => handleOpenChange(false)}>
                  {t("integrationKeyDone")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isLast) void generate();
                else setStepIndex((i) => i + 1);
              }}
              className="flex flex-col gap-4"
            >
              <DialogHeader>
                <DialogTitle>{t("feedbackWizardTitle")}</DialogTitle>
                <DialogDescription>
                  {t("feedbackWizardStep", {
                    current: stepIndex + 1,
                    total: steps.length,
                  })}
                  {" · "}
                  {step === "type"
                    ? t("feedbackWizardTypeTitle")
                    : step === "sso"
                      ? t("feedbackWizardSsoTitle")
                      : t("feedbackWizardPlacementTitle")}
                </DialogDescription>
              </DialogHeader>

              {step === "type" && (
                <div className="flex flex-col gap-2" role="radiogroup">
                  <OptionCard
                    selected={mode === "board"}
                    icon={Globe}
                    label={t("feedbackWizardTypeBoard")}
                    description={t("feedbackWizardTypeBoardDesc")}
                    onSelect={() => setMode("board")}
                  />
                  <OptionCard
                    selected={mode === "api"}
                    icon={Plug}
                    label={t("feedbackWizardTypeApi")}
                    description={t("feedbackWizardTypeApiDesc")}
                    onSelect={() => setMode("api")}
                  />
                </div>
              )}

              {step === "sso" && (
                <div className="flex flex-col gap-2" role="radiogroup">
                  <OptionCard
                    selected={sso}
                    label={t("feedbackWizardSsoYes")}
                    description={t("feedbackWizardSsoYesDesc")}
                    badge={t("feedbackSsoRecommended")}
                    onSelect={() => setSso(true)}
                  />
                  <OptionCard
                    selected={!sso}
                    label={t("feedbackWizardSsoNo")}
                    description={t("feedbackWizardSsoNoDesc")}
                    onSelect={() => setSso(false)}
                  />
                </div>
              )}

              {step === "placement" && (
                <textarea
                  autoFocus
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value)}
                  placeholder={t("feedbackWizardPlacementPlaceholder")}
                  maxLength={500}
                  className="h-24 w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                />
              )}

              <DialogFooter className="flex-row items-center justify-between sm:justify-between">
                {stepIndex > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStepIndex((i) => i - 1)}
                  >
                    <ArrowLeft />
                    {t("feedbackWizardBack")}
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" disabled={generating}>
                  {generating && <Spinner />}
                  {isLast ? t("feedbackWizardCopy") : t("feedbackWizardNext")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
