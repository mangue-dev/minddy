"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Input, Textarea, toast } from "mangue-ui";
import {
  Check,
  Clock,
  Copy,
  ListPlus,
  MessagesSquare,
  Webhook,
} from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  WizardDialog,
  type WizardStep,
} from "@/components/wizard/wizard-dialog";
import { WizardChoiceCard } from "@/components/wizard/wizard-choice-card";
import {
  DEFAULT_WEBHOOK,
  useWebhookSteps,
  type WebhookConfig,
  type WebhookStepId,
} from "@/components/integrations/webhook-steps";
import { normalizeWebhookUrl } from "@/lib/webhook-url";
import {
  createIntegrationApi,
  fetchIntegrationPromptApi,
  updateIntegrationWebhookApi,
} from "@/lib/integrations-api";
import { integrationKeyEnvLine } from "@/lib/feedback/integration-contract";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import type { IntegrationKind } from "@/lib/types";

/**
 * Créer une intégration, de bout en bout : la clé, ce qu'elle a le droit
 * d'écrire, où on la branche, ce que minddy renvoie en retour, et le prompt qui
 * fait écrire tout ça par un agent.
 *
 * Le parcours était coupé en trois surfaces qui s'ignoraient — la clé ici, le
 * webhook derrière un bouton de la liste, le prompt dans l'onglet Feedback — et
 * chacune renvoyait l'utilisateur ailleurs pour finir. Elles tiennent
 * maintenant dans une seule traversée : type → nom → placement → webhook → la
 * clé et son prompt.
 *
 * Le parcours n'est pas le même des deux côtés. Une clé feedback dépose sur le
 * board et ne crée aucun ticket : la question du webhook ne se pose pas à elle,
 * ses écrans n'existent pas. Une clé tickets, elle, se voit demander si minddy
 * doit rappeler — et c'est une VRAIE question : l'endpoint n'existe souvent pas
 * encore au moment de créer la clé. « Pas maintenant » n'est pas un renvoi dans
 * le vide : Numo et l'agent MCP savent tous les deux le brancher après coup, et
 * la carte le dit.
 *
 * Le placement se passe aussi — le prompt décidera seul.
 *
 * Rien n'est créé avant la DERNIÈRE étape de configuration : fermer la fenêtre
 * en route ne laisse pas de clé orpheline à révoquer. Après, en revanche, la
 * clé existe : le webhook et le prompt qui suivent peuvent échouer sans la
 * remettre en cause — on le dit, et on continue.
 */

type CreateStepId =
  "kind" | "name" | "placement" | "webhookChoice" | WebhookStepId | "done";

