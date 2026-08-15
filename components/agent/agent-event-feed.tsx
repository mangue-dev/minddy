"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import {
  AlertTriangle,
  ArrowDown,
  Brain,
  CircleSlash,
  Cloud,
  CloudOff,
  GitCommit,
} from "lucide-react";
import { ChatMessage } from "@/components/assistant/chat-message";
import { WorkAccordion } from "@/components/assistant/work-accordion";
import { NumoIcon } from "@/components/numo-icon";
import { ChangedFilesBlock } from "./changed-files-block";
import { ReasoningBlock } from "./reasoning-block";
import { SubagentBlock } from "./subagent-block";
import { QuotaExhaustedCard } from "./quota-exhausted-card";
import { coerceBillingPlanId, type BillingPlanId } from "@/lib/billing-plans";
import type { MessageKey } from "@/lib/i18n-keys";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { unechoedMessages } from "@/lib/agent-pending";
import { buildBlocks, type TurnCloser } from "@/lib/agent-feed-blocks";
import { useAgentRunEventsQuery } from "@/lib/use-agent-runs";
import { useAgentRunLive } from "@/lib/use-agent-run-live";
import {
  isAgentRunWorking,
  parseFilesChangedPayload,
  type AgentFileChange,
  type AgentRunEvent,
  type AgentRunStatus,
} from "@/lib/agent-api";
import { mergeLiveFileStats, type LiveDiffStat } from "@/lib/agent-changed-files";
import type { AssistantMessage, AssistantToolCall, AssistantMention } from "@/lib/assistant-types";
import type { AttachmentInput } from "@/lib/types";

/**
 * Flux d'activité d'un run d'agent (MIN-46), rendu en PARITÉ EXACTE avec le chat
 * Numo : on reconstruit les events (`thinking`/`summary`/`tool_call`/`tool_result`)
 * au format `AssistantMessage[]` puis on les rend avec le MÊME `<ChatMessage>`.
 *
 * À la Codex : dès qu'un TOUR se termine (l'agent émet sa réponse finale, event
 * `summary`), tout son déroulé (réflexions, tool-calls, updates de plan) se replie
 * dans un accordéon « A travaillé pendant X min Y s » — seule la réponse reste
 * visible en dessous. Les messages de l'utilisateur séparent les tours et restent
 * visibles ; le tour EN COURS reste déplié.
 */

type ToolResult = { status: "running" | "complete"; result?: unknown; success?: boolean };

export type MessageItem = {
  kind: "message";
  message: AssistantMessage;
  /** created_at de l'event qui a ouvert ce message (début de tour). */
  createdAt: string;
  /** Ce message est le résumé final d'un tour (clôt le tour, sort de l'accordéon). */
  isSummary?: boolean;
  /** Pour un summary : created_at de l'event `summary` (fin de tour → durée). */
  endedAt?: string;
  /** Texte EN COURS d'écriture qui pourrait être la réponse du tour (aucun outil
      appelé dans ce round) : rendu SOUS l'accordéon, là où le message final
      restera — sinon il sauterait du déroulé au dehors une fois l'event posé. */
  isLiveAnswer?: boolean;
  /** Réponse de l'utilisateur aux questions ask_user de ce message (le
      user_message qui suit, absorbé — pas de bulle, détails de la ligne). */
  askUserAnswer?: string;
};

export type FeedItem =
  | MessageItem
  | {
      kind: "note";
      id: string;
      variant:
        | "commit"
        | "error"
        | "reasoningUnsupported"
        | "providerRetry"
        | "localDeclined"
        | "currentRepoOverlap";
      /** Motif NOMMÉ d'une erreur du harness (`turnTooLong`…), traduit à l'affichage.
       *  Absent sur une erreur de modèle, qui n'a que son texte. Porte aussi le
       *  motif d'un run gardé dans le cloud (`byok`, `no_mint` — MIN-357). */
      code?: string;
      /** Combien de fichiers la note compte (MIN-358 : ceux que le commit a
       *  emportés à l'utilisateur). Le message se décline au pluriel. */
      count?: number;
      text: string;
      createdAt: string;
    }
  /** Budget d'usage épuisé en cours de run : carte de CLÔTURE du tour (le travail
   *  est poussé, la session reprendra quand le budget revient). */
  | {
      kind: "quota";
      id: string;
      // `spent`/`cap` du payload ne sont PAS repris : l'usage se dit en pourcentage
      // à l'utilisateur, jamais en dollars (ils restent dans l'event, pour la trace).
      resetsAt: string | null;
      nextPlanId: BillingPlanId | null;
      byok: boolean;
      /** `run_cap` = c'est le plafond de CE passage qui a mordu, pas le compte. */
      cause: "account" | "run_cap";
      /** Ce plafond, en % du budget mensuel — null quand la cause est le compte. */
      capPercent: number | null;
      createdAt: string;
    }
  /** Phase de réflexion du modèle (MIN-122) : ligne compacte + compteur, jamais
   *  le texte en direct. `active` tant que le round n'a pas rendu la main. */
  | {
      kind: "reasoning";
      id: string;
      active: boolean;
      durationMs: number;
      text: string;
      createdAt: string;
    }
  | {
      kind: "files";
      id: string;
      files: AgentFileChange[];
      truncated: boolean;
      createdAt: string;
      /** Liste PROVISOIRE du tour en cours (direct), pas la liste de git. */
      live?: boolean;
    }
  /**
   * UN sous-agent (MIN-112), replié. Tous les events qui portent son `subagent_id`
   * sont AGRÉGÉS ici plutôt que rendus un par un : une fille produit autant d'events
   * qu'un tour entier, et les laisser dans le flux rendrait illisible le tour qui a
   * délégué — c'est le risque principal identifié en R9.
   */
  | {
      kind: "subagent";
      id: string;
      /** Id lisible du sous-agent (`sub-1`), tel que le parent le manipule. */
      subagentId: string;
      mode: "explore" | "implement" | null;
      /** Tool-calls de la fille : le seul compteur d'avancement que le fil voit. */
      steps: number;
      /** Rapport final (event `summary` de la fille). */
      report: string;
      /** Message d'erreur si sa boucle a échoué. */
      error: string;
      /** Son rapport a été livré au parent (event `status` du parent). */
      delivered: boolean;
      /** Livré PARTIEL : la fille a été coupée avant d'avoir conclu. */
      partial: boolean;
      createdAt: string;
      /** Instant où la fille a rendu la main (résumé, erreur, ou livraison du
       *  rapport par le parent), ou null tant qu'elle tourne : c'est ce qui FIGE
       *  son chrono. Sans ça, une session relue trois jours plus tard afficherait
       *  un sous-agent « lancé depuis 72 heures ». */
      endedAt: string | null;
    };

