"use client";

// THE view of a task — that of the notebook, and that of a page.
//
// A task is the same object on both sides: same schema, same four states,
// same round-trip markdown (task-nodes.ts), same checkbox
// (task-checkbox.tsx). This file is the last piece to have been as well:
// the ⋯ menu, hover shortcuts and right click. A project page is
// exactly the place where you write a report that ends in a list
// of actions; entrusting them from there should stop asking to copy them
// in the notebook.
//
// What differed was never the task, only what had to be done
// AROUND when we entrust it: leaving the surface, what prompt packing, what
// tell Numo. These three gestures come from `useTaskSurface()` (task-surface.tsx),
// that the notebook and the page each fill in their own way.
//
// ⚠️ This file imports the `mangue-ui` barrel (SearchMenu, Button, toast), so
// it is NOT importable outside the browser. The page block register, for its part,
// must be (markdown projection, MCP tools, tests — cf. lib/cx.ts): it is
// why no block file names it, and why it's the editor
// page which INJECTS this view during assembly (`pageExtensions({ nodeViews })`),
// as it already does for the mention pill.

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
import { useAuthOptional } from "@/lib/auth-context";
import { useTaskSurface } from "@/components/scratchpad/task-surface";
import { eventKey } from "@/lib/keyboard/event-key";
import { pointerIsStale, useHoverKeys } from "@/lib/keyboard/hover-keys";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";

