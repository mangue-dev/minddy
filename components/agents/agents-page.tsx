"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Skeleton, cn } from "mangue-ui";
import { Bot, GitPullRequest, NotebookPen, Plus } from "lucide-react";
import { AgentSessionDetail } from "@/components/agents/agent-session-detail";
import { EmptyScene } from "@/components/empty-scene";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { LaunchAgentPicker } from "@/components/agents/launch-agent-picker";
import { NoteCompose } from "@/components/agents/note-compose";
import { PrIssuePanel } from "@/components/pull-requests/pr-issue-panel";
import { ProjectOrb } from "@/components/project-orb";
import { NumoIcon } from "@/components/numo-icon";
import { useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useProjects } from "@/lib/projects-context";
import { useAgentReads } from "@/lib/use-agent-reads";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  NOTE_COMPOSE_PARAM,
  setAgentComposeDraft,
  useAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { isAgentSessionUnread, type AgentRunSummary, type AgentSessionListItem } from "@/lib/agent-api";

/**
 * Vrai dès que le volet détail est rendu par le layout (breakpoint md = 768px, le
 * volet passe en `md:flex`). Sert à savoir si la conversation SÉLECTIONNÉE est
 * réellement affichée (desktop) ou seulement présélectionnée derrière la liste
 * (mobile). Uniquement lu dans un effet → pas de souci d'hydratation (valeur `false`
 * au 1er rendu serveur/client, corrigée juste après).
 */
function useIsWideViewport(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/**
 * Clé STABLE d'une session dans la liste : l'issue pour une session de ticket
 * (ses runs successives partagent la clé), le run lui-même pour une session
 * CARNET (MIN-84) ou de RELECTURE (MIN-168) — là, le run EST la session : pas de
 * lignée, et deux relectures de la même PR sont deux conversations distinctes.
 */
function sessionKey(s: AgentSessionListItem): string {
  return s.issue?.id ?? s.runId;
}

/**
 * L'étiquette d'ancrage d'une session, à gauche de sa carte : l'identifiant du
 * ticket, « Carnet », ou « Analyse de PR ». Les trois occupent la même place et
 * répondent à la même question — de quoi cette session parle-t-elle ?
 */
function SessionAnchorBadge({ session }: { session: AgentSessionListItem }) {
  const t = useTranslations("Agents");
  if (session.issue && session.project) {
    return (
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {issueIdentifier(session.project.key, session.issue.number)}
      </span>
    );
  }
  if (session.pullRequest) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <GitPullRequest className="size-3.5" />
        {t("prBadge")}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
      <NotebookPen className="size-3.5" />
      {t("noteBadge")}
    </span>
  );
}

/**
 * Page Agents — vue liste/détail façon Pull Requests : à gauche TOUTES les sessions
 * de l'agent Numo (tous projets accessibles, sans filtre), à droite la conversation
 * inline (`AgentSessionDetail` → `AgentConversation`, le même cœur que la modal). Une
 * SESSION = une issue (titre dérivé du ticket) OU un run carnet (MIN-84, titre =
 * excerpt de la note). Alimentée par /api/agent-runs (dédoublonné par issue ; un run
 * carnet est sa propre session). La session sélectionnée est publiée dans le
 * contexte de Numo quand elle a une issue.
 *
 * Points d'entrée « Lancer un agent » :
 *  • ISSUE (MIN-46) : le bouton du panneau d'issue pose un BROUILLON
 *    (`useAgentComposeDraft`, kind "issue") et navigue ici avec `?compose=<issueId>`.
 *  • CARNET (MIN-84) : les boutons du carnet posent un brouillon kind "note" (la
 *    note comme prompt) et naviguent avec `?compose=note` — le volet ouvre alors le
 *    composer carnet (`NoteCompose` : projet + modèle + branche).
 * Purement optimiste dans les deux cas : si l'utilisateur n'envoie pas le 1er
 * message, l'entrée disparaît sans qu'aucune run n'ait existé ; dès qu'il l'envoie,
 * la run réelle prend le relais dans le même volet.
 */
