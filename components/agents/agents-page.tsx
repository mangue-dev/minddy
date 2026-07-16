"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Skeleton, cn } from "mangue-ui";
import { AgentSessionDetail } from "@/components/agents/agent-session-detail";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { PrIssuePanel } from "@/components/pull-requests/pr-issue-panel";
import { ProjectOrb } from "@/components/project-orb";
import { NumoIcon } from "@/components/numo-icon";
import { useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  setAgentComposeDraft,
  useAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import type { AgentRunSummary, AgentSessionListItem } from "@/lib/agent-api";

/**
 * Page Agents — vue liste/détail façon Pull Requests : à gauche TOUTES les sessions
 * de l'agent Numo (tous projets accessibles, sans filtre), à droite la conversation
 * inline (`AgentSessionDetail` → `AgentConversation`, le même cœur que la modal). Une
 * SESSION = une issue ; le titre affiché est dérivé du titre de l'issue liée.
 * Alimentée par /api/agent-runs (dédoublonné par issue). La session sélectionnée est
 * publiée dans le contexte de Numo (il peut la lire / agir sur l'issue).
 *
 * Point d'entrée « Lancer un agent » (MIN-46) : le bouton du panneau d'issue pose un
 * BROUILLON (`useAgentComposeDraft`) et navigue ici avec `?compose=<issueId>`. On en
 * dérive une entrée synthétique en tête de liste, sélectionnée et ouverte en compose.
 * Purement optimiste : si l'utilisateur n'envoie pas le 1er message (il quitte ou
 * choisit une autre session), l'entrée disparaît sans qu'aucune run n'ait existé ;
 * dès qu'il l'envoie, la run réelle prend le relais dans le même volet.
 */
export function AgentsPage() {
  const t = useTranslations("Agents");
  const format = useFormatter();
  const router = useRouter();
  const { sessions, loading } = useAgentSessionsQuery();

  // Deep-link (« Ouvrir l'agent » depuis ailleurs) : ?issue=<issueId> présélectionne
  // la session de cette issue ; ?compose=<issueId> l'ouvre en brouillon de lancement.
  const searchParams = useSearchParams();
  const issueParam = searchParams.get("issue");
  const composeParam = searchParams.get("compose");

  const draft = useAgentComposeDraft();
  // Le brouillon n'est honoré que si l'URL le signale ENCORE : une navigation vers
  // /agents sans `?compose=` (retour plus tard) l'ignore, même s'il traîne en mémoire.
  const draftHonored = !!draft && composeParam === draft.issueId;

  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(
    composeParam ?? issueParam,
  );
  const [mobileDetail, setMobileDetail] = useState(!!composeParam || !!issueParam);
  // Issue liée ouverte dans le panneau latéral (par-dessus la page, pas de navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Id de la run tout juste lancée depuis le brouillon : on garde le volet monté
  // (même clé d'issue → aucun remount, transition compose → live fluide) jusqu'à ce
  // que la liste des sessions rattrape cette run précise.
  const [launchedRunId, setLaunchedRunId] = useState<string | null>(null);

  // Entrée synthétique du brouillon, façonnée comme une vraie session pour traverser
  // le même volet de détail (`AgentSessionDetail`). Aucune run réelle : `runId` est
  // un marqueur, le volet s'ouvre en compose et la conversation gère le passage live.
  const draftItem: AgentSessionListItem | null = draft
    ? {
        runId: `draft:${draft.issueId}`,
        status: "queued",
        model: null,
        triggered_by: "button",
        pr_number: null,
        pr_url: null,
        pr_state: null,
        created_at: "",
        updated_at: "",
        issue: { id: draft.issueId, number: draft.issueNumber, title: draft.issueTitle },
        project: { id: draft.projectId, key: draft.projectKey, name: draft.projectKey },
        working: false,
        runCount: 0,
      }
    : null;

  const realForDraft = draft
    ? sessions.find((s) => s.issue?.id === draft.issueId) ?? null
    : null;
  // La liste a-t-elle rattrapé la run qu'on vient de lancer ? (représentant = la run
  // la plus récente de l'issue → devient celle-ci une fois le refetch arrivé.)
  const draftSettled = !!launchedRunId && realForDraft?.runId === launchedRunId;

  // Le volet actif est-il le brouillon (compose) ? Vrai de la pose du brouillon
  // jusqu'à ce que la run lancée soit rattrapée par la liste (`draftSettled`).
  const composeSelected =
    draftHonored && !!draft && selectedIssueId === draft.issueId && !draftSettled;
  // Carte synthétique en tête de liste : uniquement tant qu'aucune vraie session
  // n'existe pour l'issue (sinon sa vraie carte tient déjà la place, en surbrillance).
  const showDraftEntry = composeSelected && !realForDraft;

  // Suit les changements de params (navigation client vers une autre entrée).
  useEffect(() => {
    if (!composeParam) return;
    setSelectedIssueId(composeParam);
    setMobileDetail(true);
  }, [composeParam]);
  useEffect(() => {
    if (!issueParam) return;
    setSelectedIssueId(issueParam);
    setMobileDetail(true);
  }, [issueParam]);

  // Transition terminée : la run lancée figure dans la liste → on efface le brouillon
  // et on reste sur la même issue (le volet est conservé, swap synthétique → réel
  // sans coupure). On nettoie aussi `?compose=` de l'URL.
  useEffect(() => {
    if (!draftSettled || !draft) return;
    setSelectedIssueId(draft.issueId);
    setLaunchedRunId(null);
    setAgentComposeDraft(null);
    router.replace("/agents");
  }, [draftSettled]); // eslint-disable-line react-hooks/exhaustive-deps

  const realSelected = sessions.find((s) => s.issue?.id === selectedIssueId) ?? null;
  // Élément affiché à droite : le brouillon en compose, sinon la vraie session.
  const activeItem = composeSelected ? draftItem : realSelected;

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
  // deep-link), NI pendant un compose (l'issue du brouillon n'a pas de session : il
  // ne faut pas sauter sur sessions[0]).
  useEffect(() => {
    if (composeSelected) return;
    if (sessions.length === 0) return;
    if (!selectedIssueId || !sessions.some((s) => s.issue?.id === selectedIssueId)) {
      setSelectedIssueId(sessions[0].issue?.id ?? null);
    }
  }, [sessions, selectedIssueId, composeSelected]);

  // Sélectionne une VRAIE session : abandonne le brouillon en cours (jamais envoyé →
  // effacé, comme quitter la page). Purement UI, aucune run n'a existé.
  const selectReal = (issueId: string | null) => {
    if (draft) setAgentComposeDraft(null);
    setLaunchedRunId(null);
    setSelectedIssueId(issueId);
    setMobileDetail(true);
  };

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  const listCount = sessions.length + (showDraftEntry ? 1 : 0);

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
        </div>

        {loading && !showDraftEntry ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 && !showDraftEntry ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <NumoIcon className="size-6" animated={false} />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{t("emptyState")}</p>
          </div>
        ) : (
          <div className="flex flex-col px-2 pb-4">
            {/* Entrée synthétique du brouillon — un anneau discret la distingue des
                vraies sessions ; elle disparaît si le 1er message n'est pas envoyé. */}
            {showDraftEntry && draft ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedIssueId(draft.issueId);
                  setMobileDetail(true);
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none ring-1 ring-inset ring-primary/30 transition-colors",
                  selectedIssueId === draft.issueId
                    ? "bg-muted"
                    : "hover:bg-muted/60 focus-visible:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {issueIdentifier(draft.projectKey, draft.issueNumber)}
                  </span>
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <NumoIcon className="size-3" animated={false} />
                    {t("draftBadge")}
                  </span>
                </div>
                <span className="line-clamp-2 text-sm font-medium">{draft.issueTitle}</span>
              </button>
            ) : null}

            {sessions.map((s) => {
              const identifier =
                s.issue && s.project
                  ? issueIdentifier(s.project.key, s.issue.number)
                  : "—";
              return (
                <button
                  key={s.issue?.id ?? s.runId}
                  type="button"
                  onClick={() => selectReal(s.issue?.id ?? null)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                    s.issue?.id === selectedIssueId
                      ? "bg-muted"
                      : "hover:bg-muted/60 focus-visible:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {identifier}
                    </span>
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
                    {s.issue?.title ?? identifier}
                  </span>
                  {s.project ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <ProjectOrb seed={s.project.id} className="size-3.5 shrink-0" />
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
        {activeItem ? (
          <AgentSessionDetail
            key={activeItem.issue?.id ?? activeItem.runId}
            item={activeItem}
            compose={composeSelected}
            composeInitialText={composeSelected ? draft?.prompt : undefined}
            onLaunched={(run: AgentRunSummary) => setLaunchedRunId(run.id)}
            onBack={() => setMobileDetail(false)}
            onOpenIssue={(issueId, projectId) => setPanel({ projectId, issueId })}
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