/** The four states of a task, in lifecycle order. */
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
  // `useAuthOptional` and not `useAuth`: this editor is also mounted OUTSIDE
  // the application, on a published page (MIN-283), where there is no session —
  // and `useAuth` lifted there, taking the page for an account preference of which
  // only menu actions are used.
  const user = useAuthOptional()?.user ?? null;
  // Outside provider (an overview, an editor mounted without surface): the box remains,
  // the rest disappears. See task-surface.tsx.
  const surface = useTaskSurface();

  const raw = node.attrs.state;
  const state: PlanTaskState = isPlanTaskState(raw) ? raw : "pending";
  const struck = taskStruck(state);
  const toggled: PlanTaskState = struck ? "pending" : "completed";

  const set = (next: PlanTaskState) => updateAttributes({ state: next });

  // Entrusting the task to an agent means starting it: the handover does it
  // pass “in progress”, exactly like on a ticket, and with the same two
  // rules — “copy prompt” starts under the count option (MIN-20,
  // Account → Preferences), “launch an agent” always starts (MIN-46). A
  // task already started, checked or canceled does not move in either case.
  //
  // Since the resumption of the subtasks, the gesture concerns the SUB-TREE: a
  // parent that we entrust, it is his children that we entrust with him, and these are
  // them, in turn, that the handover begins. A parent already “in progress” who
  // still has tasks to do so starts them, while he doesn't move.
  const copyStarts = resolvePromptCopyAutoStart(user?.user_metadata);
  const started = (s: PlanTaskState): PlanTaskState =>
    s === "pending" ? "in_progress" : s;

  /** Starts the task and its descendants; returns the number of tasks moved. */
  const startSubtree = (): number => {
    const pos = getPos();
    if (pos == null) return 0;
    return startPendingTasks(editor, pos, pos + node.nodeSize);
  };

  // The markdown that the task carries when it leaves its surface (copy or
  // agent): the task AND ITS SUB-TASKS, markers and levels included,
  // PRECEDED by the titles of the sections which contain it — the only way to tell
  // the agent from which it comes (the prompt reformulates them clearly, cf.
  // lib/scratchpad-prompt.ts). Null if the line is empty.
  //
  // The markers are those of the state AFTER the gesture (like the XML of a ticket
  // copied, cf. issue-card.tsx): a task that the handover starts leaves in
  // `[~]`, not in its previous state — otherwise the prompt would describe as “to
  //do” work that the document says is already in progress.
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
    // The toast only signals the move if it has taken place.
    toast.success(t(moved > 0 ? "copiedLineMovedToast" : "copiedLineToast"));
  };

  // “Promote to ticket”: the note goes as is to Numo, who converts it
  // in real ticket — ask questions rather than inventing if it is too
  // blurred, then removes the note from its surface once the ticket has been created: it lives
  // now in the tracker. Leave the surface before opening the panel
  // (closing the notebook, saving the page) is the work of the provider.
  //
  // The note sent is the SUB-TREE: the sub-tasks are the details of the
  // work, and a ticket written without them is a ticket that loses half of
  // what the note said. A task without children is sent as simple text, like
  // before — no checkbox for a single line.
  const promoteToIssue = () => {
    if (!surface) return;
    const lines = taskItemLines(node).filter((line) => line.text);
    if (lines.length === 0) return;
    const note = lines.length === 1 ? lines[0].text : taskLinesMarkdown(lines);
    surface.promote(note);
  };

  // “Launch an agent” (MIN-84): the line goes into markdown (marker and title
  // section included — the note is the ONLY channel to the agent), packaged
  // by the surface in the SAME prompt as “copy prompt” above; THE
  // compose the Agents page shows it as is, editable, and makes you choose the
  // project before sending.
  //
  // The start takes place HERE, with the gesture, and not with the actual sending: the run is not
  // attached to no task (its note is a simple text, cf.
  //lib/server/agent/launch.ts), so nothing could find the line anymore
  // late. Aborting the composer leaves the task “in progress” — one click to
  // hand over, against a handover which does not mark anything in the normal case.
  const launchAgent = () => {
    if (!surface) return;
    const md = taskMarkdown(true);
    if (!md) return;
    // BEFORE `launchAgent`: the surface records when leaving (the book flushes
    // when unmounting, the page flushes before navigating) — the state must therefore
    // be placed to leave with it, otherwise it would get lost on the way.
    startSubtree();
    surface.launchAgent(md);
  };

  // The ⋯ menu is a searchable cmdk palette (SearchMenu), opened from the button
  // or by right-clicking the task; anchored to the ⋯ trigger (Radix positions it
  // transform-aware, unlike a fixed-point anchor inside the dialog).
  const [menuOpen, setMenuOpen] = useState(false);
  // The four states fit behind a single “Change state” entry: the
  // menu advances one step without closing, like the relationship selector. There
  // search is controlled to leave empty in step 2 — otherwise the text
  // typed to find the entry would then filter the states.
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

  // Shortcuts on hover, like on a ticket card: ⇧A launches the agent,
  // ⇧P copies the line as a prompt. They are placed on the TASK alone — the
  // sections keep their hover buttons, the entire notebook its buttons
  // header, and neither has a shortcut.
  //
  // The notebook like a page are editable surfaces, where ⇧A is also
  // “write an A”. The rule: **typing wins as long as you write**, wherever
  // be the pointer. Writing “Add” on its own line therefore launches nothing
  // — and write on ANOTHER line either, even though the mouse is
  // remained on this one (`pointerIsStale`, cf. hover-keys.ts). The shortcut does not
  // restarts only once the task is targeted again, with a movement of the pointer.
  // A surface that mounts this view must therefore call `noteTyping()` on its
  // keystrokes and `trackPointerFreshness()` the time she lives.
  //
  // Everything that moves from one rendering to another (the actions reread the contents of the
  // node, `getPos` its position) passes through a ref: the listener then remains
  // subscribed from one end of the hover to the other instead of resubscribing on each keystroke.
  const liveRef = useRef({ copyLine, launchAgent, getPos });
  liveRef.current = { copyLine, launchAgent, getPos };

  // The target task is read in the DOM at the time of typing: go from one
  // line to the other then type immediately can no longer launch the agent on the
  // previous (MIN-158). `useHoverKeys` also designates the most important task
  // INTERIOR, which resolves nested tasks — entering the child does not
  // does not move out of the parent, both are hovered over, the child wins.
  //
  // Menu open = you type in your search field: the letter comes back to you.
  const hoverRef = useHoverKeys(
    (e) => {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = eventKey(e);
      if (key !== "a" && key !== "p") return;
      // We type in a field outside the surface (the search for ⋯, a dialog
      // on top): the key is his, the task hovered over has nothing to do with it.
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target) && !editor.view.dom.contains(target)) return;
      // We write IN the surface, elsewhere than on the targeted task: the pointer
      // is nothing more than a vestige of the last movement, the letter wins.
      if (pointerIsStale()) return;
      // We write IN this task: the letter prevails over the shortcut.
      const pos = liveRef.current.getPos();
      if (pos != null && editor.isFocused) {
        const self = editor.state.doc.nodeAt(pos);
        const { from, to } = editor.state.selection;
        if (self && to >= pos && from <= pos + self.nodeSize) return;
      }
      // Hover has the combination: neither the editor nor the dialog sees it.
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
            "text-muted-foreground line-through [&_*]:text-muted-foreground"
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
            tooltip={t("taskActionsAria")}
            align="end"
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("taskActionsAria")}
                onMouseDown={(e) => e.preventDefault()}
                className="size-6 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/task:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <Ellipsis className="size-4" />
              </Button>
            }
          >
            {statePage ? (
              // Step 2: the states, minus the current state — propose it
              // would amount to proposing to do nothing.
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
                {/* Only one entry for the four states, but it keeps all
 their keywords: typing "done" from the first page always finds
, instead of finding nothing. */}
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
                  {/* Same keys as on a ticket, displayed in the same place. */}
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
 * The view, ready to be grafted onto the task node (task-nodes.ts) — by the
 * notebook (scratchpad-task.tsx) as well as by the page editor, which injects it into
 * `pageExtensions({ nodeViews })`.
 */
export function taskItemNodeView(): NodeViewRenderer {
  // pnpm dual @tiptap/core (same 3.27.4 version) — the react renderer's type
  // reads as a different identity than extension-list expects. Runtime is fine.
  return ReactNodeViewRenderer(TaskItemView) as unknown as NodeViewRenderer;
}
