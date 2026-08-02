"use client";

import { useRef, useState, type MouseEvent } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { NodeViewRenderer } from "@tiptap/core";
import { useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
  Kbd,
  cn,
  toast,
} from "mangue-ui";
import {
  Bot,
  Check,
  Circle,
  CircleSlash,
  Copy,
  Ellipsis,
  Minus,
  Play,
} from "lucide-react";
import { SearchMenu } from "@/components/search-menu";
import { NumoIcon } from "@/components/numo-icon";
import {
  buildScratchpadPrompt,
  sectionHeadingChain,
} from "@/lib/scratchpad-prompt";
import { isPlanTaskState, type PlanTaskState } from "@/lib/plan";
import { TASK_MARKER_BY_STATE } from "@/lib/scratchpad";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartTask,
} from "@/lib/prompt-copy-auto-start";
import { scratchpadTaskMarkdownIt } from "@/components/scratchpad/task-markdown";
import { useAuth } from "@/lib/auth-context";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useLaunchAgentNote } from "@/components/scratchpad/use-launch-agent-note";
import { eventKey } from "@/lib/keyboard/event-key";
import { useHoverKeys } from "@/lib/keyboard/hover-keys";

/**
 * Les lignes de titre markdown (niveaux compris) des sections qui CONTIENNENT le
 * bloc situé en `pos`, de la plus large à la plus étroite — vide si la tâche
 * traîne avant tout titre. Reprises telles quelles en tête du markdown copié /
 * lancé : c'est ce qui permet au prompt de nommer la section (lib/scratchpad-prompt.ts).
 *
 * La hiérarchie compte : une tâche sous « ## Sidebar » est aussi une tâche de
 * « # Pull requests », et le titre le plus proche ne suffit pas à la situer. La
 * règle d'emboîtement vit dans `sectionHeadingChain` — ici on ne fait que lui
 * lister les titres qui précèdent la tâche.
 */
function sectionHeadingsAt(
  editor: NodeViewProps["editor"],
  pos: number | undefined
): string[] {
  if (pos == null) return [];
  const doc = editor.state.doc;
  if (pos < 0 || pos > doc.content.size) return [];
  // La tâche vit dans une taskList : on remonte à son bloc de premier niveau,
  // puis on relève les headings qui le précèdent, dans l'ordre du document.
  const before: Array<{ level: number; text: string }> = [];
  const index = doc.resolve(pos).index(0);
  for (let i = 0; i < index; i++) {
    const child = doc.child(i);
    if (child.type.name !== "heading") continue;
    before.push({
      level: Number(child.attrs.level) || 2,
      text: child.textContent,
    });
  }
  return sectionHeadingChain(before);
}

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
 * Scratchpad tasks with the plan's FOUR states inside the WYSIWYG editor. The
 * checkbox and the per-line ⋯ menu (change state, promote the note to an issue,
 * copy the line as a prompt) come from a React NodeView; the state persists as
 * the node attribute `state` and round-trips to markdown markers
 * ([ ]/[~]/[x]/[-]) via task-markdown.ts.
 */