function makeMessage(
  id: string,
  content: string | null,
  role: "assistant" | "user" = "assistant",
  mentions?: AssistantMention[],
  attachments?: AttachmentInput[],
): AssistantMessage {
  return {
    id,
    conversation_id: "",
    role,
    content,
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {
      ...(mentions?.length ? { mentions } : {}),
      ...(attachments?.length ? { attachments } : {}),
    },
    created_at: "",
  };
}

const ATTACHMENT_METADATA_RE = /<!-- minddy-attachments:([^\s]+) -->\s*/;
const ATTACHMENT_BLOCK_RE = /<attachments>\n[\s\S]*?\n<\/attachments>/;
const LEGACY_ATTACHMENT_LINE_RE =
  /^- (.+?) \((.+?), (\d+) bytes\): (https?:\/\/\S+)$/gm;

/** Recover the storage key embedded in Supabase's legacy signed URL format. */
function storagePathFromSignedUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const prefix = "/storage/v1/object/sign/attachments/";
    if (!url.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

/**
 * Agent prompts carry signed URLs so the runtime can download chat uploads.
 * Those URLs are operational context, not prose the sender wrote: recover the
 * upload descriptors for the same resource pills as the assistant, then remove
 * the entire internal block from the user-facing bubble.
 */
function displayUserMessage(content: string): {
  content: string;
  attachments: AttachmentInput[];
} {
  const marker = content.match(ATTACHMENT_METADATA_RE);
  let attachments: AttachmentInput[] = [];
  if (marker?.[1]) {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(marker[1]));
      if (Array.isArray(parsed)) {
        attachments = parsed
          .filter(
            (item): item is AttachmentInput =>
              !!item &&
              typeof item === "object" &&
              typeof item.storage_path === "string" &&
              typeof item.file_name === "string" &&
              typeof item.mime_type === "string" &&
              typeof item.size_bytes === "number",
          )
          .slice(0, 5);
      }
    } catch {
      // A malformed marker is only presentation metadata. The prompt remains
      // usable by the agent; it simply falls back to no resource pills.
    }
  }
  // The first version of agent attachments wrote only the readable instruction
  // and its signed URLs. Rebuild enough metadata from that stable format to
  // render existing conversations as pills too; the regular authenticated file
  // route then mints a fresh URL, even if the old signed one has expired.
  if (attachments.length === 0) {
    const reconstructed: AttachmentInput[] = [];
    for (const match of content.matchAll(LEGACY_ATTACHMENT_LINE_RE)) {
      const storage_path = storagePathFromSignedUrl(match[4]);
      if (!storage_path) continue;
      reconstructed.push({
        storage_path,
        file_name: match[1],
        mime_type: match[2],
        size_bytes: Number(match[3]),
      });
      if (reconstructed.length === 5) break;
    }
    attachments = reconstructed;
  }
  return {
    content: content
      .replace(ATTACHMENT_METADATA_RE, "")
      .replace(ATTACHMENT_BLOCK_RE, "")
      .trim(),
    attachments,
  };
}

/** Args du tool_call reconstruits en chaîne JSON (ce qu'attend ToolCallList). */
function toolArguments(payload: Record<string, unknown>): string {
  // Ancien format d'event (runs existants) : arguments COMPLETS sérialisés sous la
  // clé `args`. On la renvoie telle quelle → `args.command` / `args.pattern` sont
  // à nouveau lisibles (rétro-compatible avec les runs déjà enregistrés).
  if (typeof payload.args === "string") return payload.args;
  // Format actuel : résumé d'args à plat (command, pattern, path…).
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "id" || k === "name") continue;
    rest[k] = v;
  }
  return JSON.stringify(rest);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Regroupe le flux plat d'events en messages assistant (un `thinking`/`summary`
 * ouvre une bulle ; les `tool_call` suivants s'y rattachent, comme un tour Numo)
 * + une Map des résultats de tools (running/complete/succès). Chaque item porte le
 * `created_at` de son event ; le message `summary` est marqué `isSummary`.
 */
