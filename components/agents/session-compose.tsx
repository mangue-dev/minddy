"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Check, ChevronLeft, ChevronsUpDown, MessageSquare } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { ChatInput } from "@/components/assistant/chat-input";
import { AgentEventFeed } from "@/components/agent/agent-event-feed";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import {
  EnvironmentCombobox,
  LOCAL_REPO_ERROR_KEYS,
  type AgentEnvironment,
} from "@/components/agent/environment-combobox";
import { useLocalRepo } from "@/lib/use-local-repo";
import { launchGeneralAgentApi, type AgentRunSummary } from "@/lib/agent-api";
import { agentRunQueryKey, allAgentSessionsQueryKey } from "@/lib/use-agent-runs";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useAgentErrorMessage } from "@/lib/use-agent-error-message";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { useProjects } from "@/lib/projects-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { useAuth } from "@/lib/auth-context";
import {
  defaultAgentProjectId,
  lastAgentProjectId,
  rememberAgentProject,
} from "@/lib/last-agent-project";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { isLocalAgentProvider } from "@/lib/agent-providers";
import type { Project } from "@/lib/types";
import { useSuppressAssistantFab } from "@/lib/assistant-panel-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import { MentionLinksProvider } from "@/components/mention-links";
import type { AssistantMention } from "@/lib/assistant-types";
import type { ResourceInput } from "@/lib/types";
import { useAiSurfaceAvailability } from "@/lib/use-ai-surface-availability";

/**
 * DRAFT selector of the conversation. Mandatory: without ticket, only the
 * project says which repository to clone. No “has a linked repository” filter on the client side:
 * the server refuses properly (`noRepo`) and the toast explains it.
 *
 * A SELECT, not a combobox: the same drop-down menu as the project selector
 * breadcrumbs (orb + noun, `ChevronsUpDown`), and for the same reason — we
 * chooses from among his projects, a list that we know and that we go through from
 * glance. A search box on top only served to delay the click.
 */