export function CreateIntegrationWizard({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  const [kind, setKind] = useState<IntegrationKind>("issues");
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState("");
  // `null` = la question n'a pas été posée. C'est une réponse à donner, pas une
  // case à laisser cochée par défaut : le webhook engage à écrire une route.
  const [wantsWebhook, setWantsWebhook] = useState<boolean | null>(null);
  const [webhook, setWebhook] = useState<WebhookConfig>(DEFAULT_WEBHOOK);
  const [stepIndex, setStepIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Numo ne peut travailler que sur un dépôt : sans lien git, l'option ne se
  // montre pas — un bouton qui n'aurait rien à cloner ne vaut pas un refus.
  const { link } = useProjectGitLinkQuery(projectId);
  const canHandOffToNumo = !!link;

  // Revenir en arrière pour répondre « pas maintenant » — ou pour changer le
  // type de clé — abandonne ce qui avait été réglé : c'est la réponse qui
  // décide, pas le champ resté rempli.
  const hasWebhook =
    kind === "issues" && wantsWebhook === true && !!webhook.url.trim();

  const reset = () => {
    setKind("issues");
    setName("");
    setPlacement("");
    setWantsWebhook(null);
    setWebhook(DEFAULT_WEBHOOK);
    setStepIndex(0);
    setCreatedKey(null);
    setPrompt(null);
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success(t("feedbackWizardCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refusée hors d'un clic : ce bouton EST un clic, il n'y a rien à dire.
    }
  };

  /**
   * Confier le prompt à Numo : même chemin que « lancer un agent » depuis le
   * carnet (brouillon de conversation sans ticket + composer de la page
   * Agents), projet déjà choisi. On passe par le composer plutôt que de lancer
   * d'ici : l'utilisateur relit la consigne et choisit sa branche de base — un
   * run sur son dépôt ne part pas d'un clic sans revue.
   */
  const handOffToNumo = () => {
    if (!prompt) return;
    setAgentComposeDraft({ kind: "free", prompt, projectId });
    handleOpenChange(false);
    router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`);
  };

  /** Dernière étape de configuration : on crée, on branche, on rédige. */
  const finish = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const created = await createIntegrationApi(projectId, trimmed, kind);
      setCreatedKey(created.key);
      onCreated();

      // On renormalise ici plutôt que de se fier au champ : valider au clavier
      // (Entrée) soumet sans passer par la sortie de champ, donc sans le
      // schéma que celle-ci aurait ajouté.
      const webhookUrl = normalizeWebhookUrl(webhook.url);

      // La clé EXISTE. Ce qui suit l'enrichit : un échec se dit et ne l'annule
      // pas — la fenêtre reste la seule occasion de lire la clé en clair.
      if (hasWebhook) {
        try {
          await updateIntegrationWebhookApi(projectId, created.integration.id, {
            webhook_url: webhookUrl,
            webhook_events: webhook.events,
            webhook_scope: webhook.scope,
          });
        } catch (err) {
          toast.error((err as Error).message);
        }
      }
      try {
        const { prompt: text } = await fetchIntegrationPromptApi(projectId, {
          kind,
          placement,
          webhook: hasWebhook
            ? {
                url: webhookUrl,
                events: webhook.events,
                scope: webhook.scope,
              }
            : null,
        });
        setPrompt(text);
      } catch (err) {
        // Sans prompt, l'étape finale montre au moins la clé : c'est elle
        // qu'on ne pourra plus jamais relire.
        console.error("[create-integration] prompt failed:", err);
      }

      setStepIndex(steps.length - 1);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const webhookSteps = useWebhookSteps({
    value: webhook,
    onChange: setWebhook,
    urlRequired: true,
  });

  // La clé n'existe en clair qu'ici : `kind` est celui du formulaire qui vient
  // de la créer, donc le nom de variable affiché est toujours le sien.
  const createdEnvLine = createdKey
    ? integrationKeyEnvLine(kind, createdKey)
    : null;

  const stepDefs: Record<CreateStepId, WizardStep<CreateStepId>> = {
    kind: {
      id: "kind",
      title: t("integrationWizardKindTitle"),
      subtitle: t("integrationWizardKindDesc"),
      wide: true,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("integrationKindLabel")}
        >
          <WizardChoiceCard
            selected={kind === "issues"}
            icon={ListPlus}
            label={t("integrationKind_issues")}
            description={t("integrationKindIssuesDesc")}
            onSelect={() => setKind("issues")}
          />
          <WizardChoiceCard
            selected={kind === "feedback"}
            icon={MessagesSquare}
            label={t("integrationKind_feedback")}
            description={t("integrationKindFeedbackDesc")}
            onSelect={() => setKind("feedback")}
          />
        </div>
      ),
    },

    name: {
      id: "name",
      title: t("integrationWizardNameTitle"),
      subtitle: t("integrationWizardNameDesc"),
      submitDisabled: !name.trim(),
      content: (
        <Input
          autoFocus
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("integrationNamePlaceholder")}
          aria-label={t("integrationNameLabel")}
        />
      ),
    },

    // La question n'est pas la même des deux côtés : une clé feedback se
    // BRANCHE quelque part dans l'interface, une clé tickets part d'un
    // événement du code.
    placement: {
      id: "placement",
      title:
        kind === "issues"
          ? t("integrationWizardPlacementIssuesTitle")
          : t("feedbackWizardPlacementTitle"),
      subtitle: t("integrationWizardPlacementDesc"),
      submitLabel: placement.trim() ? undefined : tCommon("skip"),
      content: (
        // Décrire un emplacement, c'est raconter son app — plus facile à dire
        // qu'à taper. Le transcrit s'ajoute à la suite de ce qui est écrit.
        <div className="relative">
          <Textarea
            autoFocus
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            placeholder={
              kind === "issues"
                ? t("integrationWizardPlacementIssuesPlaceholder")
                : t("feedbackWizardPlacementPlaceholder")
            }
            aria-label={
              kind === "issues"
                ? t("integrationWizardPlacementIssuesTitle")
                : t("feedbackWizardPlacementTitle")
            }
            maxLength={500}
            rows={5}
            className="min-h-32 resize-none pb-12"
          />
          <DictateButton
            floating
            disabled={creating}
            onTranscription={(text) =>
              setPlacement((current) =>
                (current.trim() ? `${current.trim()} ${text}` : text).slice(
                  0,
                  500,
                ),
              )
            }
          />
        </div>
      ),
    },

    // Le webhook engage à écrire une route dans l'app du client : on le
    // DEMANDE, plutôt que de dérouler trois écrans que la plupart passeraient.
    // Répondre « pas maintenant » retire les trois du parcours, et le stepper
    // le montre — la question est aussi ce qui rend le reste facultatif.
    webhookChoice: {
      id: "webhookChoice",
      title: t("integrationWizardWebhookChoiceTitle"),
      subtitle: t("integrationWizardWebhookChoiceDesc"),
      wide: true,
      submitDisabled: wantsWebhook === null,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("integrationWizardWebhookChoiceTitle")}
        >
          <WizardChoiceCard
            selected={wantsWebhook === true}
            icon={Webhook}
            label={t("integrationWizardWebhookYes")}
            description={t("integrationWizardWebhookYesDesc")}
            onSelect={() => setWantsWebhook(true)}
          />
          <WizardChoiceCard
            selected={wantsWebhook === false}
            icon={Clock}
            label={t("integrationWizardWebhookNo")}
            description={t("integrationWizardWebhookNoDesc")}
            onSelect={() => setWantsWebhook(false)}
          />
        </div>
      ),
    },

    ...webhookSteps,

    // La clé existe : reculer ne la reprendrait pas, et elle ne se remontre
    // jamais.
    done: {
      id: "done",
      title: t("integrationCreatedTitle"),
      subtitle: t("integrationKeyNotice"),
      lockBack: true,
      submitLabel: t("integrationKeyDone"),
      content: (
        <div className="flex flex-col gap-3 text-left">
          <div className="flex items-center gap-2 rounded-2xl border border-brand/25 bg-brand/5 p-4">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
              {createdEnvLine}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("copyKey")}
              onClick={() => {
                if (!createdEnvLine) return;
                void navigator.clipboard.writeText(createdEnvLine);
                toast.success(t("keyCopied"));
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>

          {/* Le prompt : ce qui transforme une clé en intégration écrite. Il
              manque quand sa génération a échoué — la clé, elle, est là. */}
          {prompt && (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("integrationWizardPromptDesc")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2"
                onClick={() => void copyPrompt()}
              >
                {copied ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Copy className="size-4" />
                )}
                {t("feedbackWizardCopy")}
              </Button>
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
            </>
          )}
        </div>
      ),
    },
  };

  // La question du webhook ne se pose pas à une clé feedback : elle ne crée pas
  // de ticket, il n'y aurait rien à livrer — ce qu'elle dépose vit sur le board.
  // Pour une clé tickets, les trois écrans n'existent que si on a répondu oui :
  // le parcours se rallonge au moment de la réponse, sous les yeux de
  // l'utilisateur, et c'est le stepper qui montre ce qu'elle engage.
  const order: CreateStepId[] = [
    "kind",
    "name",
    "placement",
    ...(kind === "issues"
      ? ([
          "webhookChoice",
          ...(wantsWebhook
            ? (["webhookUrl", "webhookEvents", "webhookScope"] as const)
            : []),
        ] as const)
      : []),
    "done",
  ];
  const steps = order.map((id) => stepDefs[id]);
  // Le dernier écran de configuration crée : c'est lui qui porte « Créer ».
  const lastConfigId = order[order.length - 2];
  steps[order.length - 2] = {
    ...steps[order.length - 2],
    submitLabel: t("createIntegration"),
  };

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t("newIntegration")}
      steps={steps}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      submitting={creating}
      onSubmit={(id) => {
        if (id === "done") handleOpenChange(false);
        else if (id === lastConfigId) void finish();
        else setStepIndex((i) => i + 1);
      }}
    />
  );
}
