"use client";

// LA vue d'une tâche — celle du carnet, et celle d'une page.
//
// Une tâche est le même objet des deux côtés : même schéma, mêmes quatre états,
// même round-trip markdown (task-nodes.ts), même case à cocher
// (task-checkbox.tsx). Ce fichier est le dernier morceau à l'avoir été aussi :
// le menu ⋯, les raccourcis de survol et le clic droit. Une page de projet est
// exactement l'endroit où l'on écrit un compte-rendu qui finit en liste
// d'actions ; les confier depuis là devait cesser de demander de les recopier
// dans le carnet.
//
// Ce qui différait n'était jamais la tâche, seulement ce qu'il faut faire
// AUTOUR quand on la confie : quitter la surface, quel prompt emballer, quoi
// dire à Numo. Ces trois gestes viennent de `useTaskSurface()` (task-surface.tsx),
// que le carnet et la page remplissent chacun à sa façon.
//
// ⚠️ Ce fichier importe le baril `mangue-ui` (SearchMenu, Button, toast), donc
// il n'est PAS importable hors navigateur. Le registre de blocs des pages, lui,
// doit l'être (projection markdown, outils MCP, tests — cf. lib/cx.ts) : c'est
// pourquoi aucun fichier de bloc ne le nomme, et pourquoi c'est l'éditeur de
// page qui INJECTE cette vue au montage (`pageExtensions({ nodeViews })`),
// comme il le fait déjà pour la pilule de mention.