function TaskItemView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const t = useTranslations("Plan");
  const tScratch = useTranslations("Scratchpad");
  const { close: closeScratchpad } = useScratchpad();
  const openAssistant = useAssistantPanel().open;
  const { user } = useAuth();

  const raw = node.attrs.state;
  const state: PlanTaskState = isPlanTaskState(raw) ? raw : "pending";
  const struck = state === "completed" || state === "cancelled";
  const toggled: PlanTaskState = struck ? "pending" : "completed";

  const set = (next: PlanTaskState) => updateAttributes({ state: next });

  // Confier la tâche à un agent, c'est la commencer : la passation la fait
  // passer « en cours », exactement comme sur un ticket, et avec les deux mêmes
  // règles — « copier le prompt » démarre sous l'option de compte (MIN-20,
  // Compte → Préférences), « lancer un agent » démarre toujours (MIN-46). Une
  // tâche déjà commencée, cochée ou annulée ne bouge dans aucun des deux cas.
  const startOnLaunch = shouldAutoStartTask(state);
  const startOnCopy =
    startOnLaunch && resolvePromptCopyAutoStart(user?.user_metadata);

  // Le markdown que porte la ligne quand elle sort du carnet (copie ou agent) :
  // la tâche telle quelle, marqueur compris, PRÉCÉDÉE des titres des sections
  // qui la contiennent — seul moyen de dire à l'agent d'où elle vient (le prompt
  // les reformule en clair, cf. lib/scratchpad-prompt.ts). Null si la ligne est
  // vide.
  //
  // Le marqueur est celui de l'état APRÈS le geste (comme le XML d'un ticket
  // copié, cf. issue-card.tsx) : une tâche que la passation démarre part en
  // `[~]`, pas dans son état d'avant — sans quoi le prompt décrirait comme « à
  // faire » un travail que le carnet, lui, dit déjà en cours.
  const taskMarkdown = (as: PlanTaskState): string | null => {
    const text = node.textContent.trim();
    if (!text) return null;
    const line = `- ${TASK_MARKER_BY_STATE[as]} ${text}`;
    const headings = sectionHeadingsAt(editor, getPos());
    return headings.length > 0 ? `${headings.join("\n\n")}\n\n${line}` : line;
  };

  const copyLine = () => {
    const md = taskMarkdown(startOnCopy ? "in_progress" : state);
    if (!md) return;
    void navigator.clipboard.writeText(
      buildScratchpadPrompt(md, { section: true })
    );
    if (startOnCopy) set("in_progress");
    // Le toast ne signale le déplacement que s'il a eu lieu.
    toast.success(
      tScratch(startOnCopy ? "copiedLineMovedToast" : "copiedLineToast")
    );
  };

  // « Promouvoir en ticket » : la note part telle quelle à Numo, qui la convertit
  // en vrai ticket — pose des questions plutôt que d'inventer si elle est trop
  // floue, puis retire la note du carnet (il a les outils scratchpad) une fois le
  // ticket créé : elle vit désormais dans le tracker.
  // On ferme le carnet d'abord (son démontage flushe l'autosave, cf.
  // scratchpad-editor.tsx) pour laisser la place au panneau. Pas de projectId :
  // le panneau suit la route, donc le projet courant si on en consulte un, et en
  // mode global Numo demande lequel — le carnet, lui, est cross-projet.
  const promoteToIssue = () => {
    const text = node.textContent.trim();
    if (!text) return;
    closeScratchpad();
    openAssistant({ prompt: tScratch("promotePrompt", { note: text }) });
  };

  // « Lancer un agent » (MIN-84) : la ligne part en markdown de carnet (marqueur
  // et titre de section compris — la note est le SEUL canal jusqu'à l'agent)
  // comme instruction d'un run carnet ; le composer de la page Agents fait
  // choisir le projet avant l'envoi.
  //
  // Le démarrage a lieu ICI, au geste, et pas à l'envoi réel : le run carnet
  // n'est rattaché à aucune tâche (sa note est un simple texte, cf.
  // lib/server/agent/launch.ts), donc rien ne pourrait retrouver la ligne plus
  // tard. Abandonner le composer laisse la tâche « en cours » — un clic pour la
  // remettre, contre une passation qui ne marque rien dans le cas normal.
  const launchNote = useLaunchAgentNote();
  const launchAgent = () => {
    const md = taskMarkdown(startOnLaunch ? "in_progress" : state);
    if (!md) return;
    // AVANT `launchNote` : il ferme le carnet, et c'est ce démontage qui flushe
    // l'autosave (scratchpad-editor.tsx) — l'état doit donc être posé pour
    // partir avec, sinon il se perdrait avec l'éditeur.
    if (startOnLaunch) set("in_progress");
    launchNote(md);
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
  // Le carnet est une surface éditable, où ⇧A c'est aussi « écrire un A ». La
  // règle : la frappe l'emporte tant qu'on édite LA tâche survolée (caret
  // dedans, éditeur au focus) — écrire « Ajouter » sur sa propre ligne ne lance
  // donc jamais rien.
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
  const hoverRef = useHoverKeys((e) => {
    if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = eventKey(e);
    if (key !== "a" && key !== "p") return;
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
  }, !menuOpen);

  return (
    <NodeViewWrapper
      ref={hoverRef}
      as="li"
      data-type="taskItem"
      data-state={state}
      className="group/task flex items-start gap-2.5 rounded-[3px] px-1 hover:bg-muted/50"
      onContextMenu={(e: MouseEvent) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      {/* Wrappers a full text-line tall (text-sm × leading-relaxed) so the box
          and the ⋯ center on the first line, whatever the text wraps to. */}
      <span
        contentEditable={false}
        className="flex h-[1.625rem] shrink-0 items-center"
      >
        <button
          type="button"
          aria-label={t("taskCheckboxAria", { text: node.textContent })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => set(toggled)}
          className={cn(
            "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
            state === "pending" && "border-input hover:border-muted-foreground/60",
            state === "in_progress" && "border-primary",
            state === "completed" &&
              "border-primary bg-primary text-primary-foreground",
            state === "cancelled" && "border-input bg-muted text-muted-foreground"
          )}
        >
          {state === "in_progress" && (
            <span className="size-2 rounded-[2px] bg-primary" />
          )}
          {state === "completed" && <Check className="size-3" />}
          {state === "cancelled" && <Minus className="size-3" />}
        </button>
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

      <span
        contentEditable={false}
        className="flex h-[1.625rem] shrink-0 items-center"
      >
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
                value={tScratch("launchAgent")}
                keywords={["agent", "numo", "launch", "lancer", "run", "coder"]}
                onSelect={() => pick(launchAgent)}
              >
                <Bot />
                {tScratch("launchAgent")}
                {/* Mêmes touches que sur un ticket, affichées au même endroit. */}
                <CommandShortcut>
                  <Kbd size="sm">⇧A</Kbd>
                </CommandShortcut>
              </CommandItem>
              <CommandItem
                value={tScratch("promoteToIssue")}
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
                {tScratch("promoteToIssue")}
              </CommandItem>
              <CommandItem
                value={tScratch("copyLine")}
                keywords={["copy", "copier", "prompt", "agent"]}
                onSelect={() => pick(copyLine)}
              >
                <Copy />
                {tScratch("copyLine")}
                <CommandShortcut>
                  <Kbd size="sm">⇧P</Kbd>
                </CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}
        </SearchMenu>
      </span>
    </NodeViewWrapper>
  );
}

