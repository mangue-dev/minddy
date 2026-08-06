"use client";

import { useEffect, useRef, useState } from "react";
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
import { CustomDomainSection } from "@/components/custom-domain-section";
import {
  BoardAccentRow,
  BoardVisibilityRows,
  FeedbackTranslationGroup,
  NumoReviewGroup,
  SettingsRows,
  feedbackDomainKey,
  feedbackSettingsKey,
  useFeedbackBoardSettings,
} from "@/components/feedback/feedback-settings-shared";
import {
  integrationsQueryKey,
  useIntegrationsQuery,
} from "@/lib/use-integrations-query";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { ssoEnvLine } from "@/lib/feedback/env-lines";
import { integrationKeyEnvLine } from "@/lib/feedback/integration-contract";

/**
 * Le wizard de configuration des retours — LE point d'entrée de l'onglet
 * Retours, dont il est devenu la première chose qu'on y voit.
 *
 * Il descend du wizard « Intégrer dans mon app » (MIN-37), qui ne faisait que
 * générer un prompt d'intégration, et il en garde le fil : on répond d'abord à
 * la seule question qui décide de tout — **comment les retours arrivent** — et
 * chaque étape suivante découle de cette réponse. Ce qui a changé, c'est qu'il
 * CONFIGURE en chemin au lieu de renvoyer l'utilisateur régler la même chose à
 * la main juste après :
 *
 *     board  →  type → SSO → ce que voit le public → allure → revue → où le
 *               brancher → le prompt
 *     API    →  type → revue → où le brancher → le prompt
 *
 * Les étapes du milieu ne réinventent rien : ce sont les rangées et les cartes
 * de l'onglet Retours, importées telles quelles
 * ([feedback-settings-shared.tsx](feedback-settings-shared.tsx)), et elles
 * écrivent EN DIRECT par la même route. D'où le seul effet de bord notable du
 * parcours : valider « board public » à la première étape crée et allume le
 * board tout de suite, parce que sans lui les étapes suivantes n'auraient rien
 * à régler. Si l'utilisateur revient en arrière et repart vers l'API, le board
 * est rendu dans l'état où on l'a trouvé — mais on ne l'éteint que si c'est
 * NOUS qui l'avions allumé.
 *
 * Le prompt final a DEUX destinations, ouvertes toutes les deux dans les DEUX
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
type StepId = "type" | "sso" | "board" | "look" | "review" | "placement" | "done";

/** Une instruction de placement, pas un cahier des charges. */
const PLACEMENT_MAX_CHARS = 500;