import { useRef, useState, type MouseEvent } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { NodeViewRenderer } from "@tiptap/core";
import { useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
  cn,
  toast,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import {
  Bot,
  Check,
  Circle,
  CircleSlash,
  Copy,
  Ellipsis,
  Play,
} from "lucide-react";
import { SearchMenu } from "@/components/search-menu";
import { NumoIcon } from "@/components/numo-icon";
import { taskSectionHeadings } from "@/lib/task-sections";
import { isPlanTaskState, type PlanTaskState } from "@/lib/plan";
import {
  TASK_LINE,
  TaskCheckbox,
  taskStruck,
} from "@/components/scratchpad/task-checkbox";
import { taskLinesMarkdown } from "@/lib/scratchpad";
import { resolvePromptCopyAutoStart } from "@/lib/prompt-copy-auto-start";
import {
  startPendingTasks,
  taskItemLines,
  taskOwnText,
} from "@/components/scratchpad/start-tasks";
import { useAuth } from "@/lib/auth-context";
import { useTaskSurface } from "@/components/scratchpad/task-surface";
import { eventKey } from "@/lib/keyboard/event-key";
import { pointerIsStale, useHoverKeys } from "@/lib/keyboard/hover-keys";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";

/** Les quatre états d'une tâche, dans l'ordre du cycle de vie. */
const STATE_CHOICES = [
  {
    value: "pending",
    icon: Circle,
    label: "markPending",
    keywords: ["pending", "todo", "à faire", "a faire"],
  },
  {
    value: "in_progress",
    icon: Play,
    label: "markInProgress",
    keywords: ["in progress", "en cours", "wip"],
  },
  {
    value: "completed",
    icon: Check,
    label: "markCompleted",
    keywords: ["completed", "done", "terminé", "termine", "fait"],
  },
  {
    value: "cancelled",
    icon: CircleSlash,
    label: "cancelTask",
    keywords: ["cancelled", "annulé", "annule", "drop"],
  },
] as const satisfies readonly {
  value: PlanTaskState;
  icon: typeof Circle;
  label: string;
  keywords: readonly string[];
}[];

/**
 * Tasks with the plan's FOUR states inside a WYSIWYG editor. The checkbox and
 * the per-line ⋯ menu (change state, promote the note to an issue, copy the
 * line as a prompt) come from a React NodeView; the state persists as the node
 * attribute `state` and round-trips to markdown markers ([ ]/[~]/[x]/[-]) via
 * task-markdown.ts.
 */
export function TaskItemView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const t = useTranslations("Plan");
  const { user } = useAuth();
  // Hors provider (un aperçu, un éditeur monté sans surface) : la case reste,
  // le reste disparaît. Cf. task-surface.tsx.
  const surface = useTaskSurface();

  const raw = node.attrs.state;
  const state: PlanTaskState = isPlanTaskState(raw) ? raw : "pending";
  const struck = taskStruck(state);
  const toggled: PlanTaskState = struck ? "pending" : "completed";

  const set = (next: PlanTaskState) => updateAttributes({ state: next });

  // Confier la tâche à un agent, c'est la commencer : la passation la fait
  // passer « en cours », exactement comme sur un ticket, et avec les deux mêmes
  // règles — « copier le prompt » démarre sous l'option de compte (MIN-20,
  // Compte → Préférences), « lancer un agent » démarre toujours (MIN-46). Une
  // tâche déjà commencée, cochée ou annulée ne bouge dans aucun des deux cas.
  //
  // Depuis la reprise des sous-tâches, le geste porte sur le SOUS-ARBRE : un
  // parent qu'on confie, ce sont ses enfants qu'on confie avec lui, et ce sont
  // eux, à leur tour, que la passation démarre. Un parent déjà « en cours » qui
  // porte encore des tâches à faire les démarre donc, alors que lui ne bouge pas.
  const copyStarts = resolvePromptCopyAutoStart(user?.user_metadata);
  const started = (s: PlanTaskState): PlanTaskState =>
    s === "pending" ? "in_progress" : s;

  /** Démarre la tâche et sa descendance ; rend le nombre de tâches déplacées. */
  const startSubtree = (): number => {
    const pos = getPos();
    if (pos == null) return 0;
    return startPendingTasks(editor, pos, pos + node.nodeSize);
  };

  // Le markdown que porte la tâche quand elle sort de sa surface (copie ou
  // agent) : la tâche ET SES SOUS-TÂCHES, marqueurs et niveaux compris,
  // PRÉCÉDÉES des titres des sections qui la contiennent — seul moyen de dire à
  // l'agent d'où elle vient (le prompt les reformule en clair, cf.
  // lib/scratchpad-prompt.ts). Null si la ligne est vide.
  //
  // Les marqueurs sont ceux de l'état APRÈS le geste (comme le XML d'un ticket
  // copié, cf. issue-card.tsx) : une tâche que la passation démarre part en
  // `[~]`, pas dans son état d'avant — sans quoi le prompt décrirait comme « à
  // faire » un travail que le document, lui, dit déjà en cours.
  const taskMarkdown = (start: boolean): string | null => {
    const lines = taskItemLines(node, start ? started : undefined);
    if (!lines[0]?.text) return null;
    const block = taskLinesMarkdown(lines.filter((line) => line.text));
    const headings = taskSectionHeadings(editor, getPos());
    return headings.length > 0 ? `${headings.join("\n\n")}\n\n${block}` : block;
  };

  const copyLine = () => {
    if (!surface) return;
    const md = taskMarkdown(copyStarts);
    if (!md) return;
    void navigator.clipboard.writeText(surface.copyPrompt(md));
    const moved = copyStarts ? startSubtree() : 0;
    // Le toast ne signale le déplacement que s'il a eu lieu.
    toast.success(t(moved > 0 ? "copiedLineMovedToast" : "copiedLineToast"));
  };

  // « Promouvoir en ticket » : la note part telle quelle à Numo, qui la convertit
  // en vrai ticket — pose des questions plutôt que d'inventer si elle est trop
  // floue, puis retire la note de sa surface une fois le ticket créé : elle vit
  // désormais dans le tracker. Quitter la surface avant d'ouvrir le panneau
  // (fermeture du carnet, enregistrement de la page) est le travail du provider.
  //
  // La note envoyée est le SOUS-ARBRE : les sous-tâches sont le détail du
  // travail, et un ticket écrit sans elles est un ticket qui perd la moitié de
  // ce que la note disait. Une tâche sans enfant part en texte simple, comme
  // avant — pas de case à cocher pour une seule ligne.
  const promoteToIssue = () => {
    if (!surface) return;
    const lines = taskItemLines(node).filter((line) => line.text);
    if (lines.length === 0) return;
    const note = lines.length === 1 ? lines[0].text : taskLinesMarkdown(lines);
    surface.promote(note);
  };

  // « Lancer un agent » (MIN-84) : la ligne part en markdown (marqueur et titre
  // de section compris — la note est le SEUL canal jusqu'à l'agent), emballée
  // par la surface dans le MÊME prompt que « copier le prompt » ci-dessus ; le
  // composer de la page Agents le montre tel quel, éditable, et fait choisir le
  // projet avant l'envoi.
  //
  // Le démarrage a lieu ICI, au geste, et pas à l'envoi réel : le run n'est
  // rattaché à aucune tâche (sa note est un simple texte, cf.
  // lib/server/agent/launch.ts), donc rien ne pourrait retrouver la ligne plus
  // tard. Abandonner le composer laisse la tâche « en cours » — un clic pour la
  // remettre, contre une passation qui ne marque rien dans le cas normal.
  const launchAgent = () => {
    if (!surface) return;
    const md = taskMarkdown(true);
    if (!md) return;
    // AVANT `launchAgent` : la surface enregistre en partant (le carnet flushe
    // en se démontant, la page flushe avant de naviguer) — l'état doit donc
    // être posé pour partir avec, sinon il se perdrait en route.
    startSubtree();
    surface.launchAgent(md);
  };

  // The ⋯ menu is a searchable cmdk palette (SearchMenu), opened from the button
  // or by right-clicking the task; anchored to the ⋯ trigger (Radix positions it
  // transform-aware, unlike a fixed-point anchor inside the dialog).
  const [menuOpen, setMenuOpen] = useState(false);
  // Les quatre états tiennent derrière une seule entrée « Changer l'état » : le
  // menu avance d'une étape sans se fermer, comme le sélecteur de relations. La
  // recherche est contrôlée pour repartir vide à l'étape 2 — sans quoi le texte
  // tapé pour trouver l'entrée filtrerait ensuite les états.
  const [statePage, setStatePage] = useState(false);
  const [query, setQuery] = useState("");
  const pick = (fn: () => void) => {
    fn();
    setMenuOpen(false);
    setStatePage(false);
    setQuery("");
  };
  const CurrentStateIcon =
    STATE_CHOICES.find((c) => c.value === state)?.icon ?? Circle;

  // Raccourcis au survol, comme sur une carte de ticket : ⇧A lance l'agent,
  // ⇧P copie la ligne en prompt. Ils sont posés sur la TÂCHE seule — les
  // sections gardent leurs boutons de survol, le carnet entier ses boutons
  // d'en-tête, et aucun des deux n'a de raccourci.
  //
  // Le carnet comme une page sont des surfaces éditables, où ⇧A c'est aussi
  // « écrire un A ». La règle : **la frappe l'emporte tant qu'on écrit**, où que
  // soit le pointeur. Écrire « Ajouter » sur sa propre ligne ne lance donc rien
  // — et écrire sur une AUTRE ligne non plus, alors même que la souris est
  // restée sur celle-ci (`pointerIsStale`, cf. hover-keys.ts). Le raccourci ne
  // repart qu'une fois la tâche visée à nouveau, d'un mouvement du pointeur.
  // Une surface qui monte cette vue doit donc appeler `noteTyping()` sur ses
  // frappes et `trackPointerFreshness()` le temps qu'elle vit.
  //
  // Tout ce qui bouge d'un rendu à l'autre (les actions relisent le contenu du
  // nœud, `getPos` sa position) passe par une ref : le listener reste alors
  // abonné d'un bout à l'autre du survol au lieu de se réabonner à chaque frappe.
  const liveRef = useRef({ copyLine, launchAgent, getPos });
  liveRef.current = { copyLine, launchAgent, getPos };

  // La tâche visée se lit dans le DOM au moment de la frappe : passer d'une
  // ligne à l'autre puis taper aussitôt ne peut plus lancer l'agent sur la
  // précédente (MIN-158). `useHoverKeys` désigne aussi la tâche la plus
  // INTÉRIEURE, ce qui règle les tâches imbriquées — entrer dans l'enfant ne
  // fait pas sortir du parent, les deux sont survolés, l'enfant gagne.
  //
  // Menu ouvert = on tape dans son champ de recherche : la lettre lui revient.
  const hoverRef = useHoverKeys(
    (e) => {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = eventKey(e);
      if (key !== "a" && key !== "p") return;
      // On tape dans un champ hors de la surface (la recherche du ⋯, un dialog
      // par dessus) : la touche est à lui, la tâche survolée n'a rien à y voir.
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target) && !editor.view.dom.contains(target)) return;
      // On écrit DANS la surface, ailleurs que sur la tâche visée : le pointeur
      // n'est plus qu'un vestige du dernier déplacement, la lettre l'emporte.
      if (pointerIsStale()) return;
      // On écrit DANS cette tâche-là : la lettre l'emporte sur le raccourci.
      const pos = liveRef.current.getPos();
      if (pos != null && editor.isFocused) {
        const self = editor.state.doc.nodeAt(pos);
        const { from, to } = editor.state.selection;
        if (self && to >= pos && from <= pos + self.nodeSize) return;
      }
      // Le survol possède la combinaison : ni l'éditeur ni le dialog ne la voit.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (key === "a") liveRef.current.launchAgent();
      else liveRef.current.copyLine();
    },
    surface !== null && !menuOpen
  );

  return (
    <NodeViewWrapper
      ref={hoverRef}
      as="li"
      data-type="taskItem"
      data-state={state}
      className="group/task flex items-start gap-2.5 rounded-[3px] px-1 hover:bg-muted/50"
      onContextMenu={(e: MouseEvent) => {
        if (!surface) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      {/* Wrappers a full text-line tall (text-sm × leading-relaxed) so the box
          and the ⋯ center on the first line, whatever the text wraps to. */}
      <span contentEditable={false} className={TASK_LINE}>
        <TaskCheckbox
          state={state}
          label={t("taskCheckboxAria", { text: taskOwnText(node) })}
          onToggle={() => set(toggled)}
        />
      </span>

      <NodeViewContent
        as="div"
        className={cn(
          "min-w-0 flex-1 leading-relaxed",
          struck &&
            "text-muted-foreground line-through [&_*]:text-muted-foreground",
          state === "in_progress" && "font-medium"
        )}
      />

      {surface && (
        <span contentEditable={false} className={TASK_LINE}>
          <SearchMenu
            open={menuOpen}
            onOpenChange={(next) => {
              setMenuOpen(next);
              if (!next) {
                setStatePage(false);
                setQuery("");
              }
            }}
            searchValue={query}
            onSearchValueChange={setQuery}
            tooltip={t("taskMenuAria")}
            align="end"
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("taskMenuAria")}
                onMouseDown={(e) => e.preventDefault()}
                className="size-6 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/task:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <Ellipsis className="size-4" />
              </Button>
            }
          >
            {statePage ? (
              // Étape 2 : les états, l'état courant en moins — le proposer
              // reviendrait à proposer de ne rien faire.
              <CommandGroup heading={t("changeState")}>
                {STATE_CHOICES.filter((c) => c.value !== state).map(
                  ({ value, icon: Icon, label, keywords }) => (
                    <CommandItem
                      key={value}
                      value={t(label)}
                      keywords={[...keywords]}
                      onSelect={() => pick(() => set(value))}
                    >
                      <Icon />
                      {t(label)}
                    </CommandItem>
                  )
                )}
              </CommandGroup>
            ) : (
              <CommandGroup>
                {/* Une seule entrée pour les quatre états, mais elle garde tous
                    leurs mots-clés : taper « terminé » depuis la première page la
                    trouve toujours, au lieu de ne plus rien trouver. */}
                <CommandItem
                  value={t("changeState")}
                  keywords={STATE_CHOICES.flatMap((c) => [...c.keywords])}
                  onSelect={() => {
                    setStatePage(true);
                    setQuery("");
                  }}
                >
                  <CurrentStateIcon />
                  {t("changeState")}
                </CommandItem>
                <CommandSeparator className="my-1" />
                <CommandItem
                  value={t("launchAgent")}
                  keywords={[
                    "agent",
                    "numo",
                    "launch",
                    "lancer",
                    "run",
                    "coder",
                  ]}
                  onSelect={() => pick(launchAgent)}
                >
                  <Bot />
                  {t("launchAgent")}
                  {/* Mêmes touches que sur un ticket, affichées au même endroit. */}
                  <CommandShortcut>
                    <Kbd size="sm">⇧A</Kbd>
                  </CommandShortcut>
                </CommandItem>
                <CommandItem
                  value={t("promoteToIssue")}
                  keywords={[
                    "ticket",
                    "issue",
                    "promote",
                    "promouvoir",
                    "convertir",
                    "convert",
                    "numo",
                  ]}
                  onSelect={() => pick(promoteToIssue)}
                >
                  <NumoIcon animated={false} className="size-4" />
                  {t("promoteToIssue")}
                </CommandItem>
                <CommandItem
                  value={t("copyLine")}
                  keywords={["copy", "copier", "prompt", "agent"]}
                  onSelect={() => pick(copyLine)}
                >
                  <Copy />
                  {t("copyLine")}
                  <CommandShortcut>
                    <Kbd size="sm">⇧P</Kbd>
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}
          </SearchMenu>
        </span>
      )}
    </NodeViewWrapper>
  );
}

/**
 * La vue, prête à être greffée sur le nœud tâche (task-nodes.ts) — par le
 * carnet (scratchpad-task.tsx) comme par l'éditeur de page, qui l'injecte dans
 * `pageExtensions({ nodeViews })`.
 */
export function taskItemNodeView(): NodeViewRenderer {
  // pnpm dual @tiptap/core (same 3.27.4 version) — the react renderer's type
  // reads as a different identity than extension-list expects. Runtime is fine.
  return ReactNodeViewRenderer(TaskItemView) as unknown as NodeViewRenderer;
}
