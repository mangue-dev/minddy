"use client";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { isPlanTaskState, type PlanTaskState } from "@/lib/plan";
import {
  TASK_MARKER_BY_STATE,
  scratchpadTaskMarkdownIt,
} from "@/components/scratchpad/task-markdown";

/**
 * Scratchpad tasks with the plan's FOUR states inside the WYSIWYG editor. The
 * checkbox and the per-line ⋯ menu (set state, copy the line as a prompt) come
 * from a React NodeView; the state persists as the node attribute `state` and
 * round-trips to markdown markers ([ ]/[~]/[x]/[-]) via task-markdown.ts.
 */
function TaskItemView({ node, updateAttributes }: NodeViewProps) {
  const t = useTranslations("Plan");
  const tScratch = useTranslations("Scratchpad");

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

  return (
    <NodeViewWrapper
      as="li"
      data-type="taskItem"
      data-state={state}
      className="group/task flex items-start gap-2.5 rounded-md px-1 hover:bg-muted/50"
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
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("taskMenuAria")}
            onMouseDown={(e) => e.preventDefault()}
            className="size-6 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/task:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {state !== "pending" && (
            <DropdownMenuItem onSelect={() => set("pending")}>
              <Circle />
              {t("markPending")}
            </DropdownMenuItem>
          )}
          {state !== "in_progress" && (
            <DropdownMenuItem onSelect={() => set("in_progress")}>
              <Play />
              {t("markInProgress")}
            </DropdownMenuItem>
          )}
          {state !== "completed" && (
            <DropdownMenuItem onSelect={() => set("completed")}>
              <Check />
              {t("markCompleted")}
            </DropdownMenuItem>
          )}
          {state !== "cancelled" && (
            <DropdownMenuItem onSelect={() => set("cancelled")}>
              <CircleSlash />
              {t("cancelTask")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={copyLine}>
            <Copy />
            {tScratch("copyLine")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