export function FeedbackSetupWizard({
  projectId,
  isOwner,
  open,
  onOpenChange,
}: {
  projectId: string;
  /** Le parcours provisionne et crée des secrets : réservé au owner. */
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("board");
  const [sso, setSso] = useState(true);
  const [placement, setPlacement] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [keyCreated, setKeyCreated] = useState(false);
  /** La ligne de `.env` que ce prompt-ci attend (secret SSO ou clé), s'il en attend une. */
  const [env, setEnv] = useState<{ line: string; description: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [envCopied, setEnvCopied] = useState(false);
  /** Ce parcours a-t-il allumé le board lui-même ? Seul ce cas se défait. */
  const [provisionedBoard, setProvisionedBoard] = useState(false);

  const {
    board,
    sharedViews,
    isPending,
    patchBoard,
    patchBoardDebounced,
    post,
  } = useFeedbackBoardSettings(projectId);
  const { integrations } = useIntegrationsQuery(projectId);
  const hasFeedbackKey = integrations.some(
    (i) => i.kind === "feedback" && !i.revoked_at,
  );

  // Numo ne peut travailler que sur un dépôt : sans lien git, l'option ne se
  // montre pas — un bouton qui n'aurait rien à cloner ne vaut pas un refus.
  const { link } = useProjectGitLinkQuery(projectId);
  const canHandOffToNumo = !!link;

  /**
   * Le parcours s'ouvre sur ce qui est DÉJÀ en place, pas sur les valeurs par
   * défaut : quelqu'un qui revient régler un détail ne doit pas avoir à
   * re-choisir ce qu'il a choisi la dernière fois. Une seule fois par ouverture,
   * et seulement quand les réglages sont chargés — semer sur un board inconnu
   * reviendrait à semer sur du vide.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current || isPending) return;
    seeded.current = true;
    setMode(!board?.enabled && hasFeedbackKey ? "api" : "board");
    setSso(board?.sso_configured ?? true);
  }, [open, isPending, board, hasFeedbackKey]);

  // Le SSO ne se pose que pour le board : en mode API, c'est l'app appelante
  // qui dit au nom de qui elle dépose. Les réglages du board non plus, pour la
  // même raison — il n'y en a pas.
  const steps: StepId[] =
    mode === "board"
      ? ["type", "sso", "board", "look", "review", "placement", "done"]
      : ["type", "review", "placement", "done"];

  const reset = () => {
    setPlacement("");
    setStepIndex(0);
    setPrompt(null);
    setKeyCreated(false);
    setEnv(null);
    setCopied(false);
    setEnvCopied(false);
    setProvisionedBoard(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
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

  /**
   * Le choix du canal, APPLIQUÉ. Le board doit exister pour que les trois
   * étapes suivantes aient quelque chose à régler — et repartir vers l'API le
   * rend dans l'état où on l'a trouvé.
   */
  const applyType = async () => {
    const alreadyOn = board?.enabled === true;
    setWorking(true);
    try {
      if (mode === "board") {
        if (!alreadyOn) {
          if (!(await patchBoard({ enabled: true }))) return;
          setProvisionedBoard(true);
        }
      } else if (provisionedBoard) {
        if (!(await patchBoard({ enabled: false }))) return;
        setProvisionedBoard(false);
      }
      setStepIndex((i) => i + 1);
    } finally {
      setWorking(false);
    }
  };

  /**
   * L'identité des visiteurs, APPLIQUÉE. Le secret existant n'est jamais
   * régénéré (une intégration en place casserait en silence) — il n'est
   * supprimé que si l'utilisateur demande explicitement l'autre mode, ce que
   * dit la carte « vérification email » quand un secret existe.
   */
  const applySso = async () => {
    const configured = board?.sso_configured ?? false;
    if (sso === configured) {
      setStepIndex((i) => i + 1);
      return;
    }
    setWorking(true);
    try {
      if (!(await post(sso ? "rotate_sso" : "clear_sso"))) return;
      setStepIndex((i) => i + 1);
    } finally {
      setWorking(false);
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
        queryKey: feedbackSettingsKey(projectId),
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
            // Choisir l'e-mail quand un secret existe SUPPRIME ce secret : la
            // carte le dit avant le clic, pas un toast après.
            description={
              board?.sso_configured
                ? t("feedbackWizardSsoNoDescClear")
                : t("feedbackWizardSsoNoDesc")
            }
            onSelect={() => setSso(false)}
          />
        </div>
      ),
    },

    // À partir d'ici, les rangées sont celles de l'onglet Retours et écrivent
    // en direct : le board existe déjà, l'étape « type » vient de l'allumer.
    board: {
      id: "board",
      title: t("feedbackWizardBoardTitle"),
      subtitle: t("feedbackWizardBoardDesc"),
      wide: true,
      content: board ? (
        <SettingsRows>
          <BoardVisibilityRows
            board={board}
            sharedViews={sharedViews}
            isOwner={isOwner}
            onPatch={patchBoard}
          />
        </SettingsRows>
      ) : null,
    },

    look: {
      id: "look",
      title: t("feedbackWizardLookTitle"),
      subtitle: t("feedbackWizardLookDesc"),
      wide: true,
      content: (
        <div className="flex flex-col gap-4">
          {board && (
            <SettingsRows>
              <BoardAccentRow
                board={board}
                isOwner={isOwner}
                onToggle={patchBoard}
                onColorChange={patchBoardDebounced}
              />
            </SettingsRows>
          )}
          {/* La section se masque seule sans les env VERCEL_* : sur un
              déploiement qui ne sait pas brancher de domaine, l'étape se réduit
              à la couleur, ce qui est exactement ce qu'elle a à dire. */}
          <CustomDomainSection
            endpoint={`/api/projects/${projectId}/feedback/domain`}
            queryKey={feedbackDomainKey(projectId)}
            className="rounded-xl border border-border bg-card p-4"
          />
        </div>
      ),
    },

    // Les deux cartes de la page, telles quelles : elles portent leur propre
    // interrupteur maître, et la revue comme la traduction s'appliquent aux
    // trois canaux — l'étape est donc la même dans les deux parcours.
    review: {
      id: "review",
      title: t("feedbackWizardReviewTitle"),
      subtitle: t("feedbackWizardReviewDesc"),
      wide: true,
      content: (
        <div className="flex flex-col gap-4">
          <NumoReviewGroup projectId={projectId} isOwner={isOwner} />
          <FeedbackTranslationGroup projectId={projectId} isOwner={isOwner} />
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
        <div className="flex flex-col gap-3">
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
          {/* Générer, en mode API, MINTE une clé. Le dire avant le clic : la
              configuration, elle, est déjà enregistrée — fermer ici ne perd
              rien, et c'est ce qui rend le renoncement possible. */}
          {mode === "api" && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("feedbackWizardPlacementKeyNote")}
            </p>
          )}
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

  // Ce qu'un clic à côté emporterait. Rien, tant qu'aucune étape n'est validée ;
  // rien non plus sur la dernière, où fermer EST la façon de finir — la question
  // n'est donc posée qu'entre les deux.
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const atStake = stepIndex > 0 && currentStep !== "done";

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t("feedbackWizardTitle")}
      steps={steps.map((id) => stepDefs[id])}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      submitting={working || generating}
      dismissConfirm={
        atStake
          ? {
              title: t("feedbackWizardQuitTitle"),
              description: t("feedbackWizardQuitDesc"),
              confirmLabel: t("feedbackWizardQuitConfirm"),
              cancelLabel: t("feedbackWizardQuitCancel"),
            }
          : undefined
      }
      onSubmit={(id) => {
        if (id === "type") void applyType();
        else if (id === "sso") void applySso();
        else if (id === "placement") void generate();
        else if (id === "done") handleOpenChange(false);
        else setStepIndex((i) => i + 1);
      }}
    />
  );
}
