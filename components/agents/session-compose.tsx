"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ProjectOrb } from "@/components/project-orb";
import { ChatInput } from "@/components/assistant/chat-input";
import { AgentEventFeed } from "@/components/agent/agent-event-feed";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import { launchNotebookAgentApi, type AgentRunSummary } from "@/lib/agent-api";
import { allAgentSessionsQueryKey } from "@/lib/use-agent-runs";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentErrorMessage } from "@/lib/use-agent-error-message";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import {
  defaultAgentProjectId,
  lastAgentProjectId,
  rememberAgentProject,
} from "@/lib/last-agent-project";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { Project } from "@/lib/types";

const MAX_RESULTS = 50;

/**
 * Picker du PROJET de la conversation — le pendant du BranchCombobox, même chip
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
            <ProjectOrb
              seed={selected.id}
              iconUrl={selected.icon_url}
              className="size-3.5 shrink-0"
            />
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
                <ProjectOrb seed={p.id} iconUrl={p.icon_url} className="size-3.5 shrink-0" />
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
 * Composer de LANCEMENT d'une conversation d'agent — la phase d'avant toute
 * run, pendant de celle d'AgentConversation pour un ticket.
 *
 * Le sujet est LIBRE : ce qu'on écrit ici part comme instruction, et la seule
 * chose obligatoire est le PROJET, dont l'agent clone le dépôt. Le texte peut
 * arriver pré-écrit (une note du carnet — MIN-84 —, un prompt d'intégration)
 * ou vide (entrée « Sujet libre » du bouton « Nouveau »), et reste éditable
 * dans les deux cas. Modèle, niveau de raisonnement et branche de base sont
 * facultatifs — ils partent sur les défauts perso, comme depuis un ticket.
 *
 * Une conversation ANCRÉE à un ticket ne passe pas par ici : elle se choisit
 * dans le menu du bouton « Nouveau » (ou depuis le ticket lui-même) et ouvre le
 * composer d'AgentConversation, qui sait ce qu'un ticket demande de plus —
 * branche héritée, statut à faire avancer.
 *
 * Envoyer POSTe /api/agent-runs ; la run rendue est remontée à la page
 * (`onLaunched`), qui bascule sur sa session réelle.
 */
export function SessionCompose({
  initialText,
  initialProjectId,
  onLaunched,
}: {
  /** Texte pré-écrit dans le composer (librement éditable), vide par défaut. */
  initialText?: string;
  /**
   * Projet pré-choisi quand le brouillon en désigne un (prompt d'intégration
   * feedback, lancé depuis les réglages d'un projet) — le picker reste ouvert.
   */
  initialProjectId?: string;
  /** Une run vient d'être lancée — la page bascule sur sa session. */
  onLaunched: (run: AgentRunSummary) => void;
}) {
  const t = useTranslations("Agent");
  const tNav = useTranslations("Nav");
  const agentErrorMessage = useAgentErrorMessage();
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  // Le compte est nommé ici comme partout ailleurs (barre latérale, menu
  // mobile) : son nom d'affichage entier, jamais l'e-mail brut.
  const { user } = useAuth();
  const name = authDisplayName(
    user?.user_metadata as AuthNameMeta | undefined,
    user?.email ?? null,
    tNav("accountFallback"),
  );

  // Le projet part PRÉ-CHOISI : celui que le brouillon désigne, sinon le dernier
  // où un agent a été lancé (à défaut, le projet touché le plus récemment). Il
  // reste librement modifiable — c'est un défaut, pas un verrou.
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  // Résolu dans un effet, pas à l'initialisation : la liste des projets arrive
  // par react-query et peut être encore vide au montage (le composer resterait
  // alors sans projet pour toujours), et lire localStorage pendant le rendu
  // ferait diverger une hydratation. Ne s'applique qu'à un composer SANS projet :
  // il ne repasse jamais sur un choix, ni celui du brouillon ni celui de
  // l'utilisateur.
  useEffect(() => {
    if (projectId || projects.length === 0) return;
    const fallback = defaultAgentProjectId(projects, lastAgentProjectId());
    if (fallback) setProjectId(fallback);
  }, [projects, projectId]);
  const { provider, defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel, defaultReasoningLevel } = useAgentPreferencesQuery();
  const [model, setModel] = useState("");
  // Niveau de raisonnement du lancement (MIN-122), figé sur la run côté serveur :
  // tant qu'on n'y touche pas, c'est le défaut perso qui part — comme dans le
  // composer d'un ticket.
  const [reasoningOverride, setReasoningOverride] = useState<ReasoningLevel | null>(null);
  const reasoningLevel = reasoningOverride ?? defaultReasoningLevel;
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
      toast.error(t("composeProjectRequired"));
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
        reasoningLevel,
        baseBranch: baseBranch || undefined,
      });
      onLaunched(run);
      // Ce projet devient le défaut du prochain composer (mémoire d'appareil).
      rememberAgentProject(projectId);
      // La liste des sessions ne poll pas au repos : sans invalidation, la page
      // ne rattraperait la session neuve qu'au prochain rechargement.
      await queryClient.invalidateQueries({ queryKey: allAgentSessionsQueryKey });
    } catch (err) {
      // Refusé (pas de dépôt lié, quota…) : la run n'existe pas → on retire la
      // bulle plutôt que de laisser croire au lancement.
      setLaunchText(null);
      toast.error(agentErrorMessage(err));
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
          /* La conversation n'a pas encore de fil : sa place accueille le seul
             choix qui manque avant de lancer — le PROJET, dont l'agent clonera
             le dépôt. Il est dit dans une phrase plutôt que posé en chip dans
             le composer : c'est la question de l'écran, pas un réglage de
             l'envoi (le modèle, le raisonnement et la branche, eux, le sont). */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-lg font-medium">{t("composeGreeting", { name })}</p>
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm text-muted-foreground">
              {t.rich("composeWorkingIn", {
                project: () => (
                  <ProjectCombobox
                    projects={projects}
                    value={projectId}
                    onChange={(id) => {
                      setProjectId(id);
                      // La branche appartient au dépôt du projet : changer de
                      // projet invalide le choix précédent.
                      setBaseBranch("");
                    }}
                    placeholder={t("composeProjectPlaceholder")}
                    searchPlaceholder={t("composeProjectSearchPlaceholder")}
                    emptyLabel={t("composeProjectSearchEmpty")}
                    disabled={launching}
                  />
                ),
              })}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0">
        <div className="mx-auto w-full max-w-[800px]">
          <ChatInput
            key="session-compose"
            onSend={(message) => void launch(message)}
            disabled={launching}
            // Sans projet, rien à cloner : l'envoi est bloqué (le texte reste
            // librement éditable) et le tooltip du bouton explique quoi choisir
            // d'abord.
            sendDisabled={!projectId}
            sendDisabledTooltip={t("composeProjectTooltip")}
            hideAttach
            initialValue={initialText}
            placeholder={t("composePlaceholderFree")}
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
