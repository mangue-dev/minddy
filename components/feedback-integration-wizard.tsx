"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { NumoIcon } from "@/components/numo-icon";
import { integrationsQueryKey } from "@/lib/use-integrations-query";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import { NOTE_COMPOSE_PARAM, setAgentComposeDraft } from "@/lib/agent-compose-draft";
import { ssoEnvLine } from "@/lib/feedback/sso-env";

/**
 * « Intégrer dans mon app » (MIN-37) : wizard 2-3 étapes qui génère un prompt
 * tout-en-un décrivant quoi brancher, où et comment. Étapes : type (board/API)
 * → SSO (board uniquement, fortement recommandé) → instruction libre de
 * placement.
 *
 * Le prompt fini a DEUX destinations, et c'est le mode qui décide laquelle est
 * ouverte :
 *  • le presse-papier, pour l'agent de code de l'utilisateur (Claude Code,
 *    Cursor…) — toujours, les deux modes ;
 *  • NUMO, en un clic (MIN-37) : le prompt part comme note de run carnet sur le
 *    projet, et l'agent de minddy ouvre la pull request lui-même. Réservé au
 *    mode BOARD : ce prompt-là ne porte plus aucun credential (le secret SSO
 *    vit désormais dans une variable d'environnement que l'utilisateur
 *    renseigne). Le mode API, lui, embarque une clé en clair — on ne l'envoie
 *    pas dans une conversation d'agent, il reste copie-manuelle.
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("board");
  const [sso, setSso] = useState(true);
  const [placement, setPlacement] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [keyCreated, setKeyCreated] = useState(false);
  const [ssoSecret, setSsoSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [envCopied, setEnvCopied] = useState(false);

  // Numo ne peut travailler que sur un dépôt : sans lien git, l'option ne se
  // montre pas — un bouton qui n'aurait rien à cloner ne vaut pas un refus.
  const { link } = useProjectGitLinkQuery(projectId);

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
    setSsoSecret(null);
    setCopied(false);
    setEnvCopied(false);
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
        sso_secret?: string | null;
        error?: string;
      } | null;
      if (!response.ok || !data?.prompt) {
        throw new Error(data?.error || "Error");
      }
      setPrompt(data.prompt);
      setKeyCreated(data.key_created === true);
      setSsoSecret(data.sso_secret ?? null);
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

  /**
   * Confier le prompt à Numo : même chemin que « lancer un agent » depuis le
   * carnet (brouillon de run carnet + composer de la page Agents), avec le
   * projet déjà choisi. On passe par le composer plutôt que de lancer d'ici :
   * l'utilisateur relit la consigne, choisit son modèle et sa branche de base
   * — un run d'agent sur son dépôt ne part pas d'un clic sans revue.
   */
  const handOffToNumo = () => {
    if (!prompt) return;
    setAgentComposeDraft({ kind: "note", prompt, projectId });
    handleOpenChange(false);
    router.push(`/agents?compose=${NOTE_COMPOSE_PARAM}`);
  };

  const envLine = ssoSecret ? ssoEnvLine(ssoSecret) : null;
  const canHandOffToNumo = mode === "board" && !!link;

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
                <DialogDescription>
                  {canHandOffToNumo
                    ? t("feedbackWizardDoneDesc")
                    : t("feedbackWizardCopied")}
                </DialogDescription>
              </DialogHeader>
              <textarea
                readOnly
                value={prompt}
                className="h-40 w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs outline-none"
              />

              {/* Le prompt de board ne porte plus de secret : le voici, à part,
                  sous la seule forme qui serve — la ligne du fichier .env. */}
              {envLine && (
                <div className="flex flex-col gap-2 rounded-lg border border-brand/25 bg-brand/5 p-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">{t("feedbackWizardEnvTitle")}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t("feedbackWizardEnvDesc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {envLine}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("feedbackWizardEnvCopy")}
                      onClick={() => {
                        void navigator.clipboard.writeText(envLine);
                        setEnvCopied(true);
                        setTimeout(() => setEnvCopied(false), 2000);
                      }}
                    >
                      {envCopied ? (
                        <Check className="size-4 text-emerald-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* L'autre destination du prompt : l'agent de minddy, sur le dépôt
                  déjà lié au projet. Board seulement (cf. en-tête du fichier). */}
              {canHandOffToNumo && (
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium">{t("feedbackWizardNumoTitle")}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t("feedbackWizardNumoDesc")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handOffToNumo}
                  >
                    <NumoIcon className="size-4" />
                    {t("feedbackWizardNumoButton")}
                  </Button>
                </div>
              )}

              {(mode === "api" || keyCreated) && (
                <p className="text-xs text-muted-foreground">
                  {t("feedbackWizardSecretsWarning")}
                  {keyCreated && <> {t("feedbackWizardDoneKeyNote")}</>}
                </p>
              )}
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
                  {isLast ? t("feedbackWizardGenerate") : t("feedbackWizardNext")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
