"use client";

import { useState, type MouseEvent } from "react";
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
  cn,
  toast,
} from "mangue-ui";
import {
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
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { isPlanTaskState, type PlanTaskState } from "@/lib/plan";
import { TASK_MARKER_BY_STATE } from "@/lib/scratchpad";
import { scratchpadTaskMarkdownIt } from "@/components/scratchpad/task-markdown";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useScratchpad } from "@/lib/scratchpad-context";

/**
 * Scratchpad tasks with the plan's FOUR states inside the WYSIWYG editor. The
 * checkbox and the per-line ⋯ menu (set state, promote the note to an issue,
 * copy the line as a prompt) come from a React NodeView; the state persists as
 * the node attribute `state` and round-trips to markdown markers
 * ([ ]/[~]/[x]/[-]) via task-markdown.ts.
 */
function TaskItemView({ node, updateAttributes }: NodeViewProps) {
  const t = useTranslations("Plan");
  const tScratch = useTranslations("Scratchpad");
  const { close: closeScratchpad } = useScratchpad();
  const openAssistant = useAssistantPanel().open;

  const raw = node.attrs.state;
  const state: PlanTaskState = isPlanTaskState(raw) ? raw : "pending";
  const struck = state === "completed" || state === "cancelled";
  const toggled: PlanTaskState = struck ? "pending" : "completed";

  const set = (next: PlanTaskState) => updateAttributes({ state: next });
  const copyLine = () => {
    const text = node.textContent.trim();
    if (!text) return;
    void navigator.clipboard.writeText(
      buildScratchpadPrompt(`- ${TASK_MARKER_BY_STATE[state]} ${text}`, {
        section: true,
      })
    );
    toast.success(tScratch("copiedLineToast"));
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

  // The ⋯ menu is a searchable cmdk palette (SearchMenu), opened from the button
  // or by right-clicking the task; anchored to the ⋯ trigger (Radix positions it
  // transform-aware, unlike a fixed-point anchor inside the dialog).
  const [menuOpen, setMenuOpen] = useState(false);
  const pick = (fn: () => void) => {
    fn();
    setMenuOpen(false);
  };

  return (
    <NodeViewWrapper
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
          onOpenChange={setMenuOpen}
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
          <CommandGroup>
          {state !== "pending" && (
            <CommandItem
              value={t("markPending")}
              keywords={["pending", "todo", "à faire", "a faire"]}
              onSelect={() => pick(() => set("pending"))}
            >
              <Circle />
              {t("markPending")}
            </CommandItem>
          )}
          {state !== "in_progress" && (
            <CommandItem
              value={t("markInProgress")}
              keywords={["in progress", "en cours", "wip"]}
              onSelect={() => pick(() => set("in_progress"))}
            >
              <Play />
              {t("markInProgress")}
            </CommandItem>
          )}
          {state !== "completed" && (
            <CommandItem
              value={t("markCompleted")}
              keywords={["completed", "done", "terminé", "termine", "fait"]}
              onSelect={() => pick(() => set("completed"))}
            >
              <Check />
              {t("markCompleted")}
            </CommandItem>
          )}
          {state !== "cancelled" && (
            <CommandItem
              value={t("cancelTask")}
              keywords={["cancelled", "annulé", "annule", "drop"]}
              onSelect={() => pick(() => set("cancelled"))}
            >
              <CircleSlash />
              {t("cancelTask")}
            </CommandItem>
          )}
          <CommandSeparator className="my-1" />
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
          </CommandItem>
        </CommandGroup>
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
