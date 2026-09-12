"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { AppContentHeader } from "@/components/app-content-header";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { ChatInput } from "@/components/assistant/chat-input";
import { AgentEventFeed } from "@/components/agent/agent-event-feed";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import { launchGeneralAgentApi, type AgentRunSummary } from "@/lib/agent-api";
import { agentRunQueryKey, allAgentSessionsQueryKey } from "@/lib/use-agent-runs";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentErrorMessage } from "@/lib/use-agent-error-message";
import { useProjects } from "@/lib/projects-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { useAuth } from "@/lib/auth-context";
import {
  defaultAgentProjectId,
  lastAgentProjectId,
  rememberAgentProject,
} from "@/lib/last-agent-project";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import type { Project } from "@/lib/types";
import { useSuppressAssistantFab } from "@/lib/assistant-panel-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import { MentionLinksProvider } from "@/components/mention-links";
import type { AssistantMention } from "@/lib/assistant-types";
import type { ResourceInput } from "@/lib/types";
import { useAiSurfaceAvailability } from "@/lib/use-ai-surface-availability";
import { useRepositorySkills } from "@/lib/use-repository-skills";

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
  const router = useRouter();
  const { projects } = useProjects();
  // The account is named here like everywhere else (sidebar, menu
  // mobile): its full display name, never the raw email.
  const { user } = useAuth();
  const name = authDisplayName(
    user?.user_metadata as AuthNameMeta | undefined,
    user?.email ?? null,
    tNav("accountFallback"),
  );

  /** Projects where the server sandbox has a linked repository to clone. */
  const { projectIds: gitLinked, loading: gitLinkedLoading } =
    useGitLinkedProjectsQuery();
  const launchable = useMemo(
    () => projects.filter((p) => gitLinked.has(p.id)),
    [projects, gitLinked],
  );
  /** No server-sandbox launch is possible without a linked repository. */
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
  const { cloudExecutionConfigured } = useAgentModelsQuery();
  const aiAvailability = useAiSurfaceAvailability("agent");
  const aiUnavailable = !aiAvailability.loading && !aiAvailability.available;
  const [baseBranch, setBaseBranch] = useState("");
  const [launching, setLaunching] = useState(false);
  // Optimistic bubble of the 1st message during POST (same reasons as launch
  // of AgentConversation: server pre-checks take a few seconds).
  const [launchText, setLaunchText] = useState<string | null>(null);
  const [launchMentions, setLaunchMentions] = useState<AssistantMention[]>([]);
  const selectedProject = launchable.find((p) => p.id === projectId) ?? null;
  const { mentionables, links, onMentionQuery } = useNumoMentionables(projectId || null);

  const repositorySkills = useRepositorySkills(
    projectId || null,
    "cloud",
    "new-session",
  );

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
    if (!cloudExecutionConfigured) {
      toast.error(t("errorExecutionBackendUnavailable"));
      return;
    }
    if (!gitLinkedLoading && !gitLinked.has(projectId)) {
      toast.error(t("errorNoRepo"));
      router.push(`/projects/${projectId}/settings?tab=git`);
      return;
    }
    setLaunching(true);
    setLaunchText(prompt);
    setLaunchMentions(mentions);
    try {
      const { run } = await launchGeneralAgentApi({
        projectId,
        prompt,
        baseBranch: baseBranch || undefined,
        mentions,
        attachments,
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
      toast.error(agentErrorMessage(err));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with the same 60 px geometry as an open conversation
 (`AgentConversation`, mobile return · icon · title).
 This is not decoration: when the real session takes over —
 a few seconds after sending —, the page exchanges this pane for the one
 of the conversation. Without a header here, the thread started 50 px higher and
 the message already written jumped down at the time of recovery.
 The title follows the same fate: “New conversation” gives way to the
 title that the agent gives it, without anything moving. */}
      <AppContentHeader contentClassName="gap-2">
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
      </AppContentHeader>
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
            skills={projectId ? repositorySkills.skills : undefined}
            loadSkill={projectId ? repositorySkills.load : undefined}
            disabled={launching}
            // Without a project, nothing to clone: ​​sending is blocked (the text remains
            // freely editable) and the button tooltip says what is missing —
            // choose a project, or connect one to a repository if there is one
            // no where to launch the agent.
            sendDisabled={
              aiUnavailable || !projectId || !cloudExecutionConfigured
            }
            sendDisabledTooltip={
              aiUnavailable
                ? tAssistant("providerUnavailableDescription")
                : !cloudExecutionConfigured
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
                      bare
                    />
                  </>
                ) : null}
              </div>
            }
            contextPlacement="above"
          />
        </div>
      </div>
    </div>
  );
}