function buildFeed(
  events: AgentRunEvent[],
  initialPrompt?: string | null,
  initialPromptMentions?: AssistantMention[] | null,
): {
  items: FeedItem[];
  results: Map<string, ToolResult>;
  userTexts: string[];
  sandboxReady: boolean;
} {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const items: FeedItem[] = [];
  const results = new Map<string, ToolResult>();
  // Où en est la MACHINE du chunk en cours ? Chaque chunk ouvre par un
  // `status: running` puis, une fois la microVM réveillée et le dépôt là, un
  // `phase: sandbox_ready`. Le second après le premier ⇒ la sandbox est ouverte.
  // (Comparés par `seq` : un run enchaîne les chunks, seul le dernier compte.)
  let runningSeq = -1;
  let sandboxSeq = -1;
  // TOUS les textes user reçus (bulles ET réponses absorbées par une question) —
  // sert au dédoublonnage des bulles optimistes, qui ne peut plus se lire depuis
  // les items seuls.
  const userTexts: string[] = [];
  let current: MessageItem | null = null;
  // Dernière question ask_user en attente : le prochain user_message est sa
  // réponse (absorbée dans la ligne, pas de bulle).
  let lastQuestion: MessageItem | null = null;

  // Bulle « originelle » : le prompt de lancement n'est PAS dans le flux d'events
  // (il alimente le message de tâche du LLM). On l'affiche en tête comme 1re bulle
  // utilisateur, à parité avec le chat Numo. Les messages de STEERING, eux, sont déjà
  // émis en events `user_message` et rendus par la boucle ci-dessous.
  const prompt = (initialPrompt ?? "").trim();
  if (prompt) {
    const displayed = displayUserMessage(prompt);
    userTexts.push(prompt);
    items.push({
      kind: "message",
       message: makeMessage(
         "initial-prompt",
         displayed.content,
         "user",
         initialPromptMentions ?? undefined,
         displayed.attachments,
       ),
      createdAt: "",
    });
  }

  const openMessage = (item: MessageItem) => {
    items.push(item);
    current = item;
  };

  // Sous-agents rencontrés (MIN-112) : un bloc replié par fille, créé à son PREMIER
  // event — donc juste après la ligne `spawn_agent` qui l'a lancée, puisque celle-ci
  // précède forcément. Les events suivants de la même fille viennent s'y agréger.
  const subagentBlocks = new Map<string, Extract<FeedItem, { kind: "subagent" }>>();
  const subagentBlock = (
    subagentId: string,
    e: AgentRunEvent,
    p: Record<string, unknown>,
  ): Extract<FeedItem, { kind: "subagent" }> => {
    const existing = subagentBlocks.get(subagentId);
    if (existing) return existing;
    const mode: "explore" | "implement" | null =
      p.subagent_mode === "implement" ? "implement" : p.subagent_mode === "explore" ? "explore" : null;
    const block = {
      kind: "subagent" as const,
      id: `subagent-${subagentId}`,
      subagentId,
      mode,
      steps: 0,
      report: "",
      error: "",
      delivered: false,
      partial: false,
      createdAt: e.created_at,
      endedAt: null,
    };
    subagentBlocks.set(subagentId, block);
    items.push(block);
    return block;
  };

  for (const e of ordered) {
    const p = e.payload ?? {};
    // Event d'un SOUS-AGENT : il ne traverse pas le flux du parent. Sans ce détour,
    // chaque `thinking` de la fille ouvrirait une bulle et chaque `tool_call` se
    // rattacherait au message du parent, mélangeant deux sessions dans une seule
    // ligne de lecture.
    if (typeof p.subagent_id === "string" && p.subagent_id) {
      const block = subagentBlock(p.subagent_id, e, p);
      if (e.type === "tool_call") block.steps++;
      else if (e.type === "summary") {
        block.report = str(p.text);
        block.endedAt = e.created_at;
      } else if (e.type === "error") {
        block.error = str(p.message) || str(p.text);
        block.endedAt = e.created_at;
      }
      continue;
    }
    // Le parent annonce qu'un rapport lui a été remis : c'est ce qui distingue une
    // fille COUPÉE (livrée sans rapport) d'une fille encore au travail.
    if (e.type === "status" && p.phase === "subagent_report" && typeof p.id === "string") {
      const block = subagentBlocks.get(p.id);
      if (block) {
        block.delivered = true;
        block.partial = p.partial === true;
        // Filet du chrono : une fille COUPÉE n'émet ni résumé ni erreur, donc c'est
        // cette livraison-là qui est son seul instant de fin.
        block.endedAt ??= e.created_at;
      }
      continue;
    }
    // La fenêtre « le prochain user_message répond à la question » ne survit
    // qu'aux events neutres — tout event de contenu (nouveau tour) la referme.
    if (!["user_message", "question", "tool_result", "status"].includes(e.type)) {
      lastQuestion = null;
    }
    switch (e.type) {
      case "thinking": {
        const text = str(p.text);
        // Deux `thinking` distincts sous le même type d'event : la RÉFLEXION du
        // modèle (marquée `kind`, rendue en ligne compacte repliée) et sa
        // NARRATION (du texte, rendue en bulle). Sans le marqueur, le comportement
        // d'avant MIN-122 est inchangé.
        if (p.kind === "reasoning") {
          // La réflexion FERME la bulle en cours sans en ouvrir une (une ligne de
          // réflexion n'accueille pas de tool-call) : les actions du round qui suit
          // s'attachent donc à une bulle NEUVE, rendue SOUS cette ligne.
          //
          // Sans ça, tous les tool-calls d'un tour s'empilaient dans le groupe
          // d'actions du premier round — celui ouvert avant la première réflexion —
          // pendant que les lignes de réflexion se rangeaient à la queue. Le fil
          // racontait alors un agent qui agit d'un trait puis réfléchit trois fois,
          // soit l'inverse de ce qui s'est passé : il réfléchit ENTRE ses actions.
          current = null;
          items.push({
            kind: "reasoning",
            id: e.id,
            active: false,
            durationMs: typeof p.durationMs === "number" ? p.durationMs : 0,
            text,
            createdAt: e.created_at,
          });
          break;
        }
        if (!text.trim()) break;
        openMessage({ kind: "message", message: makeMessage(e.id, text), createdAt: e.created_at });
        break;
      }
      case "summary": {
        const text = str(p.text);
        if (!text.trim()) break;
        // Le round terminal émet souvent thinking PUIS summary avec le même texte :
        // on ne duplique pas, on MARQUE la dernière bulle comme résumé final.
        const last = items[items.length - 1];
        if (last?.kind === "message" && (last.message.content ?? "").trim() === text.trim()) {
          last.isSummary = true;
          last.endedAt = e.created_at;
          current = null;
          break;
        }
        openMessage({
          kind: "message",
          message: makeMessage(e.id, text),
          createdAt: e.created_at,
          isSummary: true,
          endedAt: e.created_at,
        });
        current = null;
        break;
      }
      case "user_message": {
        const text = str(p.text);
        if (!text.trim()) break;
        const displayed = displayUserMessage(text);
        const mentions = Array.isArray(p.mentions)
          ? (p.mentions as AssistantMention[])
          : undefined;
        userTexts.push(text.trim());
        current = null;
        // Réponse à un ask_user : ABSORBÉE par la ligne de la question (détails
        // au clic) — pas de bulle, le flow de lecture reste propre.
        if (lastQuestion) {
          lastQuestion.askUserAnswer = text;
          lastQuestion = null;
          break;
        }
        // Message de steering de l'utilisateur : bulle user, ne rattache pas les
        // tool-calls suivants (ils appartiennent au prochain tour de l'agent).
        items.push({
          kind: "message",
          message: makeMessage(e.id, displayed.content, "user", mentions, displayed.attachments),
          createdAt: e.created_at,
        });
        break;
      }
      case "tool_call": {
        const name = str(p.name);
        const id = str(p.id);
        if (!name || !id) break;
        const tc: AssistantToolCall = {
          id,
          type: "function",
          function: { name, arguments: toolArguments(p) },
        };
        if (!current) {
          openMessage({ kind: "message", message: makeMessage(e.id, null), createdAt: e.created_at });
        }
        current!.message.tool_calls = [...(current!.message.tool_calls ?? []), tc];
        if (!results.has(id)) results.set(id, { status: "running", success: true });
        break;
      }
      case "tool_result": {
        const id = str(p.id);
        if (id) results.set(id, { status: "complete", success: p.success !== false });
        break;
      }
      case "question": {
        // ask_user (MIN-86) : l'agent pose des questions structurées et le tour se
        // termine. Rendu comme un message de CLÔTURE de tour (isSummary → le
        // déroulé se replie) portant un tool_call ask_user complet — le ChatMessage
        // partagé le rend en carte de questions, à parité avec Numo.
        const id = str(p.id) || e.id;
        const questions = Array.isArray(p.questions) ? p.questions : [];
        if (questions.length === 0) break;
        const msg = makeMessage(e.id, null);
        msg.tool_calls = [
          {
            id,
            type: "function",
            function: { name: "ask_user", arguments: JSON.stringify({ questions }) },
          },
        ];
        results.set(id, { status: "complete", success: true });
        const questionItem: MessageItem = {
          kind: "message",
          message: msg,
          createdAt: e.created_at,
          isSummary: true,
          endedAt: e.created_at,
        };
        items.push(questionItem);
        // Le prochain user_message est la réponse à cette question.
        lastQuestion = questionItem;
        current = null;
        break;
      }
      case "pr_opened": {
        // La PR est accessible depuis l'en-tête de la conversation (bouton /
        // lien selon son état) → pas de chip redondant dans le fil.
        current = null;
        break;
      }
      case "commit": {
        current = null;
        items.push({ kind: "note", id: e.id, variant: "commit", text: "", createdAt: e.created_at });
        break;
      }
      case "files_changed": {
        // Émis en fin de tour (après le `summary`) : la liste autoritaire des fichiers
        // que le tour a changés. Rattachée au tour et rendue sous sa réponse (buildBlocks).
        const { files, truncated } = parseFilesChangedPayload(p);
        current = null;
        if (files.length > 0) {
          items.push({ kind: "files", id: e.id, files, truncated, createdAt: e.created_at });
        }
        break;
      }
      case "plan_update": {
        // Rien à rendre ICI : la checklist vit au-dessus du composer
        // ([plan-activity-bar](./plan-activity-bar.tsx)), où elle reste sous les
        // yeux au lieu de remonter avec le fil. Elle ne coupe pas le tour non
        // plus — cocher une étape n'est pas une prise de parole.
        break;
      }
      case "quota_exhausted": {
        // Clôt le tour : plus rien ne s'y rattache, et le déroulé se replie comme
        // sur un `summary`.
        current = null;
        items.push({
          kind: "quota",
          id: e.id,
          resetsAt: typeof p.resetsAt === "string" ? p.resetsAt : null,
          nextPlanId: coerceBillingPlanId(p.nextPlanId),
          byok: p.byok === true,
          // Les events d'avant le plafond par passage n'ont pas de `cause` : ils
          // parlent tous du budget du compte, la seule frontière qui existait.
          cause: p.cause === "run_cap" ? "run_cap" : "account",
          capPercent: typeof p.capPercent === "number" ? p.capPercent : null,
          createdAt: e.created_at,
        });
        break;
      }
      case "status": {
        // Marqueurs de la MACHINE — rien à rendre, ils disent seulement où en est
        // le chunk (cf. `sandboxReady`).
        if (p.phase === "sandbox_ready") sandboxSeq = e.seq;
        else if (p.status === "running") runningSeq = e.seq;
        // Les deux `status` rendus. Le provider a REFUSÉ le niveau de raisonnement
        // demandé (MIN-122) : sans cette ligne, le niveau choisi resterait affiché
        // dans le composer alors qu'il n'a plus aucun effet — silencieusement.
        if (p.phase === "reasoning_unsupported") {
          items.push({
            kind: "note",
            id: e.id,
            variant: "reasoningUnsupported",
            text: "",
            createdAt: e.created_at,
          });
        }
        /**
         * MIN-357 : le run était demandé sur la machine de l'utilisateur, et il
         * est parti dans le cloud. La bascule est la bonne conduite (ce qui
         * manque en local, c'est un PLAFOND, et le cloud en a un) — mais une
         * bascule muette laisserait quelqu'un croire que son agent tourne chez
         * lui, sur son dépôt, alors qu'il tourne dans une microVM.
         */
        if (p.phase === "local_exec_declined") {
          items.push({
            kind: "note",
            id: e.id,
            variant: "localDeclined",
            ...(str(p.reason) ? { code: str(p.reason) } : {}),
            text: "",
            createdAt: e.created_at,
          });
        }
        /**
         * MIN-358 : l'agent travaillait dans le dépôt que l'utilisateur a sur
         * son disque, et son commit a emporté des fichiers que celui-ci avait
         * lui aussi modifiés — donc du travail à lui part dans la pull request.
         *
         * Aucune astuce ne referme ce cas : deux mains dans le même fichier ne
         * se démêlent pas après coup. Ce qu'on peut faire, et qui est le
         * minimum, c'est le DIRE au lieu de trancher en silence.
         */
        if (p.phase === "current_repo_overlap") {
          const files = typeof p.files === "number" ? p.files : 0;
          if (files > 0) {
            items.push({
              kind: "note",
              id: e.id,
              variant: "currentRepoOverlap",
              count: files,
              text: "",
              createdAt: e.created_at,
            });
          }
        }
        // Le fournisseur est tombé (MIN-219) : le tour attend avant de retenter,
        // et l'attente peut durer plusieurs minutes. L'event existait déjà, il
        // n'avait aucun lecteur — l'agent se taisait sans que rien ne dise pourquoi.
        if (p.phase === "transient_error") {
          items.push({
            kind: "note",
            id: e.id,
            variant: "providerRetry",
            text: "",
            createdAt: e.created_at,
          });
        }
        break;
      }
      case "error": {
        current = null;
        const msg = str(p.message) || str(p.text);
        // Un CODE prime sur le texte : c'est le fil qui traduit. Le `message` du
        // payload reste le repli — une erreur de modèle, elle, n'a que ça.
        const code = str(p.code);
        if (code || msg.trim()) {
          items.push({
            kind: "note",
            id: e.id,
            variant: "error",
            ...(code ? { code } : {}),
            text: msg,
            createdAt: e.created_at,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return { items, results, userTexts, sandboxReady: sandboxSeq > runningSeq };
}


interface RenderContext {
  results: Map<string, ToolResult>;
  copyableIds: Set<string>;
  /** Compteurs exacts du diff Git vivant, couvrant toute la branche. */
  liveDiffFiles: LiveDiffStat[];
  /** Ouvre la vue diff de la session (dans la conversation) → lignes cliquables. */
  onOpenFile?: (path: string) => void;
  /** Event `question` ACTIF, rendu par la conversation à la place du composer →
      son item du fil est masqué (les questions passées restent, inertes). */
  hiddenQuestionEventId?: string | null;
}

function FilesRow({
  item,
  liveDiffFiles,
  onOpenFile,
}: {
  item: Extract<FeedItem, { kind: "files" }>;
  liveDiffFiles: LiveDiffStat[];
  onOpenFile?: (path: string) => void;
}) {
  const t = useTranslations("Agent");
  // Le bloc du tour EN COURS garde sa liste provisoire, mais ses compteurs sont
  // enrichis par le diff Git vivant dès que celui-ci répond. Il mène au diff
  // VIVANT, pas à l'état poussé ; le libellé et le shimmer le signalent.
  const files = item.live ? mergeLiveFileStats(item.files, liveDiffFiles) : item.files;
  return (
    <ChangedFilesBlock
      files={files}
      truncated={item.truncated}
      label={
        item.live
          ? t("filesChangedTurn", { count: item.files.length })
          : t("filesChanged", { count: item.files.length })
      }
      live={item.live}
      defaultOpen
      onOpenFile={onOpenFile}
    />
  );
}

function renderItem(it: FeedItem, ctx: RenderContext): ReactNode {
  if (it.kind === "message") {
    // Question ACTIVE : la carte vivante est affichée par la conversation à la
    // place du composer — sa bulle du fil ne se rend pas du tout.
    if (it.message.id === ctx.hiddenQuestionEventId) return null;
    return (
      <ChatMessage
        key={it.message.id}
        message={it.message}
        toolCallResults={ctx.results}
        askUserAnswer={it.askUserAnswer}
        showCopyButton={ctx.copyableIds.has(it.message.id)}
      />
    );
  }
  if (it.kind === "files") {
    return (
      <FilesRow
        key={it.id}
        item={it}
        liveDiffFiles={ctx.liveDiffFiles}
        onOpenFile={ctx.onOpenFile}
      />
    );
  }
  // Avant le repli en note : `renderItem` se termine par un NoteRow fourre-tout,
  // sans cette branche une ligne de réflexion s'y rendrait.
  if (it.kind === "reasoning") {
    return (
      <ReasoningBlock key={it.id} active={it.active} durationMs={it.durationMs} text={it.text} />
    );
  }
  if (it.kind === "subagent") {
    return (
      <SubagentBlock
        key={it.id}
        subagentId={it.subagentId}
        mode={it.mode}
        steps={it.steps}
        report={it.report}
        error={it.error}
        delivered={it.delivered}
        partial={it.partial}
        startedAt={it.createdAt}
        endedAt={it.endedAt}
      />
    );
  }
  if (it.kind === "quota") {
    return (
      <QuotaExhaustedCard
        key={it.id}
        resetsAt={it.resetsAt}
        nextPlanId={it.nextPlanId}
        byok={it.byok}
        cause={it.cause}
        capPercent={it.capPercent}
      />
    );
  }
  return <NoteRow key={it.id} item={it} />;
}

/**
 * Un tour : accordéon du déroulé (ouvert en direct pendant le travail, refermé tout
 * seul une fois terminé — voir `WorkAccordion`, partagé avec le chat Numo) + résumé
 * final visible dessous.
 */
function TurnGroup({
  work,
  summary,
  files,
  startedAt,
  endedAt,
  active,
  interrupted,
  ctx,
}: {
  work: FeedItem[];
  summary: TurnCloser | null;
  files: FeedItem[];
  startedAt: string;
  endedAt: string | null;
  active: boolean;
  interrupted?: boolean;
  ctx: RenderContext;
}) {
  return (
    <div className="flex flex-col gap-3">
      <WorkAccordion startedAt={startedAt} endedAt={endedAt} active={active}>
        {work.map((it) => renderItem(it, ctx))}
      </WorkAccordion>
      {summary ? renderItem(summary, ctx) : null}
      {/* Fichiers changés du tour : sous la réponse, hors de l'accordéon de travail. */}
      {files.map((it) => renderItem(it, ctx))}
      {interrupted ? <InterruptedRow /> : null}
    </div>
  );
}

/**
 * Le tour s'est arrêté sans répondre. Sans cette ligne, un tour interrompu se
 * replie exactement comme un tour qui a conclu, et rien ne dit que la réponse
 * manque parce qu'on l'a coupée — on la cherche sous l'accordéon.
 */
function InterruptedRow() {
  const t = useTranslations("Agent");
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <CircleSlash className="size-3 shrink-0" />
      {t("turnInterrupted")}
    </div>
  );
}

/**
 * Motifs d'arrêt NOMMÉS par le harness → la phrase que l'utilisateur lit. Tout
 * ce qui n'est pas dans cette table garde son texte : une erreur de modèle vient
 * du provider, on ne la traduit pas, on la montre.
 */
const ERROR_CODE_KEYS: Record<string, MessageKey<"Agent">> = {
  turnTooLong: "errorTurnTooLong",
  turnTooBig: "errorTurnTooBig",
  turnHistoryReset: "errorTurnHistoryReset",
  replyIncomplete: "errorReplyIncomplete",
  providerUnavailable: "errorProviderUnavailable",
  // MIN-224 : le process de boucle de la microVM est mort avant d'avoir conclu.
  // C'est le chien de garde qui l'a constaté (`reapDeadVmRuns`), et la session a
  // repris sur sa dernière sauvegarde périodique — pas sur rien.
  turnLost: "errorTurnLost",
  // MIN-243 : le même appel, les mêmes arguments et le même résultat, quatre fois
  // dans les dix derniers. Le tour est coupé avant que le budget ne le fasse.
  toolLoop: "errorToolLoop",
  // MIN-286 : la base a refusé la mémoire du tour (un octet nul dans la sortie
  // d'une commande). Le travail, lui, est poussé sur la branche.
  checkpointRefused: "errorCheckpointRefused",
  // MIN-329 : la microVM a annoncé une dépense impossible (montant négatif, hors
  // bornes). La ligne n'est pas écrite, et le fil le dit plutôt que de laisser un
  // trou muet dans les compteurs.
  usageRejected: "errorUsageRejected",
};

/**
 * Pourquoi ce run n'a pas pu jouer sur la machine (MIN-357) → ce que
 * l'utilisateur lit. Les deux motifs viennent d'`admitLocalRun`
 * ([lib/server/agent/local-exec.ts](../../lib/server/agent/local-exec.ts)) ; un
 * motif inconnu retombe sur la phrase générique plutôt que sur rien.
 */
const LOCAL_DECLINED_KEYS: Record<string, MessageKey<"Agent">> = {
  no_mint: "localDeclinedNoMint",
};

function NoteRow({ item }: { item: Extract<FeedItem, { kind: "note" }> }) {
  const t = useTranslations("Agent");
  if (item.variant === "error") {
    const key = item.code ? ERROR_CODE_KEYS[item.code] : undefined;
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span className="whitespace-pre-wrap">{key ? t(key) : item.text}</span>
      </div>
    );
  }
  if (item.variant === "reasoningUnsupported") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="size-3 shrink-0" />
        {t("reasoningUnsupported")}
      </div>
    );
  }
  if (item.variant === "providerRetry") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CloudOff className="size-3 shrink-0" />
        {t("providerRetry")}
      </div>
    );
  }
  if (item.variant === "localDeclined") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Cloud className="size-3 shrink-0" />
        {t(LOCAL_DECLINED_KEYS[item.code ?? ""] ?? "localDeclined")}
      </div>
    );
  }
  if (item.variant === "currentRepoOverlap") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitCommit className="size-3 shrink-0" />
        {t("currentRepoOverlap", { count: item.count ?? 0 })}
      </div>
    );
  }
  // commit
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <GitCommit className="size-4 shrink-0" />
      {t("commitLabel")}
    </div>
  );
}

