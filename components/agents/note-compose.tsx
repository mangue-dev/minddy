"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  commandFilter,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from "mangue-ui";
import { Check, ChevronsUpDown } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import { ChatInput } from "@/components/assistant/chat-input";
import { AgentEventFeed } from "@/components/agent/agent-event-feed";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import { launchNotebookAgentApi, type AgentRunSummary } from "@/lib/agent-api";
import { allAgentSessionsQueryKey } from "@/lib/use-agent-runs";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { useProjects } from "@/lib/projects-context";
import type { Project } from "@/lib/types";

/** Codes d'erreur du lancement carnet → clés i18n Agent (miroir AgentConversation). */
const LAUNCH_ERROR_KEYS: Record<string, string> = {
  noRepo: "errorNoRepo",
  unsupportedProvider: "errorUnsupportedProvider",
  quotaExceeded: "errorQuotaExceeded",
  noModelForProvider: "errorNoModelForProvider",
  promptRequired: "errorPromptRequired",
};

const MAX_RESULTS = 50;

/**
 * Picker du PROJET d'un run carnet — le pendant du BranchCombobox, même chip
 * compact du composer. Obligatoire : sans ticket, seul le projet dit quel dépôt
 * cloner. Pas de filtre « a un dépôt lié » côté client : le serveur refuse
 * proprement (`noRepo`) et le toast l'explique.
 */
function ProjectCombobox({
  projects,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = projects.find((p) => p.id === value) ?? null;

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return projects.slice(0, MAX_RESULTS);
    return projects
      .map((p) => ({ p, score: commandFilter(`${p.name} ${p.key}`, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.p);
  }, [projects, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-8 shrink gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
        >
          {selected ? (
            <ProjectOrb seed={selected.id} className="size-3.5 shrink-0" />
          ) : null}
          <span className="max-w-[9rem] truncate">{selected?.name ?? placeholder}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList className="mt-1.5 px-1">
            {results.map((p) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onSelect={() => {
                  onChange(p.id);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <ProjectOrb seed={p.id} className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
                  {p.key}
                </span>
                <Check
                  className={cn("size-4 shrink-0", p.id === value ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ))}
            {results.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                {emptyLabel}
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Composer de lancement d'un run CARNET (MIN-84) — le pendant de la phase compose
 * d'AgentConversation, avant toute run : la note (pré-remplie, éditable) part
 * comme instruction, avec un projet OBLIGATOIRE (le dépôt à cloner), un modèle et
 * une branche de base optionnels. Envoyer POSTe /api/agent-runs ; la run rendue
 * est remontée à la page (`onLaunched`), qui bascule sur sa session réelle.
 */
export function NoteCompose({
  initialText,
  onLaunched,
}: {
  /** La note du carnet, pré-écrite dans le composer (librement éditable). */
  initialText: string;
  /** Une run carnet vient d'être lancée — la page bascule sur sa session. */
  onLaunched: (run: AgentRunSummary) => void;
}) {
  const t = useTranslations("Agent");
  const queryClient = useQueryClient();
  const { projects } = useProjects();

  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : "");
  const { provider, defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel } = useAgentPreferencesQuery();
  const [model, setModel] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [launching, setLaunching] = useState(false);
  // Bulle optimiste du 1er message pendant le POST (mêmes raisons que le launch
  // d'AgentConversation : les pré-checks serveur prennent quelques secondes).
  const [launchText, setLaunchText] = useState<string | null>(null);
  const modelRequired = provider === "generic" && !defaultModel && !model;

  const launch = async (message: string) => {
    if (launching) return;
    const prompt = message.trim();
    if (!prompt) return;
    if (!projectId) {
      toast.error(t("noteProjectRequired"));
      return;
    }
    if (modelRequired) {
      toast.error(t("modelRequired"));
      return;
    }
    setLaunching(true);
    setLaunchText(prompt);
    try {
      const { run } = await launchNotebookAgentApi({
        projectId,
        prompt,
        model: model || undefined,
        baseBranch: baseBranch || undefined,
      });
      onLaunched(run);
      // La liste des sessions ne poll pas au repos : sans invalidation, la page
      // ne rattraperait la session neuve qu'au prochain rechargement.
      await queryClient.invalidateQueries({ queryKey: allAgentSessionsQueryKey });
    } catch (err) {
      // Refusé (pas de dépôt lié, quota…) : la run n'existe pas → on retire la
      // bulle plutôt que de laisser croire au lancement.
      setLaunchText(null);
      const key = LAUNCH_ERROR_KEYS[(err as Error).message];
      toast.error(key ? t(key) : (err as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        {launchText ? (
          <AgentEventFeed
            runId={null}
            status="queued"
            pendingUserMessages={[launchText]}
            className="h-full py-4"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card">
              <NumoIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">{t("noteComposeIntro")}</p>
          </div>
        )}
      </div>

      <div className="shrink-0">
        <div className="mx-auto w-full max-w-[800px]">
          <ChatInput
            key="note-compose"
            onSend={(message) => void launch(message)}
            disabled={launching}
            // Sans projet, rien à cloner : l'envoi est bloqué (note librement
            // éditable) et le tooltip du bouton explique quoi choisir d'abord.
            sendDisabled={!projectId}
            sendDisabledTooltip={t("noteProjectTooltip")}
            hideAttach
            initialValue={initialText}
            placeholder={t("noteComposePlaceholder")}
            leadingControls={
              <>
                <ProjectCombobox
                  projects={projects}
                  value={projectId}
                  onChange={(id) => {
                    setProjectId(id);
                    // La branche appartient au dépôt du projet : changer de
                    // projet invalide le choix précédent.
                    setBaseBranch("");
                  }}
                  placeholder={t("noteProjectPlaceholder")}
                  searchPlaceholder={t("noteProjectSearchPlaceholder")}
                  emptyLabel={t("noteProjectSearchEmpty")}
                  disabled={launching}
                />
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
                {projectId ? (
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
                  />
                ) : null}
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