function ProjectSelect({
  projects,
  value,
  onChange,
  placeholder,
  emptyLabel,
  disabled,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const selected = projects.find((p) => p.id === value) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-8 shrink items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent/50 disabled:opacity-50"
        >
          {selected ? (
            <ProjectOrb
              seed={projectOrbSeed(selected)}
              iconUrl={selected.icon_url}
              className="size-3.5 shrink-0"
            />
          ) : null}
          <span className="max-w-[10rem] truncate">{selected?.name ?? placeholder}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onChange(p.id)}>
            <ProjectOrb seed={projectOrbSeed(p)} iconUrl={p.icon_url} className="size-4 shrink-0" />
            <span className="flex-1 truncate">{p.name}</span>
            <Check
              className={cn("size-4 shrink-0", p.id === value ? "opacity-100" : "opacity-0")}
            />
          </DropdownMenuItem>
        ))}
        {projects.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compose LAUNCH of an agent conversation — the front-end phase
 * run, equivalent to that of AgentConversation for a ticket.
 *
 * This is the DEFAULT VIEW of the Agents page: getting there means opening a
 * blank conversation. The subject is FREE — what we write here goes like
 * instruction, and the only mandatory thing is the PROJECT, whose clone agent
 * the deposit. The text can arrive pre-written (a notebook note — MIN-84 —, a
 * integration prompt) or empty (arrival on the page, “New” button), and
 * remains editable in both cases. Model, level of reasoning and branch of
 * base are optional — they are based on personal faults, as from a
 * ticket.
 *
 * A conversation ANCHORED to a ticket does not go through here: it starts
 * FROM THE TICKET (card or panel) — the Agents page does not offer any selector
 * ticket — and opens the AgentConversation composer, who knows what a ticket
 * additional request: inherited branch, status to be advanced.
 *
 * Send POST /api/agent-runs; the rendered run is moved up the page
 * (`onLaunched`), which switches to its real session.
 */
export function SessionCompose({
  initialText,
  initialProjectId,
  onLaunched,
  onBack,
}: {
  /** Pre-written text in the composer (freely editable), empty by default. */
  initialText?: string;
  /**
   * Pre-chosen project when the draft designates one (prompt integration
   * feedback, launched from a project settings) — the picker remains open.
   */
  initialProjectId?: string;
  /** A run has just been launched — the page switches to its session. */
  onLaunched: (run: AgentRunSummary) => void;
  /**
   * Return to the list under `md`, where list and detail take turns in full screen.
   * Same button as the header of a conversation (`AgentSessionDetail`): without
   * him, the blank conversation — the DEFAULT view of the page — would be a
   * dead end on mobile.
   */
  onBack?: () => void;
}) {
  const t = useTranslations("Agent");
  const tAgents = useTranslations("Agents");
  const tAssistant = useTranslations("Assistant");
  const tNav = useTranslations("Nav");

  /**
   * Numo's FAB fades away here as in an open conversation: this part
   * wears the SAME dial pinned at the bottom, and the FAB falls right on its button
   * sending. `AgentConversation` already declared this for itself — but the view
   * DEFAULT of the Agents page is this screen, not a conversation, and the
   * FAB therefore came back to it as soon as we arrived on the page.
   */
  useSuppressAssistantFab();

  const agentErrorMessage = useAgentErrorMessage();
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  // The account is named here like everywhere else (sidebar, menu
  // mobile): its full display name, never the raw email.
  const { user } = useAuth();
  const name = authDisplayName(
    user?.user_metadata as AuthNameMeta | undefined,
    user?.email ?? null,
    tNav("accountFallback"),
  );

  /**
   * Projects where the agent can work: those that have a DEPOSIT linked. THE
   * others are not proposed — the agent would fail in its first second
   * (`noRepo`), once the instruction has been written and sent. Better not to
   * offer than refuse after the fact.
   */
  const { projectIds: gitLinked, loading: gitLinkedLoading } =
    useGitLinkedProjectsQuery();
  const launchable = useMemo(
    () => projects.filter((p) => gitLinked.has(p.id)),
    [projects, gitLinked],
  );
  /** No deposits anywhere: there are no conversations to initiate from here. */
  const noRepoAnywhere = !gitLinkedLoading && launchable.length === 0;

  // The project leaves PRE-CHOSEN: the one that the draft designates, otherwise the last
  // where an agent was launched (failing that, the most recently affected project). He
  // remains freely modifiable — it's a defect, not a lock.
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  // Solved in an effect, not at initialization: projects and their links
  // arrive by react-query and may still be empty during assembly (compose it
  // would then remain without a project forever), and read localStorage during the
  // rendered would cause hydration to diverge.
  //
  // The effect also returns to a choice ALREADY made if it no longer holds: a project
  // pre-chosen by a draft (or by the “+” of a project whose submission has been
  // unlinked since) is no longer in the list, and the selector would then display a
  // empty by pretending that a project is chosen.
  useEffect(() => {
    if (gitLinkedLoading || launchable.length === 0) return;
    if (projectId && launchable.some((p) => p.id === projectId)) return;
    setProjectId(defaultAgentProjectId(launchable, lastAgentProjectId()) ?? "");
  }, [launchable, projectId, gitLinkedLoading]);
  const {
    provider,
    defaultModel: providerDefaultModel,
    cloudExecutionConfigured,
    executionBackend,
  } = useAgentModelsQuery();
  const aiAvailability = useAiSurfaceAvailability("agent");
  const aiUnavailable = !aiAvailability.loading && !aiAvailability.available;
  const { defaultModel, defaultReasoningLevel } = useAgentPreferencesQuery();
  const [model, setModel] = useState("");
  // Launch reasoning level (MIN-122), frozen on the server-side run:
  // as long as we don't touch it, it's the personal defect that goes away - as in the
  // a ticket composer.
  const [reasoningOverride, setReasoningOverride] = useState<ReasoningLevel | null>(null);
  // The actual MODEL of this launch — the one for which we display the performance levels
  // reasoning. `model` empty = we start with the personal default, otherwise that of the
  // provider: that's the one that will run, so it's his that you have to read.
  const effectiveModel = model || defaultModel || providerDefaultModel;
  const reasoningLevels = useReasoningLevelsFor(effectiveModel);
  // Focusing on what this model accepts: a personal default to `xhigh` on a
  // model which does not want it must be displayed on its nearest neighbor, not
  // let the chip name a bearing missing from the list.
  const reasoningLevel = nearestReasoningLevel(
    reasoningOverride ?? defaultReasoningLevel,
    reasoningLevels,
  );
  const [baseBranch, setBaseBranch] = useState("");
  const [launching, setLaunching] = useState(false);
  // Optimistic bubble of the 1st message during POST (same reasons as launch
  // of AgentConversation: server pre-checks take a few seconds).
  const [launchText, setLaunchText] = useState<string | null>(null);
  const [launchMentions, setLaunchMentions] = useState<AssistantMention[]>([]);
  // Same information as the rendered run, but available from the first rendering
  // optimistic: without it, the Agents page named a sandbox for a round that
  // was actually waiting for the local harness.
  const [launchLocalExec, setLaunchLocalExec] = useState(false);
  const localEndpoint = isLocalAgentProvider(provider);
  const modelRequired = (provider === "generic" || localEndpoint) && !defaultModel && !model;
  const selectedProject = launchable.find((p) => p.id === projectId) ?? null;
  const { mentionables, links, onMentionQuery } = useNumoMentionables(projectId || null);

  // WHERE THE CONVERSATION TURNS (MIN-359) — same rule as in a conversation
  // ticket: the chip only exists if a folder is attached to THIS project on
  // this machine. The changing project here (the composer offers several),
  // the hook follows `projectId` and the environment falls back to the cloud as soon as the
  // selected project folder is not ready.
  const localRepo = useLocalRepo(projectId || null);

  const [environment, setEnvironment] = useState<AgentEnvironment>("cloud");
  useEffect(() => {
    setEnvironment(localEndpoint || localRepo.ready ? "local" : "cloud");
  }, [localEndpoint, localRepo.ready]);

  const launch = async (
    message: string,
    attachments: ResourceInput[] = [],
    mentions: AssistantMention[] = [],
  ) => {
    if (aiUnavailable) return;
    if (launching) return;
    const prompt = message.trim();
    if (!prompt) return;
    if (!projectId) {
      toast.error(t("composeProjectRequired"));
      return;
    }
    if (modelRequired) {
      toast.error(t("modelRequired"));
      return;
    }
    const localExec = environment !== "cloud" && localRepo.ready;
    if (!localExec && !cloudExecutionConfigured) {
      toast.error(t("errorExecutionBackendUnavailable"));
      return;
    }
    const localWorktree = localExec && environment === "worktree";
    setLaunching(true);
    setLaunchText(prompt);
    setLaunchMentions(mentions);
    setLaunchLocalExec(localExec);
    try {
      const { run } = await launchGeneralAgentApi({
        projectId,
        prompt,
        model: model || undefined,
        reasoningLevel,
        baseBranch: baseBranch || undefined,
        mentions,
        attachments,
        // `ready` and not just the state of the chip: between choice and sending,
        // the folder may have disappeared (or the project may have changed).
        localExec,
        localWorktree,
      });
      /**
       * Primes the session cache BEFORE returning control.
       *
       * The conversation pane that takes over in a second questions
       * this key (`useAgentRunQuery`). Without data, it goes in phase
       * “loading”: a spinner INSTEAD of the message and the composer, time
       * of a round trip, right in the middle of the launch. But the session is HERE,
       * as the server has just returned it — there is nothing to fetch.
       * The conversation therefore opens directly on his thread.
       */
      queryClient.setQueryData(agentRunQueryKey(run.id), { run });
      onLaunched(run);
      // This project becomes the default of the next composer (device memory).
      rememberAgentProject(projectId);
      // The list of sessions does not pollute at rest: without invalidation, the page
      // would only catch up with the new session on the next reload.
      await queryClient.invalidateQueries({ queryKey: allAgentSessionsQueryKey });
    } catch (err) {
      // Refused (no linked deposit, quota, etc.): the run does not exist → we remove the
      // bubble rather than suggesting the launch.
      setLaunchText(null);
      setLaunchMentions([]);
      setLaunchLocalExec(false);
      toast.error(agentErrorMessage(err));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header, with the SAME geometry as an open conversation
 (`AgentConversation`: `px-4 pt-4 pb-2.5`, mobile return · icon · title).
 This is not decoration: when the real session takes over —
 a few seconds after sending —, the page exchanges this pane for the one
 of the conversation. Without a header here, the thread started 50 px higher and
 the message already written jumped down at the time of recovery.
 The title follows the same fate: “New conversation” gives way to the
 title that the agent gives it, without anything moving. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2.5">
        {/* Under `md` only: the conversations column is hidden behind
 this pane, you need a return path. Above, the two coexist. */}
        {onBack ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tAgents("backToList")}
            className="md:hidden"
            onClick={onBack}
          >
            <ChevronLeft />
          </Button>
        ) : null}
        {/* The orb of the chosen project, like in the header of an open conversation
. As long as no project is chosen, a neutral icon holds its place — same size, so nothing moves when it arrives. */}
        {selectedProject ? (
          <ProjectOrb
            seed={projectOrbSeed(selectedProject)}
            iconUrl={selectedProject.icon_url}
            className="size-4 shrink-0"
          />
        ) : (
          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-sm font-medium">{tAgents("newButton")}</span>
      </div>
      <div className="min-h-0 flex-1">
        {aiUnavailable ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="max-w-sm space-y-1">
              <p className="text-base font-medium">
                {tAssistant("providerUnavailableTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {tAssistant("providerUnavailableDescription")}
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/settings?tab=agent">
                {tAssistant("providerUnavailableCta")}
              </Link>
            </Button>
          </div>
        ) : launchText ? (
          /* Mention pills LEAD SOMEWHERE, here as in the
 conversation ([agent-conversation.tsx]): without this provider, the
 optimistic bubble displays `@MIN-42` and the click does nothing — so
 the same pill is clickable everywhere else. */
          <MentionLinksProvider value={links}>
            <AgentEventFeed
              runId={null}
              status="queued"
              pendingUserMessages={[{ text: launchText, mentions: launchMentions }]}
              localExec={launchLocalExec}
              className="h-full py-4"
            />
          </MentionLinksProvider>
        ) : (
          /* The conversation has no thread yet: its place welcomes the only one
 choice that is missing before launching — the PROJECT, whose agent will clone
 the deposit. It is said in a sentence rather than put in chip in
 compose it: it is the question of the screen, not a setting of
 the sending (the model, the reasoning and the branch, they are). */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-lg font-medium">{t("composeGreeting", { name })}</p>
            {noRepoAnywhere ? (
              /* No project has a deposit: there is no choice to offer, and
 the agent has nothing to clone. We say it here rather than letting
 an empty selector make it appear as a loading. */
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("composeNoRepo")}
              </p>
            ) : (
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("composeGreetingPrompt")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Same footing as the conversation: anchored at the bottom of the page, therefore removed from the
 degraded from the moving bar by `dock-above-nav` (see globals.css). */}
      <div className="dock-above-nav shrink-0">
        <div className="mx-auto w-full max-w-[800px]">
          <ChatInput
            key="session-compose"
            onSend={(message, attachments, mentions) => void launch(message, attachments, mentions)}
            mentionables={mentionables}
            onMentionQuery={onMentionQuery}
            disabled={launching}
            // Without a project, nothing to clone: ​​sending is blocked (the text remains
            // freely editable) and the button tooltip says what is missing —
            // choose a project, or connect one to a repository if there is one
            // no where to launch the agent.
            sendDisabled={
              aiUnavailable || !projectId || (environment === "cloud" && !cloudExecutionConfigured)
            }
            sendDisabledTooltip={
              aiUnavailable
                ? tAssistant("providerUnavailableDescription")
                : environment === "cloud" && !cloudExecutionConfigured
                ? t("errorExecutionBackendUnavailable")
                : noRepoAnywhere
                  ? t("composeNoRepo")
                  : t("composeProjectTooltip")
            }
            initialValue={initialText}
            placeholder={t("composePlaceholderFree")}
            contextSlot={
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                <ProjectSelect
                  projects={launchable}
                  value={projectId}
                  onChange={(id) => {
                    setProjectId(id);
                    // The branch belongs to the project repository: change
                    // project invalidates the previous choice.
                    setBaseBranch("");
                  }}
                  placeholder={t("composeProjectPlaceholder")}
                  emptyLabel={t("composeProjectEmpty")}
                  disabled={launching}
                />
                {projectId ? (
                  <>
                    {localRepo.linked ? (
                      <EnvironmentCombobox
                        value={environment}
                        onChange={setEnvironment}
                        localAvailable={localRepo.available}
                        cloudAvailable={!localEndpoint && cloudExecutionConfigured}
                        executionBackend={executionBackend}
                        folder={localRepo.state?.status === "ready" ? localRepo.state.folder : null}
                        needsAttach={localRepo.state?.status !== "ready"}
                        onAttach={() => {
                          void localRepo.attach().then((next) => {
                            if (next?.status === "ready") setEnvironment("local");
                            else if (next && next.status === "invalid") {
                              toast.error(t(LOCAL_REPO_ERROR_KEYS[next.reason]));
                            }
                          });
                        }}
                        disabled={launching || localRepo.busy}
                        bare
                      />
                    ) : null}
                    <BranchCombobox
                      projectId={projectId}
                      value={baseBranch}
                      onChange={setBaseBranch}
                      defaultLabel={t("branchDefault")}
                      defaultHint={t("branchDefaultHint")}
                      placeholder={t("branchSearchPlaceholder")}
                      emptyLabel={t("branchSearchEmpty")}
                      loadingLabel={t("branchSearchLoading")}
                      disabled={launching}
                      localBranches={environment !== "cloud" ? localRepo.branches : undefined}
                      localLabel={t("branchLocalGroup")}
                      cloudLabel={t("branchCloudGroup")}
                      bare
                    />
                  </>
                ) : null}
              </div>
            }
            contextPlacement="above"
            leadingControls={
              <>
                <ModelCombobox
                  variant="compact"
                  value={model}
                  onChange={setModel}
                  defaultLabel={t("modelDefault")}
                  defaultModelId={defaultModel ?? providerDefaultModel}
                  placeholder={t("modelSearchPlaceholder")}
                  emptyLabel={t("modelSearchEmpty")}
                  loadingLabel={t("modelSearchLoading")}
                  freeTextLabel={(q) => t("modelUseCustom", { model: q })}
                  disabled={launching}
                />
                <ReasoningCombobox
                  value={reasoningLevel}
                  onChange={setReasoningOverride}
                  disabled={launching}
                  levels={reasoningLevels}
                />
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