export function AgentEventFeed({
  runId,
  status,
  stopping = false,
  prompt,
  promptMentions,
  className,
  pendingUserMessages = [],
  onOpenFile,
  liveDiffFiles,
  hiddenQuestionEventId,
  localExec = false,
}: {
  /**
   * Session à suivre, ou `null` quand elle n'existe pas ENCORE : le POST de
   * lancement est en vol. Le fil n'a alors rien à interroger et se contente
   * d'afficher la bulle optimiste du 1er message — même composant, même mise en
   * page, donc aucun saut visuel quand la vraie session prend le relais.
   */
  runId: string | null;
  status: AgentRunStatus;
  /**
   * L'utilisateur vient de demander l'arrêt. Le serveur, lui, ne rend la main
   * qu'à la frontière du round : le fil s'arrête donc TOUT DE SUITE — le tour en
   * cours se replie sur sa durée — alors que le POLLING, lui, continue sur le
   * vrai statut, puisque les derniers events du tour doivent encore arriver.
   */
  stopping?: boolean;
  /** Prompt de lancement, affiché en tête comme 1re bulle utilisateur. */
  prompt?: string | null;
  promptMentions?: AssistantMention[] | null;
  className?: string;
  /** Rend cliquables les fichiers des blocs de diff (ouvre la vue diff de la session). */
  onOpenFile?: (path: string) => void;
  /** Compteurs exacts du diff vivant, utilisés par le bloc de fichiers du tour actif. */
  liveDiffFiles?: LiveDiffStat[];
  /**
   * Event `question` ACTIF (MIN-86) : sa carte vivante est rendue par la
   * conversation à la place du composer → son item du fil est masqué ici.
   */
  hiddenQuestionEventId?: string | null;
  /**
   * Ce run tourne sur la MACHINE de l'utilisateur (MIN-359).
   *
   * Le fil le dit en tête, une fois, avant le premier message : **un run local
   * n'est pas un run cloud avec un autre disque.** Il ouvre un vrai dossier, il
   * n'a pas de diff en direct (la route lit la microVM par RPC), et ce que
   * l'agent y lit remonte dans ce fil-là. Une bascule d'environnement qui ne se
   * lirait qu'en survolant un chip du composer serait une bascule que personne
   * ne voit.
   */
  localExec?: boolean;
  /**
   * Messages que l'utilisateur vient d'envoyer, pas encore revenus du serveur.
   * Un message de steering ne devient un event `user_message` que lorsque la BOUCLE
   * le draine — réveil de sandbox compris, soit plusieurs secondes. Sans eux, on
   * taperait dans le vide : la bulle n'apparaîtrait qu'une fois l'agent reparti.
   */
  pendingUserMessages?: Array<{ text: string; mentions?: AssistantMention[] }>;
}) {
  const t = useTranslations("Agent");
  const tc = useTranslations("Common");
  // Deux vérités, et elles ne coïncident que hors interruption :
  //  • `polling` — ce que le SERVEUR fait : tant qu'il travaille, on interroge le
  //    fil et on reste abonné au direct. Un arrêt demandé n'y change rien, c'est
  //    même là que les derniers events du tour arrivent.
  //  • `active`  — ce que l'INTERFACE raconte : au clic sur « stopper », elle
  //    s'arrête sans attendre le serveur (le tour se replie, l'indicateur
  //    « travaille » s'efface).
  const polling = isAgentRunWorking(status);
  const active = polling && !stopping;
  const { events, loading } = useAgentRunEventsQuery(runId, polling);
  // Direct : le texte du round pendant que le modèle l'écrit, plus les events
  // poussés dans le cache du fil dès leur insertion (lib/use-agent-run-live).
  const live = useAgentRunLive(runId, polling);
  const feedRef = useRef<HTMLDivElement>(null);
  // Fade doux en haut/bas du fil (même pattern que les colonnes Kanban) → on voit
  // qu'il reste du contenu au-dessus / en dessous. On fusionne son ref avec le nôtre.
  // `edges.end` (« il reste du contenu en dessous ») commande aussi le bouton de
  // retour en bas : même mesure, donc jamais de désaccord entre le fondu et lui.
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      feedRef.current = node;
      fadeRef(node);
    },
    [fadeRef],
  );
  const scrollToEnd = useCallback(() => {
    const node = feedRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, []);

  const { items, results, userTexts, sandboxReady } = useMemo(
    () => buildFeed(events, prompt, promptMentions),
    [events, prompt, promptMentions],
  );

  // Bulles optimistes encore à afficher : dédoublonnées contre TOUS les textes
  // user reçus (bulles ET réponses absorbées par une ligne de question).
  const stillPending = unechoedMessages(pendingUserMessages, userTexts);

  // Réponse EN VOL à la dernière question (optimiste) : rattachée tout de suite
  // à sa ligne plutôt qu'affichée en bulle temporaire qui disparaîtrait à l'écho.
  let displayItems = items;
  let displayPending = stillPending;
  if (stillPending.length > 0) {
    const last = [...items]
      .reverse()
      .find((it): it is MessageItem => it.kind === "message");
    if (
      last &&
      !last.askUserAnswer &&
      last.message.tool_calls?.some((tc) => tc.function.name === "ask_user")
    ) {
      displayItems = items.map((it) =>
        it === last ? { ...it, askUserAnswer: stillPending[0].text } : it,
      );
      displayPending = stillPending.slice(1);
    }
  }

  // Queue VIVANTE du round en cours, ajoutée en fin de fil : l'indicateur de
  // réflexion et le texte tel qu'il s'écrit, dans l'ordre où leurs vrais events se
  // poseront (réflexion d'abord, réponse ensuite) — la bascule du provisoire au
  // définitif ne déplace donc rien à l'écran.
  const liveItems = useMemo((): FeedItem[] => {
    // Arrêt demandé : la queue vivante disparaît avec le reste des signes de
    // travail. Elle continuerait sinon d'écrire pendant deux ou trois secondes
    // sous un tour qui se dit terminé.
    if (!live || stopping) return [];
    const out: FeedItem[] = [];
    if (live.reasoningActive) {
      // Ligne compacte + compteur, PAS le texte du raisonnement : il n'est pas
      // streamé. Sa trace arrive avec l'event de fin de round, repliée.
      out.push({
        kind: "reasoning",
        id: "live-reasoning",
        active: true,
        durationMs: live.reasoningMs,
        text: "",
        createdAt: live.startedAt,
      });
    }
    if (live.text.trim()) {
      out.push({
        kind: "message",
        message: makeMessage("live-text", live.text),
        createdAt: live.startedAt,
        // Un outil déjà amorcé dans ce round ⇒ ce texte est de la narration, il
        // reste dans le déroulé. Sinon il vise la place de la réponse finale.
        isLiveAnswer: live.tools === 0,
      });
    }
    // Fichiers du tour EN COURS, tels que les tools les ont touchés — provisoires
    // jusqu'au `files_changed` de fin de tour, qui les remplace avec les compteurs
    // de git. Le serveur retire la liste au moment du relais : les deux blocs ne se
    // superposent pas.
    if (live.files.length > 0) {
      out.push({
        kind: "files",
        id: "live-files",
        files: live.files,
        truncated: live.filesTruncated,
        createdAt: live.startedAt,
        live: true,
      });
    }
    return out;
  }, [live, stopping]);

  const blocks = useMemo(
    () => buildBlocks(liveItems.length ? [...displayItems, ...liveItems] : displayItems, active),
    [displayItems, liveItems, active],
  );

  // Bouton copy sous la RÉPONSE DE CHAQUE TOUR (le résumé qui le clôt), pas sous le
  // seul dernier message de la session : une session en compte plusieurs et chacune
  // de ces réponses se copie. Les messages intermédiaires (déroulé du travail) n'en
  // ont pas — ils ne sont pas des réponses.
  //
  // Tant que l'agent TRAVAILLE, sa tête vivante n'en porte pas non plus : ce n'est
  // que la narration du moment, et le bouton sautait de message en message au fil
  // du travail. Le repli sur le dernier message ne sert qu'aux tours SANS résumé
  // (run interrompu, erreur) : là, ce message EST la fin de la réponse.
  const copyableIds = useMemo(() => {
    const ids = new Set<string>();
    let lastAssistant: string | null = null;
    for (const it of items) {
      if (it.kind !== "message" || it.message.role !== "assistant" || !it.message.content) continue;
      lastAssistant = it.message.id;
      if (it.isSummary) ids.add(it.message.id);
    }
    if (lastAssistant && !active) ids.add(lastAssistant);
    return ids;
  }, [items, active]);

  // Le fil se cale en bas à l'OUVERTURE de la session (et à chaque changement de
  // session) : on arrive là où le travail se passe. useLayoutEffect → pas de flash
  // « scroll depuis le haut » avant peinture. On attend que les events de la session
  // soient LÀ : le prompt de lancement, lui, s'affiche dès le changement de session
  // (il vient de la prop) — ancrer sur cette seule bulle laisserait le fil en haut
  // du déroulé une seconde plus tard.
  //
  // Ensuite, plus rien ne bouge tout seul. Le fil suivait auparavant chaque event et
  // chaque poussée du texte en direct : impossible de relire un pas de travail, le
  // suivant arrachait la vue vers le bas. Pendant que l'agent travaille, la vue reste
  // donc où l'utilisateur l'a laissée, et le contenu grandit dessous.
  const anchoredRunRef = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    const node = feedRef.current;
    if (!node || loading || items.length === 0) return;
    if (anchoredRunRef.current === runId) return;
    node.scrollTop = node.scrollHeight;
    anchoredRunRef.current = runId;
  }, [runId, loading, items.length]);

  // Un message de l'utilisateur, LUI, se suit : c'est son geste, et sa bulle doit
  // être sous ses yeux. Le compte des messages en vol ne monte qu'à l'envoi.
  const pendingCount = pendingUserMessages.length;
  const lastPendingCountRef = useRef(pendingCount);
  useLayoutEffect(() => {
    const node = feedRef.current;
    if (node && pendingCount > lastPendingCountRef.current) {
      node.scrollTop = node.scrollHeight;
    }
    lastPendingCountRef.current = pendingCount;
  }, [pendingCount]);

  const ctx: RenderContext = {
    results,
    copyableIds,
    liveDiffFiles: liveDiffFiles ?? [],
    onOpenFile,
    hiddenQuestionEventId,
  };
  // Le tour actif (accordéon ouvert « Travaille depuis X ») porte déjà le signal
  // « travaille » → on ne montre l'indicateur du bas que sans tour actif encore.
  const hasActiveTurn = blocks.some((b) => b.type === "turn" && b.active);
  // Dès que l'agent émet du texte, l'interface a déjà quelque chose de plus
  // juste à montrer que « travaille ». On ne se limite PAS à `isLiveAnswer` :
  // après un appel d'outil, le texte final garde la trace de cet outil et n'est
  // donc pas marqué comme une réponse finale par le regroupement du fil.
  const agentTextStreaming = liveItems.some((item) => item.kind === "message");
  /**
   * L'agent est parti mais rien n'est encore visible de lui. Deux moments très
   * différents sous cette même apparence, et c'est l'event `sandbox_ready` qui les
   * sépare :
   *  • AVANT — la microVM se réveille et le dépôt se restaure : personne ne
   *    travaille encore, on ouvre la sandbox (plusieurs secondes) ;
   *  • APRÈS — la machine est là et l'agent réfléchit ; son premier pas n'est
   *    simplement pas encore posé (un tour peut ne rien émettre jusqu'à sa
   *    réponse finale). Là, « travaille » est la vérité.
   * Dès qu'un pas paraît, le tour actif prend le relais et porte le chrono.
   */
  // En local il n'existe aucune sandbox à attendre : dès l'envoi, la requête et
  // les pré-vols du processus Mac font déjà partie du travail du tour. Garder
  // « démarrage de la session » jusqu'au premier delta du modèle faisait passer
  // son temps de réflexion (et les premiers deltas non affichables) pour du boot.
  // Le cloud conserve, lui, sa vraie frontière explicite `sandbox_ready`.
  const runtimeReady = sandboxReady || localExec;
  const startingSandbox = active && !hasActiveTurn && !runtimeReady;
  const workingSilently =
    active && !hasActiveTurn && !agentTextStreaming && runtimeReady;
  // Rien du tout, et personne au travail : la session n'a rien à raconter.
  const emptyAtRest =
    !active && blocks.length === 0 && displayPending.length === 0 && !loading;

  return (
    <div
      ref={setScrollNode}
      {...scrollProps}
      className={cn("flex flex-col overflow-y-auto overscroll-contain", className)}
    >
      {/* Le fil part du HAUT, sous l'en-tête de la conversation, et descend vers
          l'input — comme une page qui se remplit.
          Il était collé en BAS (`mt-auto`) tant qu'il était court : chaque bloc qui
          arrivait poussait alors tout le fil vers le haut, et le lancement d'une
          session — où la sandbox, le premier pas et la première réponse tombent en
          quelques secondes — se voyait comme une suite de sauts.
          Largeur bornée + centrée, avec le MÊME retrait horizontal (px-3) que le
          composer `ChatInput` → messages et input strictement à la même largeur. */}
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-3 px-3">
        {blocks.map((block) =>
          block.type === "turn" ? (
            <TurnGroup
              key={block.key}
              work={block.work}
              summary={block.summary}
              files={block.files}
              startedAt={block.startedAt}
              endedAt={block.endedAt}
              active={block.active}
              interrupted={block.interrupted}
              ctx={ctx}
            />
          ) : (
            renderItem(block.item, ctx)
          ),
        )}
        {/* Envoyés, pas encore revenus du serveur. Rendus APRÈS les blocs (et non
            injectés dans `items`) : un message user referme le tour en cours, donc
            les glisser dans le flux replierait l'accordéon du travail en direct. */}
        {displayPending.map((pending, i) => (
          <ChatMessage
            key={`pending-${i}-${pending.text}`}
            /* Les mentions viennent de CE message, pas d'un homonyme : deux
               « ok » à la suite dont un seul cite un ticket ne doivent pas
               échanger leurs pilules. */
            message={makeMessage(`pending-${i}`, pending.text, "user", pending.mentions)}
            toolCallResults={results}
          />
        ))}
        {/* Ces deux lignes tiennent la place du premier bloc à venir : elles sont
            DANS le fil, à sa largeur et à son ancrage. L'ouverture de la sandbox
            s'affiche donc exactement là où le travail s'écrira, et la relève ne
            déplace rien. */}
        {startingSandbox || workingSilently ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <NumoIcon state="thinking" className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-shimmer">
              {startingSandbox
                ? // Un tour local n'ouvre AUCUNE sandbox (MIN-293) : entre le
                  // lancement et le premier pas, ce qui se passe est le
                  // téléchargement du harness et l'ouverture du dépôt sur la
                  // machine. Dire « sandbox » ici serait faux, et ce serait la
                  // première chose que l'utilisateur lit d'un run local.
                  t(localExec ? "openingLocalTurn" : "openingSandbox")
                : t("working")}
            </span>
          </div>
        ) : emptyAtRest ? (
          <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
        ) : null}
      </div>
      {/* Retour en bas, à parité avec le fil de Numo : le fil ne suit plus l'agent,
          ce bouton est donc le raccourci pour rattraper la fin. `sticky` sur une
          boîte de hauteur NULLE → il flotte au-dessus du bas du cadre sans réserver
          de place, donc son apparition ne pousse rien (`min-h-0` avec `h-0` : sans
          lui, la taille minimale automatique d'un item flex en colonne rendrait au
          bloc la hauteur de son bouton). Et il se tient au-dessus des 2 rem du fondu
          de bas de fil, qui le délaverait s'il descendait dedans. */}
      {edges.end ? (
        <div className="sticky bottom-10 z-10 flex h-0 min-h-0 items-end justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={tc("scrollToBottom")}
            title={tc("scrollToBottom")}
            onClick={scrollToEnd}
            className="rounded-full bg-background shadow-sm dark:bg-background dark:hover:bg-muted"
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