export function AgentsPage() {
  const t = useTranslations("Agents");
  const tProjects = useTranslations("Projects");
  const format = useFormatter();
  const router = useRouter();
  const { projects, openCreateProject } = useProjects();
  const { sessions, loading } = useAgentSessionsQuery();
  const { reads, markRead } = useAgentReads();
  const isWide = useIsWideViewport();

  // Deep-link (« Ouvrir l'agent » depuis ailleurs) : ?issue=<issueId> présélectionne
  // la session de cette issue ; ?run=<runId> celle d'un run précis (une relecture
  // de PR, MIN-168 — sa clé de session EST son run) ; ?compose=<issueId> l'ouvre
  // en brouillon de lancement ; ?compose=note ouvre le brouillon carnet.
  const searchParams = useSearchParams();
  const issueParam = searchParams.get("issue");
  const runParam = searchParams.get("run");
  const composeParam = searchParams.get("compose");

  const draft = useAgentComposeDraft();
  // Le brouillon n'est honoré que si l'URL le signale ENCORE : une navigation vers
  // /agents sans `?compose=` (retour plus tard) l'ignore, même s'il traîne en mémoire.
  const draftHonored =
    !!draft &&
    (draft.kind === "issue"
      ? composeParam === draft.issueId
      : composeParam === NOTE_COMPOSE_PARAM);

  const [selectedKey, setSelectedKey] = useState<string | null>(
    composeParam ?? issueParam ?? runParam,
  );
  const [mobileDetail, setMobileDetail] = useState(
    !!composeParam || !!issueParam || !!runParam,
  );
  // Issue liée ouverte dans le panneau latéral (par-dessus la page, pas de navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Id de la run tout juste lancée depuis le brouillon : on garde le volet monté
  // (même clé → aucun remount, transition compose → live fluide) jusqu'à ce que la
  // liste des sessions rattrape cette run précise.
  const [launchedRunId, setLaunchedRunId] = useState<string | null>(null);

  // Clé de sélection du brouillon : l'issue visée (kind "issue") ou le marqueur
  // `note` (kind "note" — aucune run, donc aucune clé de session réelle).
  const draftKey = draft
    ? draft.kind === "issue"
      ? draft.issueId
      : NOTE_COMPOSE_PARAM
    : null;

  // Entrée synthétique du brouillon ISSUE, façonnée comme une vraie session pour
  // traverser le même volet de détail (`AgentSessionDetail`). Aucune run réelle :
  // `runId` est un marqueur, le volet s'ouvre en compose et la conversation gère le
  // passage live. (Le brouillon CARNET a son propre volet, `NoteCompose`.)
  const draftItem: AgentSessionListItem | null =
    draft?.kind === "issue"
      ? {
          runId: `draft:${draft.issueId}`,
          status: "queued",
          model: null,
          triggered_by: "button",
          noteTitle: null,
          pullRequest: null,
          pr_number: null,
          pr_url: null,
          pr_state: null,
          created_at: "",
          updated_at: "",
          issue: { id: draft.issueId, number: draft.issueNumber, title: draft.issueTitle },
          // `icon_url` null : le brouillon ne paraît pas dans la liste (aucune orbe
          // à peindre), seuls son id et sa clé servent — au contexte de Numo et à
          // l'identifiant du ticket.
          project: {
            id: draft.projectId,
            key: draft.projectKey,
            name: draft.projectKey,
            icon_url: null,
          },
          working: false,
          runCount: 0,
          lastCompletedAt: null,
          awaitingInput: false,
        }
      : null;

  const realForDraft = draft
    ? draft.kind === "issue"
      ? sessions.find((s) => s.issue?.id === draft.issueId) ?? null
      : sessions.find((s) => launchedRunId != null && s.runId === launchedRunId) ?? null
    : null;
  // La liste a-t-elle rattrapé la run qu'on vient de lancer ? (Session d'issue : le
  // représentant devient cette run ; session carnet : sa propre entrée apparaît.)
  const draftSettled =
    !!launchedRunId &&
    (draft?.kind === "note"
      ? realForDraft != null
      : realForDraft?.runId === launchedRunId);

  // Le volet actif est-il le brouillon (compose) ? Vrai de la pose du brouillon
  // jusqu'à ce que la run lancée soit rattrapée par la liste (`draftSettled`).
  const composeSelected =
    draftHonored && !!draftKey && selectedKey === draftKey && !draftSettled;
  // Carte synthétique en tête de liste : uniquement tant qu'aucune vraie session
  // n'existe pour le brouillon (sinon sa vraie carte tient déjà la place).
  const showDraftEntry = composeSelected && !realForDraft;

  // Suit les changements de params (navigation client vers une autre entrée).
  useEffect(() => {
    if (!composeParam) return;
    setSelectedKey(composeParam);
    setMobileDetail(true);
  }, [composeParam]);
  useEffect(() => {
    if (!issueParam) return;
    setSelectedKey(issueParam);
    setMobileDetail(true);
  }, [issueParam]);
  useEffect(() => {
    if (!runParam) return;
    setSelectedKey(runParam);
    setMobileDetail(true);
  }, [runParam]);

  // Transition terminée : la run lancée figure dans la liste → on efface le
  // brouillon et on sélectionne sa session (issue pour un brouillon issue, le run
  // pour un brouillon carnet). On nettoie aussi `?compose=` de l'URL.
  useEffect(() => {
    if (!draftSettled || !draft) return;
    setSelectedKey(draft.kind === "issue" ? draft.issueId : launchedRunId);
    setLaunchedRunId(null);
    setAgentComposeDraft(null);
    router.replace("/agents");
  }, [draftSettled]); // eslint-disable-line react-hooks/exhaustive-deps

  const realSelected = sessions.find((s) => sessionKey(s) === selectedKey) ?? null;
  // Élément affiché à droite : le brouillon en compose, sinon la vraie session.
  const activeItem = composeSelected ? draftItem : realSelected;
  // Brouillon carnet affiché (volet NoteCompose, sans entrée AgentSessionDetail).
  const noteComposeActive = composeSelected && draft?.kind === "note";

  // La conversation AFFICHÉE n'a jamais de bulle : on la marque lue à son ouverture ET
  // à chaque nouvelle fin de run tant qu'elle reste visible (dépendance sur
  // `lastCompletedAt`). « Visible » = desktop (le volet est toujours rendu) ou, sur
  // mobile, le volet détail ouvert ; sinon (liste mobile ou compose) on ne marque pas,
  // pour ne pas effacer la bulle d'une session qu'on ne regarde pas. Les sessions
  // CARNET n'ont pas de suivi lu/non-lu (personnelles, pas d'issue à ancrer).
  const shownReal = !composeSelected && (isWide || mobileDetail) ? realSelected : null;
  useEffect(() => {
    const id = shownReal?.issue?.id;
    if (id) markRead(id);
  }, [shownReal?.issue?.id, shownReal?.lastCompletedAt, markRead]);

  // Publie l'issue active à Numo : il résout « cette issue » (et sa PR le cas
  // échéant), la lit et peut agir dessus — brouillon compris (issue sans PR).
  useAssistantContext(
    activeItem && activeItem.project && activeItem.issue
      ? {
          projectId: activeItem.project.id,
          issueId: activeItem.issue.id,
          issueIdentifier: issueIdentifier(activeItem.project.key, activeItem.issue.number),
          issueTitle: activeItem.issue.title,
          ...(activeItem.pr_number != null
            ? {
                prNumber: activeItem.pr_number,
                prState: activeItem.pr_state ?? undefined,
                prRunId: activeItem.runId,
              }
            : {}),
        }
      : null,
  );

  // Garde une sélection valide : défaut = 1re session, avance quand la sélection
  // disparaît. On ne remet PAS à null sur liste vide (chargement / présélection
  // deep-link), NI pendant un compose (le brouillon n'a pas de session : il ne faut
  // pas sauter sur sessions[0]).
  useEffect(() => {
    if (composeSelected) return;
    if (sessions.length === 0) return;
    if (!selectedKey || !sessions.some((s) => sessionKey(s) === selectedKey)) {
      setSelectedKey(sessions[0] ? sessionKey(sessions[0]) : null);
    }
  }, [sessions, selectedKey, composeSelected]);

  // Sélectionne une VRAIE session : abandonne le brouillon en cours (jamais envoyé →
  // effacé, comme quitter la page). Purement UI, aucune run n'a existé.
  const selectReal = (key: string | null) => {
    if (draft) setAgentComposeDraft(null);
    setLaunchedRunId(null);
    setSelectedKey(key);
    setMobileDetail(true);
  };

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  const listCount = sessions.length + (showDraftEntry ? 1 : 0);

  /* Aucune session, jamais : les deux colonnes n'ont rien à montrer, et le seul
     geste possible devient l'écran. Sans projet, ce geste n'est pas « lancer
     l'agent » — il n'y a aucun ticket à lui confier, et le sélecteur ouvrirait
     sur du vide : c'est un projet qu'il faut d'abord. Des projets sans ticket,
     en revanche, gardent le sélecteur : il dit lui-même qu'il n'a rien trouvé.
     Le bouton est le MÊME que celui de la liste, pas un second chemin. */
  if (!loading && sessions.length === 0 && !showDraftEntry) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {projects.length === 0 ? (
            <EmptyScene icon={Bot} title={t("emptyNoProject")}>
              <Button onClick={openCreateProject}>
                <Plus />
                {tProjects("firstProject")}
              </Button>
            </EmptyScene>
          ) : (
            <EmptyScene icon={Bot} title={t("emptyTitle")}>
              <LaunchAgentPicker sessions={sessions} />
            </EmptyScene>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Gauche : liste des sessions ─────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 w-full shrink-0 flex-col overflow-y-auto border-border md:flex md:w-80 md:border-r",
          mobileDetail ? "hidden" : "flex",
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-5 pb-2">
          <h1 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h1>
          <span className="text-sm tabular-nums text-muted-foreground">{listCount}</span>
          <div className="ml-auto">
            <LaunchAgentPicker sessions={sessions} />
          </div>
        </div>

        {loading && !showDraftEntry ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col px-2 pb-4">
            {/* Entrée synthétique du brouillon — un anneau discret la distingue des
                vraies sessions ; elle disparaît si le 1er message n'est pas envoyé. */}
            {showDraftEntry && draft ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedKey(draftKey);
                  setMobileDetail(true);
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none ring-1 ring-inset ring-primary/30 transition-colors",
                  selectedKey === draftKey
                    ? "bg-muted"
                    : "hover:bg-muted/60 focus-visible:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  {draft.kind === "issue" ? (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {issueIdentifier(draft.projectKey, draft.issueNumber)}
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      <NotebookPen className="size-3.5" />
                      {t("noteBadge")}
                    </span>
                  )}
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <NumoIcon className="size-3" animated={false} />
                    {t("draftBadge")}
                  </span>
                </div>
                <span className="line-clamp-2 text-sm font-medium">
                  {draft.kind === "issue"
                    ? draft.issueTitle
                    : draft.prompt.trim() || t("noteSessionTitle")}
                </span>
              </button>
            ) : null}

            {sessions.map((s) => {
              const key = sessionKey(s);
              const unread = isAgentSessionUnread(s, reads);
              // Question posée, réponse attendue → le non-lu passe au JAUNE.
              const awaiting = unread && s.awaitingInput;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectReal(key)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                    key === selectedKey
                      ? "bg-muted"
                      : "hover:bg-muted/60 focus-visible:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {/* Agent terminé, non consulté → bulle bleue (comme un non-lu) ;
                        JAUNE quand la session attend une réponse de l'utilisateur. */}
                    {unread && (
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          awaiting ? "bg-yellow-500" : "bg-blue-500",
                        )}
                        aria-label={awaiting ? t("awaitingAnswer") : t("unread")}
                      />
                    )}
                    <SessionAnchorBadge session={s} />
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <AgentStatusBadge
                        status={s.status}
                        working={s.working}
                        prNumber={s.pr_number}
                        prState={s.pr_state}
                        className="h-5 px-2 text-[10px]"
                      />
                      <span className="text-xs text-muted-foreground">{fmtDay(s.updated_at)}</span>
                    </span>
                  </div>
                  <span className="line-clamp-2 text-sm font-medium">
                    {s.issue?.title ?? s.noteTitle ?? t("noteSessionTitle")}
                  </span>
                  {s.project ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <ProjectOrb
                        seed={s.project.id}
                        iconUrl={s.project.icon_url}
                        className="size-3.5 shrink-0"
                      />
                      <span className="truncate">{s.project.name}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Droite : conversation de la session (ou brouillon en compose) ─── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {noteComposeActive && draft?.kind === "note" ? (
          <NoteCompose
            // Le pré-remplissage du composer est one-shot (montage) : une NOUVELLE
            // note lancée depuis le carnet doit remonter un composer neuf.
            key={draft.prompt}
            initialText={draft.prompt}
            onLaunched={(run: AgentRunSummary) => setLaunchedRunId(run.id)}
          />
        ) : activeItem ? (
          <AgentSessionDetail
            key={activeItem.issue?.id ?? activeItem.runId}
            item={activeItem}
            compose={composeSelected}
            composeInitialText={
              composeSelected && draft?.kind === "issue" ? draft.prompt : undefined
            }
            // Cadrage (« Générer un plan » / « Vérifier le plan ») et contrôle
            // (« Vérifier l'implémentation ») : le ticket ne démarre pas au
            // lancement, il garde son statut. Le brouillon porte l'intention du
            // bouton d'origine, pas ce que le composer contient à l'envoi.
            composeIntent={
              composeSelected && draft?.kind === "issue"
                ? draft.intent ?? "implement"
                : undefined
            }
            onLaunched={(run: AgentRunSummary) => setLaunchedRunId(run.id)}
            onBack={() => setMobileDetail(false)}
            onOpenIssue={(issueId, projectId) => setPanel({ projectId, issueId })}
            showUnread
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {/* Panneau latéral de l'issue liée — overlay par-dessus la page (pas de nav). */}
      {panel ? (
        <PrIssuePanel
          key={`${panel.projectId}:${panel.issueId}`}
          projectId={panel.projectId}
          issueId={panel.issueId}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}
