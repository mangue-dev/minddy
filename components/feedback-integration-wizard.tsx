"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Textarea, toast } from "mangue-ui";
import { Check, Copy, Globe, KeyRound, Mail, Plug } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  WizardDialog,
  type WizardStep,
} from "@/components/wizard/wizard-dialog";
import { WizardChoiceCard } from "@/components/wizard/wizard-choice-card";
import { integrationsQueryKey } from "@/lib/use-integrations-query";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { ssoEnvLine } from "@/lib/feedback/env-lines";
import { integrationKeyEnvLine } from "@/lib/feedback/integration-contract";

/**
 * « Intégrer dans mon app » (MIN-37) : wizard qui génère un prompt tout-en-un
 * décrivant quoi brancher, où et comment. Étapes : type (board/API) → SSO
 * (board uniquement, fortement recommandé) → instruction libre de placement →
 * le prompt.
 *
 * La forme est celle de tous les wizards de minddy (`WizardDialog`) : ce
 * fichier ne décrit que ses étapes.
 *
 * Le prompt fini a DEUX destinations, ouvertes toutes les deux dans les DEUX
 * modes :
 *  • le presse-papier, pour l'agent de code de l'utilisateur (Claude Code,
 *    Cursor…) ;
 *  • NUMO, en un clic : le prompt amorce une conversation d'agent sur le
 *    projet, et l'agent de minddy ouvre la pull request lui-même.
 *
 * Ce qui rend la seconde possible, c'est que plus aucun prompt ne porte de
 * credential : le secret SSO comme la clé d'API vivent dans une variable
 * d'environnement, et le wizard montre à part la LIGNE à coller dans le `.env`.
 * Remettre un secret dans un de ces textes, c'est le mettre dans une
 * conversation d'agent — donc l'un ne va pas sans l'autre.
 */

type Mode = "board" | "api";
type StepId = "type" | "sso" | "placement" | "done";

/** Une instruction de placement, pas un cahier des charges. */
const PLACEMENT_MAX_CHARS = 500;

