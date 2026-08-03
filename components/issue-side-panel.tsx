"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  SidePanelTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "mangue-ui";
import {
  ChevronRight,
  GitPullRequest,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  AssigneeValue,
  CategoryValue,
  DueDateValue,
  EffortValue,
  ObjectiveValue,
  PriorityValue,
  PropertyRow,
  StatusValue,
} from "@/components/issue-property-fields";
import { SubIssuesSection } from "@/components/sub-issues-section";
import { RelationsSection } from "@/components/relations-section";
import { AgentChatModal } from "@/components/agent/agent-chat-modal";
import { IssueAgentChip } from "@/components/agent/issue-agent-chip";
import { ChainStatusBar } from "@/components/automations/chain-status-bar";
import { useAgentMenuActions } from "@/components/agent/use-agent-menu-actions";
import {
  CustomPromptDialog,
  type CustomPromptTarget,
} from "@/components/agent/custom-prompt-dialog";
import {
  IssueActionsMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { useIssueAgentRunsQuery } from "@/lib/use-agent-runs";
import { isAgentRunWorking } from "@/lib/agent-api";
import {
  setAgentComposeDraft,
  type AgentComposeIntent,
} from "@/lib/agent-compose-draft";
import { usePlanGates } from "@/lib/use-billing-query";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import {
  agentLaunchPromptVariant,
  agentPlanPromptVariant,
} from "@/lib/agent-launch-prompt";
import {
  buildIssueCustomPrompt,
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
} from "@/lib/issue-prompt";
import { useMyCycleQuery } from "@/lib/use-my-cycle-query";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { RelationChips, type ChipRelation } from "@/components/relation-chips";
import { resolveRelations } from "@/lib/relation-constants";
import {
  IssueShortcutMenu,
  useIssueFieldShortcuts,
} from "@/components/issue-field-shortcuts";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import { IssueAttachmentsSection } from "@/components/issue-attachments-section";
import { IssuePlan } from "@/components/issue-plan";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { hasPlanTasks, planProgress } from "@/lib/plan";
import { AutoTextarea } from "@/components/auto-textarea";
import { useAuth } from "@/lib/auth-context";
import { useIssueTimeline } from "@/lib/use-issue-timeline";
import { useIssueDictation } from "@/lib/use-issue-dictation";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { issueIdentifier } from "@/lib/issue-constants";
import { DocumentTitle } from "@/components/document-title";
import { IntegrationIndicator } from "@/components/integration-indicator";
import { RemoteIssueIndicator } from "@/components/remote-issue-indicator";
import { SITE_NAME } from "@/lib/site";
import type {
  Category,
  CreateIssueInput,
  Issue,
  IssueDraftPatch,
  IssueRelation,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
} from "@/lib/types";

export function IssueSidePanel({
  issue,
  open,
  onOpenChange,
  projectKey,
  members,
  categories,
  objectives,
  allIssues,
  relations,
  onUpdate,
  onDelete,
  onSetCategories,
  onCreate,
  onOpenIssue,
  onAddRelation,
  onRemoveRelation,
  initialTab = "description",
}: {
  issue: Issue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  allIssues: Issue[];
  /** Every project relation row (raw); resolved for this issue below. */
  relations: IssueRelation[];
  onUpdate: (issueId: string, updates: IssueUpdateInput) => Promise<unknown>;
  onDelete: (issueId: string) => Promise<void>;
  onSetCategories: (issueId: string, categoryIds: string[]) => Promise<void>;
  onCreate: (input: CreateIssueInput) => Promise<unknown>;
  onOpenIssue: (id: string) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  onRemoveRelation: (relationId: string) => void;
  /** Tab to show when the panel (re)opens on a new issue. */
  initialTab?: "description" | "plan";
}) {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tPlan = useTranslations("Plan");
  const tAgent = useTranslations("Agent");
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"description" | "plan">(initialTab);
  // Remount the description editor when the description is rewritten under it
  // (dictation, ou une écriture distante) — il ne lit `value` qu'au montage et
  // ne commite qu'au blur.
  const [editorKey, setEditorKey] = useState(0);

  /**
   * Suivre les écritures DISTANTES pendant que le panneau reste ouvert (MIN-89).
   *
   * Le reste du panneau lit `issue` directement : statut, priorité, plan, liens
   * suivent donc le cache dès que le pont temps réel l'invalide. Le titre et la
   * description, eux, sont des copies LOCALES — un état pour l'un, une valeur
   * lue au montage par l'éditeur pour l'autre — semées à l'ouverture du ticket
   * et jamais reprises ensuite. Un agent (Numo, MCP, coéquipier) pouvait donc
   * réécrire les deux sans que l'écran bouge, jusqu'au rechargement.
   *
   * La règle : adopter la version distante, JAMAIS par-dessus une frappe. Un
   * champ qui a le focus, ou retouché sans être encore commité, garde la main.
   */
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  /** Ticket dont les copies locales ci-dessous portent la version. */
  const shownFor = useRef<string | null>(null);
  /** Dernière version SERVEUR déjà reflétée à l'écran : distingue une écriture
      distante (à adopter) de l'écho de notre propre édition (déjà affichée). */
  const shownTitle = useRef("");
  const shownDescription = useRef("");
  /** Retouché à la main depuis la dernière synchro. Sans ces deux drapeaux, un
      simple aller-retour du focus recommiterait le reflet périmé du champ —
      c'est-à-dire annulerait la modification que l'agent vient d'écrire. */
  const titleEdited = useRef(false);
  const descriptionEdited = useRef(false);
  // Conversation de l'agent, en modal PAR-DESSUS le panneau : la reprise à chaud
  // ne doit pas coûter le contexte du ticket (la carte, elle, n'a rien à perdre
  // et navigue vers /agents).
  const [chatOpen, setChatOpen] = useState(false);
  // « Personnalisé » : le dialog de consigne libre, ouvert soit pour copier le
  // prompt, soit pour lancer l'agent (`null` = fermé).
  const [customTarget, setCustomTarget] = useState<CustomPromptTarget | null>(null);

  const { items, addComment, updateComment, deleteComment, deleteAttachment } =
    useIssueTimeline(issue?.id ?? null);

  // Agent de code de ce ticket. Mêmes dérivations que les cartes (lib/server/
  // agent/activity.ts), mais depuis les runs de l'issue seule : le panneau
  // s'ouvre aussi là où le provider d'activité du board n'existe pas (page Pull
  // requests, board de feedback). La PR voyage avec, servie par la même route et
  // lue sur `pull_requests` : un ticket peut en porter une sans aucun run.
  const { runs, pullRequest } = useIssueAgentRunsQuery(issue?.id ?? null);
  const { agentsAllowed } = usePlanGates();
  // Agent + PR indisponibles sans dépôt lié (MIN-80) : le serveur rejette de toute
  // façon un lancement `noRepo`, on retire donc l'option en amont. Permissif tant
  // que la requête charge → aucun flash sur le cas courant (projet AVEC dépôt).
  const { link: repoLink, loading: repoLinkLoading } = useProjectGitLinkQuery(
    issue?.project_id ?? null
  );
  const agentsEnabled = agentsAllowed && (repoLinkLoading || repoLink != null);
  const agentWorking = runs.some((r) => isAgentRunWorking(r.status));
  const latestRun = runs[0] ?? null;
  // Une conversation reprennable existe (au moins une run non `failed`).
  const hasAgentSession = runs.some((r) => r.status !== "failed");

  // Cycle (MIN-32) : le panneau lit le cycle courant lui-même plutôt que de le
  // faire descendre par ses quatre appelants — le hook est déjà gaté par les
  // préférences utilisateur, donc ne coûte rien quand les cycles sont éteints.
  const { currentCycle, nextCycle } = useMyCycleQuery();
  const onSetIssueCycle = useCallback(
    (target: Issue, cycleId: string | null) =>
      void onUpdate(
        target.id,
        // Mirrors the server side-effect: adding assigns to me, never a status bump.
        cycleId && user?.id
          ? { cycle_id: cycleId, assignee_id: user.id }
          : { cycle_id: cycleId }
      ).catch((err) => toast.error((err as Error).message)),
    [onUpdate, user?.id]
  );
  const buildCycleActions = useCycleMenuActions(
    currentCycle?.id ?? null,
    nextCycle?.id ?? null,
    onSetIssueCycle
  );

  // Land on the tab the opener asked for (plan indicator → plan tab).
  useEffect(() => {
    setTab(initialTab);
  }, [issue?.id, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Titre et description : semés à l'ouverture du ticket, puis tenus à jour sur
  // les écritures distantes (voir les refs plus haut).
  useEffect(() => {
    if (!issue) return;
    const description = issue.description ?? "";

    // Ticket différent : tout repart de lui. L'éditeur remonte déjà de son côté
    // (sa `key` porte `issue.id`), il n'y a que l'état du titre à semer.
    if (shownFor.current !== issue.id) {
      shownFor.current = issue.id;
      shownTitle.current = issue.title;
      shownDescription.current = description;
      titleEdited.current = false;
      descriptionEdited.current = false;
      setTitle(issue.title);
      return;
    }

    // Une version qu'on refuse d'adopter n'est PAS notée : elle reste « en
    // attente », et le champ la prend dès qu'il rend la main (commitTitle pour
    // le titre, le blur du conteneur pour la description).
    if (
      issue.title !== shownTitle.current &&
      !titleEdited.current &&
      document.activeElement !== titleRef.current
    ) {
      shownTitle.current = issue.title;
      setTitle(issue.title);
    }

    // L'éditeur ne relit pas `value` : l'adopter, c'est le remonter — le même
    // levier que la dictée. Donc jamais pendant qu'on y écrit.
    if (
      description !== shownDescription.current &&
      !descriptionEdited.current &&
      !descriptionRef.current?.contains(document.activeElement)
    ) {
      shownDescription.current = description;
      setEditorKey((k) => k + 1);
    }
  }, [issue?.id, issue?.title, issue?.description]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => planProgress(issue?.plan), [issue?.plan]);
  // Un plan existe déjà → les entrées « plan » (menu ⋯, onglet Plan, prompt
  // copié, agent Numo) basculent de « générer » à « vérifier ».
  const issueHasPlan = hasPlanTasks(issue?.plan);

  // This issue's relations, resolved to the display shape (with the other
  // issue's number) and priority-sorted. Numbers come from allIssues so a
  // filtered-out target still resolves.
  const resolvedRelations = useMemo<ChipRelation[]>(() => {
    if (!issue) return [];
    const byId = new Map(allIssues.map((i) => [i.id, i]));
    const statusById = new Map(allIssues.map((i) => [i.id, i.status]));
    return resolveRelations(issue.id, relations, statusById)
      .map((r) => {
        const other = byId.get(r.otherId);
        return other ? { ...r, otherNumber: other.number } : null;
      })
      .filter((r): r is ChipRelation => r !== null);
  }, [issue?.id, relations, allIssues]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Agent de code (MIN-46 / MIN-68) ──────────────────────────────────────
  // Deux points d'entrée, comme sur les cartes :
  //  • ouvrir la conversation existante — ici en modal sur la dernière run, pour
  //    garder le ticket sous les yeux (la carte, elle, navigue vers /agents) ;
  //  • lancer une session NEUVE — pose un brouillon de composition optimiste et
  //    ouvre son composer (`?compose=`), même si le ticket a déjà une session.
  const composeAgentSession = useCallback(
    (prompt: string, intent: AgentComposeIntent = "implement") => {
      if (!issue) return;
      setAgentComposeDraft({
        kind: "issue",
        issueId: issue.id,
        issueNumber: issue.number,
        issueTitle: issue.title,
        projectId: issue.project_id,
        projectKey,
        prompt,
        intent,
      });
      router.push(`/agents?compose=${issue.id}`);
    },
    [issue, projectKey, router]
  );

  const startNewAgentSession = useCallback(() => {
    if (!issue) return;
    // « Nouvelle session » sur un ticket DÉJÀ pourvu (branche/PR/contexte hérités) →
    // composer VIERGE : l'utilisateur dicte lui-même la consigne. Premier lancement à
    // froid → prompt d'amorçage (contexte du ticket, adapté à son plan / effort).
    const identifier = issueIdentifier(projectKey, issue.number);
    const prompt = hasAgentSession
      ? ""
      : `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent(`launchPrompt.${agentLaunchPromptVariant(issue)}`)}`;
    composeAgentSession(prompt);
  }, [issue, hasAgentSession, projectKey, composeAgentSession, tAgent]);

  // « Écrire avec Numo » / « Vérifier le plan avec Numo » (onglet Plan) :
  // session neuve dont la consigne est de CADRER le ticket — écrire le plan
  // quand il n'y en a pas, le reprendre point par point quand il existe — puis
  // s'arrêter. Toujours une session neuve, même si le ticket en a déjà une : le
  // composer s'ouvre avec la consigne, l'utilisateur l'envoie (ou l'amende).
  // `intent: "plan"` : ce lancement-là ne fait PAS démarrer le ticket (le
  // serveur ne le passe pas « en cours ») — planifier n'est pas commencer.
  const writePlanWithAgent = useCallback(() => {
    if (!issue) return;
    const identifier = issueIdentifier(projectKey, issue.number);
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent(`launchPrompt.${agentPlanPromptVariant(issue)}`)}`,
      "plan"
    );
  }, [issue, projectKey, composeAgentSession, tAgent]);

  // « Vérifier l'implémentation » : session neuve qui relit le travail DÉJÀ fait
  // face au plan et aux commentaires du ticket, puis corrige les bugs prouvés.
  // `intent: "verify"` : le ticket ne bouge pas — contrôler du travail fait
  // n'est pas le commencer, et un ticket en revue doit y rester.
  const verifyWithAgent = useCallback(() => {
    if (!issue) return;
    const identifier = issueIdentifier(projectKey, issue.number);
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent("launchPrompt.verifyImplementation")}`,
      "verify"
    );
  }, [issue, projectKey, composeAgentSession, tAgent]);

  // ⇧A : ticket déjà pourvu d'une session → on l'ouvre ; sinon on en démarre une neuve.
  // Plan sans agents (MIN-72) : le raccourci est inerte, les entrées de menu absentes.
  const launchAgent = useCallback(() => {
    if (!agentsEnabled) return;
    if (hasAgentSession) setChatOpen(true);
    else startNewAgentSession();
  }, [agentsEnabled, hasAgentSession, startNewAgentSession]);

  // `?pr=` et non `?run=` : le lien doit marcher aussi pour une PR qu'aucun run
  // n'a ouverte — une PR humaine, ou une PR rattachée à la main (MIN-163).
  const openPr = useCallback(() => {
    if (pullRequest) router.push(`/pull-requests?pr=${pullRequest.prId}`);
  }, [pullRequest, router]);

  // Contexte partagé par les deux prompts copiables (travailler sur le ticket,
  // écrire son plan) : relations résolues et noms des catégories.
  const promptContext = useMemo(() => {
    if (!issue) return null;
    const titleById = new Map(allIssues.map((i) => [i.id, i.title]));
    return {
      relations: resolvedRelations.map((r) => ({
        type: r.relation,
        identifier: issueIdentifier(projectKey, r.otherNumber),
        title: titleById.get(r.otherId) ?? "",
      })),
      // Noms des catégories (les IDs vivent sur l'issue, les noms dans `categories`).
      categories: issue.category_ids
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter((name): name is string => !!name),
    };
  }, [issue, allIssues, resolvedRelations, categories, projectKey]);

  const copyPrompt = useCallback(async () => {
    if (!issue || !promptContext) return;
    // MIN-20 : copier le prompt démarre le ticket (option activée par défaut,
    // désactivable dans Compte → Préférences). On n'avance que les statuts
    // pré-travail, et le toast ne signale le déplacement que s'il a eu lieu.
    const autoStart =
      resolvePromptCopyAutoStart(user?.user_metadata) &&
      shouldAutoStartOnPromptCopy(issue.status);
    // Le XML copié doit refléter l'état RÉEL après déplacement : si on passe le
    // ticket « En cours », le prompt le décrit déjà `in_progress`, pas l'ancien.
    const promptIssue = autoStart
      ? { ...issue, status: "in_progress" as const }
      : issue;
    await navigator.clipboard.writeText(
      buildIssuePrompt({
        issue: promptIssue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        attachmentCount: issue.attachment_count,
      })
    );
    if (autoStart) {
      void onUpdate(issue.id, { status: "in_progress" }).catch((err) =>
        toast.error((err as Error).message)
      );
      toast.success(t("promptCopiedMoved"));
    } else {
      toast.success(t("promptCopied"));
    }
  }, [issue, promptContext, projectKey, user?.user_metadata, onUpdate, t]);

  // « Copier le prompt » de l'onglet Plan : le même ticket, mais une consigne
  // de CADRAGE (écrire le plan quand il manque, le vérifier point par point
  // quand il existe — `buildIssuePlanPrompt` bascule seul) pour un agent
  // externe, qui l'enregistrera sur le ticket via le MCP. Aucun démarrage
  // automatique ici : planifier n'est pas commencer le travail.
  const copyPlanPrompt = useCallback(async () => {
    if (!issue || !promptContext) return;
    await navigator.clipboard.writeText(
      buildIssuePlanPrompt({
        issue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        attachmentCount: issue.attachment_count,
      })
    );
    toast.success(
      tPlan(issueHasPlan ? "reviewPromptCopied" : "planPromptCopied")
    );
  }, [issue, promptContext, projectKey, issueHasPlan, tPlan]);

  // « Vérifier l'implémentation » côté prompt copié : la consigne de CONTRÔLE
  // (relire le travail fait face au plan et aux commentaires, corriger les vrais
  // bugs) pour un agent externe. Pas de démarrage automatique : on relit du
  // travail déjà fait, on ne le commence pas.
  const copyVerifyPrompt = useCallback(async () => {
    if (!issue || !promptContext) return;
    await navigator.clipboard.writeText(
      buildIssueVerifyPrompt({
        issue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        attachmentCount: issue.attachment_count,
      })
    );
    toast.success(t("verifyPromptCopied"));
  }, [issue, promptContext, projectKey, t]);

  // « Personnalisé » : la consigne saisie dans le dialog remplace la consigne
  // toute faite — le contexte du ticket, lui, reste fourni par minddy (bloc
  // <issue> du prompt copié ; contexte de session côté agent Numo). Aucun
  // démarrage automatique : on ne sait pas si cette consigne est du travail.
  const runCustomPrompt = useCallback(
    async (instructions: string, target: CustomPromptTarget) => {
      if (!issue || !promptContext) return;
      if (target === "launch") {
        const identifier = issueIdentifier(projectKey, issue.number);
        composeAgentSession(
          `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${instructions}`,
          "custom"
        );
        return;
      }
      await navigator.clipboard.writeText(
        buildIssueCustomPrompt(
          {
            issue,
            projectId: issue.project_id,
            projectKey,
            categories: promptContext.categories,
            relations: promptContext.relations,
            attachmentCount: issue.attachment_count,
          },
          instructions
        )
      );
      toast.success(t("promptCopied"));
    },
    [issue, promptContext, projectKey, composeAgentSession, tAgent, t]
  );

  // « Copier le prompt » et « Lancer l'agent Numo » : deux sous-menus, chacun
  // avec la feuille « plan » (générer ou vérifier, selon le ticket) et
  // « Implémenter le ticket » (hook partagé avec les cartes du board).
  const agentActions = useAgentMenuActions({
    issueId: issue?.id ?? null,
    agentsEnabled,
    hasSession: hasAgentSession,
    hasPlan: issueHasPlan,
    onCopyPrompt: () => void copyPrompt(),
    onCopyPlanPrompt: () => void copyPlanPrompt(),
    onCopyVerifyPrompt: () => void copyVerifyPrompt(),
    onCopyCustomPrompt: () => setCustomTarget("copy"),
    onImplementWithAgent: startNewAgentSession,
    onWritePlanWithAgent: writePlanWithAgent,
    onVerifyWithAgent: verifyWithAgent,
    onCustomWithAgent: () => setCustomTarget("launch"),
    onOpenSession: () => setChatOpen(true),
    // « Automatiser » (MIN-147) : le forçage vit sur le ticket, donc il s'écrit
    // par le même chemin que ses autres champs.
    automationOverride: issue?.automation_override ?? null,
    onSetAutomationOverride: issue
      ? (next) =>
          void onUpdate(issue.id, { automation_override: next }).catch((err) =>
            toast.error((err as Error).message),
          )
      : undefined,
  });

  // Field shortcuts (S/P/E/A/L/D/O) — active while the pointer hovers the panel
  // body; the picker opens at the cursor, in the key/value section. `d` maps to
  // the due-date picker here just like on board cards (voice dictation lives on
  // `v`, so nothing needs to be freed). ⇧P / ⇧A doublent le menu « ⋯ », comme sur
  // les cartes ; le hook ne les déclenche jamais pendant une saisie (titre,
  // description, commentaire).
  // Le dialog « Personnalisé » les suspend : il couvre le panneau, et une touche
  // frappée là-dedans ne doit pas ouvrir un picker sur le ticket en dessous.
  const { containerProps, menuState, closeMenu } = useIssueFieldShortcuts(
    open && !customTarget,
    {
      "shift+p": () => void copyPrompt(),
      "shift+a": launchAgent,
    }
  );

  // Apply a dictated patch: categories go through their own join-table
  // endpoint, everything else is one immediate issue update. Also sync the
  // local title state and remount the description editor so the new text shows.
  const applyDictated = (patch: IssueDraftPatch) => {
    if (!issue) return;
    const { category_ids, ...fields } = patch;
    const updates: IssueUpdateInput = {
      ...fields,
      ...(fields.description !== undefined
        ? { description: fields.description.trim() || null }
        : {}),
    };
    if (Object.keys(updates).length > 0) {
      void onUpdate(issue.id, updates).catch((err) =>
        toast.error((err as Error).message)
      );
    }
    // La dictée écrit CE que le panneau affiche : on note la version au passage,
    // sinon l'écho de notre propre patch repasserait pour une écriture distante
    // et remonterait l'éditeur une seconde fois.
    if (fields.title !== undefined) {
      shownTitle.current = fields.title;
      titleEdited.current = false;
      setTitle(fields.title);
    }
    if (fields.description !== undefined) {
      shownDescription.current = fields.description.trim();
      descriptionEdited.current = false;
      setEditorKey((k) => k + 1);
    }
    if (category_ids) {
      void onSetCategories(issue.id, category_ids).catch((err) =>
        toast.error((err as Error).message)
      );
    }
  };

  // Voice editing (Numo): dictated commands become immediate field updates.
  // The draft fallbacks are for type-safety only — the mic lives inside the
  const mentions = useDescriptionMentions(issue?.project_id ?? null, members);

  // panel, so dictation never runs without an open issue.
  const {
    busy: numoBusy,
    onTranscript,
    reset: resetDictation,
  } = useIssueDictation({
    projectId: issue?.project_id ?? "",
    mode: "edit",
    getDraft: () => ({
      title: issue?.title ?? "",
      description: issue?.description ?? "",
      status: issue?.status ?? "backlog",
      priority: issue?.priority ?? "none",
      effort: issue?.effort ?? null,
      assignee_id: issue?.assignee_id ?? null,
      objective_id: issue?.objective_id ?? null,
      due_date: issue?.due_date ?? null,
      category_ids: issue?.category_ids ?? [],
    }),
    applyPatch: applyDictated,
  });

  // A different ticket (or a closed panel) = a fresh dictation session: drop
  // the history and abort any in-flight request.
  useEffect(() => {
    resetDictation();
  }, [issue?.id, resetDictation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une prise en cours de transcription (l'audio est parti, le texte n'est pas
  // revenu) : avec la suite Numo, c'est la fenêtre où fermer perd la dictée.
  const [transcribing, setTranscribing] = useState(false);
  const handleOpenChange = (next: boolean) => {
    // La dictée édite CE ticket : le transcript, puis le patch de Numo, vont y
    // atterrir. Fermer maintenant les jetterait — on refuse, en le disant (une
    // Échap sans effet passerait pour une panne).
    if (!next && (transcribing || numoBusy)) {
      toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
      return;
    }
    onOpenChange(next);
  };

  if (!issue) return null;

  const patch = async (updates: IssueUpdateInput) => {
    try {
      await onUpdate(issue.id, updates);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isChild = !!issue.parent_id;
  const parent = issue.parent_id
    ? allIssues.find((i) => i.id === issue.parent_id) ?? null
    : null;

  const commitTitle = () => {
    const trimmed = title.trim();
    // Le champ n'a fait que perdre le focus, sans une frappe. Si un agent a
    // renommé le ticket entre-temps, c'est SON titre qui vaut : le nôtre n'est
    // qu'un reflet, et le recommitter annulerait sa modification.
    if (!titleEdited.current) {
      if (trimmed !== issue.title) setTitle(issue.title);
      return;
    }
    titleEdited.current = false;
    if (trimmed && trimmed !== issue.title) {
      shownTitle.current = trimmed;
      void patch({ title: trimmed });
    } else if (!trimmed) setTitle(issue.title);
  };

  const commitDescription = (markdown: string) => {
    // Même garde que pour le titre : un blur sans frappe ne réécrit rien.
    if (!descriptionEdited.current) return;
    descriptionEdited.current = false;
    const next = markdown.trim() || null;
    if (next === (issue.description ?? null)) return;
    shownDescription.current = next ?? "";
    void patch({ description: next });
  };

  const handleDelete = async () => {
    await onDelete(issue.id);
    toast.success(t("issueDeletedToast"));
    onOpenChange(false);
  };

  // Menu « ⋯ » de l'en-tête : la parité d'actions avec le clic droit d'une carte
  // (prompt, agent, PR, cycle), plus la suppression qui vivait ici avant.
  const menuActions: ContextMenuAction[] = [
    ...agentActions,
    // « Voir la pull request » dès qu'il y en a une, QUEL QUE SOIT SON ÉTAT : une
    // PR fermée reste ce qui s'est passé sur ce ticket, et c'est souvent elle
    // qu'on cherche. Le chip de l'en-tête, lui, se tait dessus.
    ...(agentsEnabled && pullRequest
      ? [
          {
            id: "open-pr",
            label: tAgent("viewPullRequest"),
            keywords: ["pull request", "pr", "review", "github", "merge"],
            icon: <GitPullRequest className="size-4" />,
            onSelect: openPr,
          },
        ]
      : []),
    ...buildCycleActions(issue),
    {
      id: "delete",
      label: tCommon("moveToTrash"),
      icon: <Trash2 className="size-4" />,
      separatorBefore: true,
      variant: "destructive",
      onSelect: () => setConfirmDelete(true),
    },
  ];

  return (
    <>
      {/* Le ticket ouvert nomme l'onglet — « MIN-42 · Corriger le redirect ».
          Ni la page ni un layout ne peuvent le faire : le ticket vit dans un
          paramètre de recherche, pas dans une route. */}
      {open && (
        <DocumentTitle
          title={`${issueIdentifier(projectKey, issue.number)} · ${issue.title} · ${SITE_NAME}`}
        />
      )}
      <SidePanel open={open} onOpenChange={handleOpenChange}>
        <SidePanelContent
          onInteractOutside={keepOverlayOpenForPopper}
          // Radix moves focus to the first tabbable element when the panel
          // opens; here that's the Dictate button, whose tooltip then pops up.
          // Suppress the open-autofocus so nothing is focused on open.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header: identifier · agent state · dictate · more · close */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-3">
            <div className="flex min-w-0 items-center gap-1">
              <SidePanelTitle asChild>
                <span className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
                  <IntegrationIndicator issue={issue} iconClassName="size-4" />
                  <RemoteIssueIndicator issue={issue} iconClassName="size-4" />
                  {parent && (
                    <button
                      type="button"
                      onClick={() => onOpenIssue(parent.id)}
                      aria-label={t("openParentAria", {
                        id: issueIdentifier(projectKey, parent.number),
                      })}
                      className="rounded font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none"
                    >
                      {issueIdentifier(projectKey, parent.number)}
                    </button>
                  )}
                  {/* Comme sur la carte : survoler « › MIN-42 » nomme la relation
                      que le seul chevron laisse deviner. */}
                  {parent ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1.5">
                          <ChevronRight
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          {issueIdentifier(projectKey, issue.number)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("subIssueOf", {
                          id: issueIdentifier(projectKey, parent.number),
                        })}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    issueIdentifier(projectKey, issue.number)
                  )}
                </span>
              </SidePanelTitle>
              {resolvedRelations.length > 0 && (
                <RelationChips
                  relations={resolvedRelations}
                  projectKey={projectKey}
                  onOpen={onOpenIssue}
                  max={1}
                  className="font-mono text-xs text-muted-foreground"
                />
              )}
              {/* Agent de code : le seul état qui mérite l'en-tête (au travail,
                  ou une PR à relire) — le reste est dans le menu « ⋯ ». */}
              {agentsEnabled && (
                <IssueAgentChip
                  working={agentWorking}
                  pr={pullRequest}
                  onOpenConversation={() => setChatOpen(true)}
                  onOpenPr={openPr}
                />
              )}
              {/* Voice editing — Numo turns dictated commands into field updates */}
              {numoBusy ? (
                <>
                  <span
                    className="inline-flex size-8 shrink-0 items-center justify-center"
                    aria-hidden
                  >
                    <NumoIcon
                      state="thinking"
                      className="size-5 text-primary animate-in fade-in duration-300"
                    />
                  </span>
                  <span className="sr-only" role="status">
                    {t("numoUpdating")}
                  </span>
                </>
              ) : (
                <DictateButton
                  onTranscription={onTranscript}
                  tooltipLabel={t("dictateEditTooltip")}
                  shortcutKey="mod+shift+d"
                  onProcessingChange={setTranscribing}
                />
              )}
            </div>
            <div className="-mr-1.5 flex items-center gap-0.5">
              <IssueActionsMenu
                actions={menuActions}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("moreActionsAriaLabel")}
                    className="rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal />
                  </Button>
                }
              />
              <SidePanelClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tCommon("close")}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X />
                </Button>
              </SidePanelClose>
            </div>
          </div>

          <SidePanelBody className="flex flex-col gap-4 pt-0" {...containerProps}>
            <AutoTextarea
              ref={titleRef}
              value={title}
              onChange={(e) => {
                titleEdited.current = true;
                setTitle(e.target.value);
              }}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="w-full shrink-0 overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
              placeholder={t("titlePlaceholder")}
            />

            {/* La chaîne d'automatisation, quand il y en a une (MIN-147). Sous le
                titre et non dans l'en-tête : ce n'est pas un état d'une ligne,
                c'est un travail en cours avec deux gestes à offrir. Elle se
                masque toute seule quand la chaîne est finie.
                PAS derrière `agentsEnabled` : une chaîne qui EXISTE est un fait,
                et le cas qui mérite le plus d'être montré est justement celui
                d'une chaîne arrêtée FAUTE de dépôt lié. */}
            <ChainStatusBar issueId={issue.id} />

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "description" | "plan")}
            >
              <TabsList variant="line" className="w-full justify-start p-0">
                <TabsTrigger value="description">
                  {tPlan("tabDescription")}
                </TabsTrigger>
                <TabsTrigger value="plan" className="gap-1.5">
                  {tPlan("tabPlan")}
                  {progress.total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {progress.done}/{progress.total}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="mt-4">
                <IssuePlan
                  key={issue.id}
                  plan={issue.plan}
                  onCommit={(plan) => void patch({ plan })}
                  // Numo n'apparaît que là où il peut travailler : plan payant
                  // + dépôt lié (même porte que ⇧A / le menu « ⋯ »). Les prompts
                  // copiables, eux, marchent avec n'importe quel agent externe.
                  onWriteWithAgent={agentsEnabled ? writePlanWithAgent : undefined}
                  onCopyPrompt={() => void copyPlanPrompt()}
                  onImplementWithAgent={
                    agentsEnabled ? startNewAgentSession : undefined
                  }
                  onCopyImplementPrompt={() => void copyPrompt()}
                  onVerifyWithAgent={agentsEnabled ? verifyWithAgent : undefined}
                  onCopyVerifyPrompt={() => void copyVerifyPrompt()}
                />
              </TabsContent>

              <TabsContent value="description" className="mt-4 flex flex-col gap-6">
                {/* Le conteneur sert de repère de focus : tant que le curseur est
                    DANS l'éditeur, une écriture distante ne le remonte pas — et
                    au moment où il en sort, l'éditeur prend la version en
                    attente (le blur ne change rien d'autre : sans frappe, rien
                    n'est commité, donc rien ne redéclencherait l'effet). */}
                <div
                  ref={descriptionRef}
                  onBlur={() => {
                    const description = issue.description ?? "";
                    if (
                      descriptionEdited.current ||
                      description === shownDescription.current
                    ) {
                      return;
                    }
                    shownDescription.current = description;
                    setEditorKey((k) => k + 1);
                  }}
                >
                  <MarkdownEditor
                    key={`${issue.id}:${editorKey}`}
                    mentions={mentions}
                    value={issue.description ?? ""}
                    onCommit={commitDescription}
                    onEdit={() => {
                      descriptionEdited.current = true;
                    }}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </div>

                {/* Key/value properties — borderless, like the issue cards.
                    Attachments and relations are rows of this table too: each
                    puts its control on the value side and lists its content
                    right under the row, so they read as properties of the
                    ticket rather than sections of their own. */}
                <div className="flex flex-col">
                  <PropertyRow label={tField("status")}>
                    <StatusValue
                      value={issue.status}
                      onChange={(status) => void patch({ status })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("priority")}>
                    <PriorityValue
                      value={issue.priority}
                      onChange={(priority) => void patch({ priority })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("effort")}>
                    <EffortValue
                      value={issue.effort}
                      onChange={(effort) => void patch({ effort })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("assignee")}>
                    <AssigneeValue
                      value={issue.assignee_id}
                      members={members}
                      onChange={(assignee_id) => void patch({ assignee_id })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("categories")}>
                    <CategoryValue
                      categories={categories}
                      projectId={issue.project_id}
                      value={issue.category_ids}
                      onChange={(ids) => {
                        void onSetCategories(issue.id, ids).catch((err) =>
                          toast.error((err as Error).message)
                        );
                      }}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("dueDate")}>
                    <DueDateValue
                      value={issue.due_date}
                      onChange={(due_date) => void patch({ due_date })}
                      recurrence={issue.recurrence}
                      onRecurrenceChange={(next) => void patch(next)}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("objectiveLinked")}>
                    <ObjectiveValue
                      value={issue.objective_id}
                      objectives={objectives}
                      projectId={issue.project_id}
                      onChange={(objective_id) => void patch({ objective_id })}
                    />
                  </PropertyRow>

                  <IssueAttachmentsSection
                    issueId={issue.id}
                    projectId={issue.project_id}
                  />

                  <RelationsSection
                    issue={issue}
                    relations={resolvedRelations}
                    allIssues={allIssues}
                    projectKey={projectKey}
                    onOpenIssue={onOpenIssue}
                    onAddRelation={onAddRelation}
                    onRemoveRelation={onRemoveRelation}
                  />
                </div>

                {!isChild && (
                  <SubIssuesSection
                    issue={issue}
                    allIssues={allIssues}
                    projectKey={projectKey}
                    onOpenIssue={onOpenIssue}
                    onCreate={onCreate}
                  />
                )}

                <IssueActivity
                  items={items}
                  ctx={{
                    members,
                    objectives,
                    categories,
                    issues: allIssues,
                    projectKey,
                  }}
                  currentUserId={user?.id ?? null}
                  projectId={issue.project_id}
                  onReply={(parentId, body, mentions, attachments) =>
                    addComment(body, mentions, parentId, attachments)
                  }
                  onEditComment={updateComment}
                  onDeleteComment={deleteComment}
                  onDeleteAttachment={deleteAttachment}
                />
              </TabsContent>
            </Tabs>
          </SidePanelBody>

          <IssueShortcutMenu
            state={menuState}
            onClose={closeMenu}
            issue={issue}
            members={members}
            categories={categories}
            objectives={objectives}
            onUpdate={(updates) => void patch(updates)}
            onSetCategories={(ids) =>
              void onSetCategories(issue.id, ids).catch((err) =>
                toast.error((err as Error).message)
              )
            }
          />

          <SidePanelFooter className="border-t-0 pt-3 sm:flex-row">
            <CommentComposer
              members={members}
              projectId={issue.project_id}
              onSubmit={(body, mentions, attachments) =>
                addComment(body, mentions, null, attachments)
              }
            />
          </SidePanelFooter>

          {/* Numo reprend la dictée : le liseré souligne le bord du panneau
            pendant qu'il travaille — même signal que l'icône Numo « thinking »
            qui remplace le micro dans l'en-tête. */}
          <AgentBeamOverlay active={numoBusy} />
        </SidePanelContent>
      </SidePanel>

      {/* Reprise à chaud de la conversation, PAR-DESSUS le panneau : ouvre la
          dernière run et donne accès à l'historique des runs du ticket. Montée
          seulement quand une run existe — sans `initialRunId` la modal
          retomberait sur un composer, ce que fait déjà « Nouvelle session ». */}
      {latestRun && (
        <AgentChatModal
          open={chatOpen}
          onOpenChange={setChatOpen}
          issueId={issue.id}
          issueIdentifier={issueIdentifier(projectKey, issue.number)}
          initialRunId={latestRun.id}
        />
      )}

      <CustomPromptDialog
        target={customTarget}
        onOpenChange={(open) => !open && setCustomTarget(null)}
        onSubmit={(instructions, target) => {
          void runCustomPrompt(instructions, target);
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { days: TRASH_RETENTION_DAYS })}
        confirmLabel={tCommon("moveToTrash")}
        cancelLabel={tCommon("cancel")}
        onConfirm={handleDelete}
      />
    </>
  );
}