export const ScratchpadTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      state: {
        default: "pending" as PlanTaskState,
        // Entrée en bout de tâche = une tâche NEUVE, donc « à faire » : sans
        // ça, `splitListItem` recopie les attributs de la ligne coupée et la
        // suivante naît déjà cochée (barrée, comptée comme faite). C'est le
        // même réglage que l'attribut `checked` de TaskItem en amont.
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-state") ?? "pending",
        renderHTML: (attributes: { state?: string }) => ({
          "data-state": attributes.state ?? "pending",
        }),
      },
    };
  },

  addNodeView() {
    // pnpm dual @tiptap/core (same 3.27.4 version) — the react renderer's type
    // reads as a different identity than extension-list expects. Runtime is fine.
    return ReactNodeViewRenderer(TaskItemView) as unknown as NodeViewRenderer;
  },

  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: any, node: any) {
          const s = node.attrs.state as PlanTaskState;
          state.write(`${TASK_MARKER_BY_STATE[s] ?? "[ ]"} `);
          state.renderContent(node);
        },
        // Our markdown-it rule sets data-type/data-state directly, so the
        // default checkbox DOM rewrite must not run.
        parse: { updateDOM() {} },
      },
    };
  },
}).configure({ nested: true });

export const ScratchpadTaskList = TaskList.extend({
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(this: { editor: { storage: Record<string, any> } }, state: any, node: any) {
          return state.renderList(
            node,
            "  ",
            () =>
              (this.editor.storage.markdown.options.bulletListMarker || "-") + " "
          );
        },
        parse: {
          setup(markdownit: unknown) {
            scratchpadTaskMarkdownIt(markdownit as never);
          },
        },
      },
    };
  },
});