export function FeedbackIntegrationWizard({
  projectId,
}: {
  projectId: string;
}) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
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
  /** La ligne de `.env` que ce prompt-ci attend (secret SSO ou clé), s'il en attend une. */
  const [env, setEnv] = useState<{ line: string; description: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [envCopied, setEnvCopied] = useState(false);

  // Numo ne peut travailler que sur un dépôt : sans lien git, l'option ne se
  // montre pas — un bouton qui n'aurait rien à cloner ne vaut pas un refus.
  const { link } = useProjectGitLinkQuery(projectId);
  const canHandOffToNumo = !!link;

  // Le SSO ne se pose que pour le board : en mode API, c'est l'app appelante
  // qui dit au nom de qui elle dépose.
  const steps: StepId[] =
    mode === "board"
      ? ["type", "sso", "placement", "done"]
      : ["type", "placement", "done"];

  const reset = () => {
    setMode("board");
    setSso(true);
    setPlacement("");
    setStepIndex(0);
    setPrompt(null);
    setKeyCreated(false);
    setEnv(null);
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
      // La copie automatique qui suit la génération peut être refusée (elle ne
      // part pas d'un clic). Rien à dire ici : la dernière étape porte le
      // bouton « Copier le prompt », et LUI part bien d'un geste.
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
        },
      );
      const data = (await response.json().catch(() => null)) as {
        prompt?: string;
        key_created?: boolean;
        sso_secret?: string | null;
        api_key?: string | null;
        error?: string;
      } | null;
      if (!response.ok || !data?.prompt) {
        throw new Error(data?.error || "Error");
      }
      setPrompt(data.prompt);
      setKeyCreated(data.key_created === true);
      // Le credential que le prompt ATTEND sans le porter. La clé d'API est en
      // plus jetable-à-l'affichage (aucune relecture possible) : sa phrase le
      // dit, là où le secret SSO reste consultable dans les réglages.
      setEnv(
        data.api_key
          ? {
              line: integrationKeyEnvLine("feedback", data.api_key),
              description: t("feedbackWizardEnvDescKey"),
            }
          : data.sso_secret
            ? {
                line: ssoEnvLine(data.sso_secret),
                description: t("feedbackWizardEnvDescSso"),
              }
            : null,
      );
      // Le board/la clé ont pu être provisionnés : rafraîchir les vues settings.
      void queryClient.invalidateQueries({
        queryKey: ["feedback-settings", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(projectId),
      });
      await copyToClipboard(data.prompt);
      setStepIndex((i) => i + 1);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Confier le prompt à Numo : même chemin que « lancer un agent » depuis le
   * carnet (brouillon de conversation sans ticket + composer de la page
   * Agents), avec le projet déjà choisi. On passe par le composer plutôt que de
   * lancer d'ici : l'utilisateur relit la consigne, choisit son modèle et sa
   * branche de base — un run d'agent sur son dépôt ne part pas d'un clic sans
   * revue.
   */
  const handOffToNumo = () => {
    if (!prompt) return;
    setAgentComposeDraft({ kind: "free", prompt, projectId });
    handleOpenChange(false);
    router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`);
  };

  const stepDefs: Record<StepId, WizardStep<StepId>> = {
    // Le choix qui décide de tout le reste : où vivent les retours. Deux
    // portes illustrées, de même poids — mais chacune emmène assez loin pour
    // mériter sa description, ce que la première étape du wizard de projet, où
    // les libellés se suffisent, n'a pas besoin de faire.
    type: {
      id: "type",
      title: t("feedbackWizardTypeTitle"),
      subtitle: t("feedbackWizardTypeDesc"),
      wide: true,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("feedbackWizardTypeTitle")}
        >
          <WizardChoiceCard
            selected={mode === "board"}
            icon={Globe}
            label={t("feedbackWizardTypeBoard")}
            description={t("feedbackWizardTypeBoardDesc")}
            onSelect={() => setMode("board")}
          />
          <WizardChoiceCard
            selected={mode === "api"}
            icon={Plug}
            label={t("feedbackWizardTypeApi")}
            description={t("feedbackWizardTypeApiDesc")}
            onSelect={() => setMode("api")}
          />
        </div>
      ),
    },

    // Le SSO est celui des deux qu'on recommande — mais il est DÉJÀ choisi à
    // l'ouverture, et une carte sélectionnée le dit mieux qu'une pastille
    // « recommandé » posée à côté.
    sso: {
      id: "sso",
      title: t("feedbackWizardSsoTitle"),
      wide: true,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("feedbackWizardSsoTitle")}
        >
          <WizardChoiceCard
            selected={sso}
            icon={KeyRound}
            label={t("feedbackWizardSsoYes")}
            description={t("feedbackWizardSsoYesDesc")}
            onSelect={() => setSso(true)}
          />
          <WizardChoiceCard
            selected={!sso}
            icon={Mail}
            label={t("feedbackWizardSsoNo")}
            description={t("feedbackWizardSsoNoDesc")}
            onSelect={() => setSso(false)}
          />
        </div>
      ),
    },

    placement: {
      id: "placement",
      title: t("feedbackWizardPlacementTitle"),
      submitLabel: t("feedbackWizardGenerate"),
      content: (
        // Décrire un emplacement, c'est raconter son app — plus facile à dire
        // qu'à taper. Le micro se pose DANS le champ, et le transcrit s'ajoute
        // à la suite de ce qui est déjà écrit plutôt que de l'écraser.
        <div className="relative">
          <Textarea
            autoFocus
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            placeholder={t("feedbackWizardPlacementPlaceholder")}
            aria-label={t("feedbackWizardPlacementTitle")}
            maxLength={PLACEMENT_MAX_CHARS}
            rows={5}
            className="min-h-32 resize-none pb-12"
          />
          <DictateButton
            floating
            disabled={generating}
            onTranscription={(text) =>
              setPlacement((current) =>
                (current.trim() ? `${current.trim()} ${text}` : text).slice(
                  0,
                  PLACEMENT_MAX_CHARS,
                ),
              )
            }
          />
        </div>
      ),
    },

    // Le prompt existe : la clé a pu être créée, le board provisionné. Revenir
    // en arrière ne défait rien de tout ça — l'étape est terminale.
    done: {
      id: "done",
      title: t("feedbackWizardDoneTitle"),
      subtitle: canHandOffToNumo
        ? t("feedbackWizardDoneDesc")
        : t("feedbackWizardCopied"),
      lockBack: true,
      submitLabel: t("integrationKeyDone"),
      // Le prompt lui-même ne s'affiche pas : il est long, il est déjà dans le
      // presse-papier, et le relire ici n'apprend rien — c'est l'agent qui le
      // lit. Reste ce qui demande un geste, dans l'ordre où il se fait : la
      // ligne à poser dans le `.env` d'abord (une clé ne se remontre pas), puis
      // les deux destinations possibles du prompt, séparées par leur « ou ».
      content: (
        <div className="flex flex-col gap-3 text-left">
          {/* Le prompt ne porte plus de credential : le voici, à part, sous la
              seule forme qui serve — la ligne du fichier .env. */}
          {env && (
            <div className="flex flex-col gap-2 rounded-2xl border border-brand/25 bg-brand/5 p-4">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {t("feedbackWizardEnvTitle")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {env.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {env.line}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("feedbackWizardEnvCopy")}
                  onClick={() => {
                    void navigator.clipboard.writeText(env.line);
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
              {keyCreated && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("feedbackWizardDoneKeyNote")}
                </p>
              )}
            </div>
          )}

          {/* Première destination : l'agent de code de l'utilisateur. Le prompt
              y est déjà parti tout seul — ce bouton n'est là que pour le
              presse-papier écrasé entre-temps. */}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={() => prompt && void copyToClipboard(prompt)}
          >
            {copied ? (
              <Check className="size-4 text-emerald-500" />
            ) : (
              <Copy className="size-4" />
            )}
            {t("feedbackWizardCopy")}
          </Button>

          {/* L'autre : l'agent de minddy, sur le dépôt déjà lié au projet. */}
          {canHandOffToNumo && (
            <>
              <div className="mt-1 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs text-muted-foreground">
                  {tCommon("or")}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2"
                onClick={handOffToNumo}
              >
                <NumoIcon className="size-4" />
                {t("feedbackWizardNumoButton")}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("feedbackWizardNumoDesc")}
              </p>
            </>
          )}
        </div>
      ),
    },
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

      <WizardDialog
        open={open}
        onOpenChange={handleOpenChange}
        label={t("feedbackWizardTitle")}
        steps={steps.map((id) => stepDefs[id])}
        stepIndex={stepIndex}
        onStepIndexChange={setStepIndex}
        submitting={generating}
        onSubmit={(id) => {
          if (id === "placement") void generate();
          else if (id === "done") handleOpenChange(false);
          else setStepIndex((i) => i + 1);
        }}
      />
    </>
  );
}
