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
 * Creating an end-to-end integration: the key, what it has the right to do
 * to write, where we plug it in, what minddy sends back, and the prompt that
 * have an agent write it all up.
 *
 * The course was divided into three surfaces which ignored each other - the key here, the
 * webhook behind a list button, the prompt in the Feedback tab — and
 * each sent the user elsewhere to finish. They hold
 * now in a single traversal: type → name → placement → webhook → la
 * key and its prompt.
 *
 * The route is not the same on both sides. A feedback key placed on the
 * board and does not create any tickets: the question of the webhook does not arise for it,
 * its screens do not exist. A ticket key, she is asked if minddy
 * must remind — and this is a REAL question: the endpoint often does not exist
 * again when creating the key. “Not now” is not a reference in
 * the void: Numo and Agent MCP both know how to plug it in after the fact, and
 * the card says so.
 *
 * Placement is also happening — the prompt will decide alone.
 *
 * Nothing is created before the LAST configuration step: close the window
 * en route does not leave an orphaned key to be revoked. After, on the other hand, the
 * key exists: the webhook and prompt that follow may fail without the
 * call into question — we say it, and we continue.
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
  // `null` = the question was not asked. This is an answer to give, not a
  // box to leave checked by default: the webhook commits to writing a route.
  const [wantsWebhook, setWantsWebhook] = useState<boolean | null>(null);
  const [webhook, setWebhook] = useState<WebhookConfig>(DEFAULT_WEBHOOK);
  const [stepIndex, setStepIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Numo can only work on a repository: without a git link, the option does not work
  // not show — a button that has nothing to clone is not worth a refusal.
  const { link } = useProjectGitLinkQuery(projectId);
  const canHandOffToNumo = !!link;

  // Go back to answer “not now” — or to change the
  // type of key — abandons what had been set: this is the answer that
  // decides, not the field remains filled.
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
      // Refused out of a click: this button IS a click, there is nothing to say.
    }
  };

  /**
   * Entrust the prompt to Numo: same path as “launch an agent” from the
   * notebook (conversation draft without ticket + compose from the page
   * Agents), project already chosen. We go through composing it rather than launching
   * from here: the user rereads the instructions and chooses their basic branch — a
   * run on its repository does not start with a click without review.
   */
  const handOffToNumo = () => {
    if (!prompt) return;
    setAgentComposeDraft({ kind: "free", prompt, projectId });
    handleOpenChange(false);
    router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`);
  };

  /** Last configuration step: we create, we plug in, we write. */
  const finish = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const created = await createIntegrationApi(projectId, trimmed, kind);
      setCreatedKey(created.key);
      onCreated();

      // We renormalize here rather than relying on the field: validate using the keyboard
      // (Enter) submits without going through the field exit, therefore without the
      // diagram that it would have added.
      const webhookUrl = normalizeWebhookUrl(webhook.url);

      // The key EXISTS. What follows enriches it: a failure is said and does not cancel it
      // not — the window remains the only opportunity to read the key in plain text.
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
        // Without a prompt, the final step at least shows the key: it's her
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

  // The key only exists in plain text here: `kind` is that of the form which comes
  // to create it, so the displayed variable name is always its own.
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

    // The question is not the same on both sides: a feedback key is
    // PLUGGED in somewhere in the interface, a tickets key comes from a
    // code event.
    placement: {
      id: "placement",
      title:
        kind === "issues"
          ? t("integrationWizardPlacementIssuesTitle")
          : t("feedbackWizardPlacementTitle"),
      subtitle: t("integrationWizardPlacementDesc"),
      submitLabel: placement.trim() ? undefined : tCommon("skip"),
      content: (
        // Describing a location means telling its app — easier to say
        // than to type. The transcript is added to what is written.
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

    // The webhook commits to writing a route in the client's app: we
    // REQUEST, rather than rolling out three screens that most would skip.
    // Answering “not now” removes the three from the course, and the stepper
    // shows it — the question is also what makes the rest optional.
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

    // The key exists: going back would not take it back, and it does not come back
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

          {/* The prompt: what transforms a key into written integration. He
              missing when his generation failed — the key is there. */}
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

  // The question of the webhook does not arise from a feedback key: it does not create
  // ticket, there would be nothing to deliver — what she leaves lives on the board.
  // For a ticket key, the three screens only exist if you answered yes:
  // the route lengthens at the time of the response, under the eyes of
  // the user, and it is the stepper which shows what it engages.
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
  // The last configuration screen creates: this is the one marked “Create”.
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
