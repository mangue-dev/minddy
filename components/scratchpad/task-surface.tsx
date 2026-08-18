"use client";

// WHAT THE SIGHT OF A TASK CANNOT KNOW — and that its surface knows.
//
// A task is the same object in the notebook and in a page (task-nodes.ts);
// its view is therefore the same (task-item-view.tsx). What is different is never the
// task: this is what needs to be done AROUND when given it.
//
// - EXIT: the notebook is a modal, and its disassembly flushes the autosave
// (scratchpad-editor.tsx); a page does not close, it writes what
// drags before letting the navigation go.
// - THE PROMPT: the notes in the notebook are reread with `minddy_get_scratchpad`,
// a page with `minddy_get_page` — and a page task comes from a document
//    that has a name, what the agent must read.
// - PROMOTE: the wording addressed to Numo names where the note comes from.
//
// Hence this context, and its form: three GESTUREs already decided, not three settings
// that the view would have to recombine. The view calls `launchAgent(md)`; what he
// what happens to the surface, what prompt we are packing and what project we are talking about
// is none of its business — this is exactly what allows it to be the same
// two sides.

import { createContext, useContext, type ReactNode } from "react";

export interface TaskSurface {
  /**
 * The prompt to put on the clipboard for this task. Receives the
 * markdown carried by the task — the titles of its section, then the task and
 * its subtasks (see task-item-view.tsx).
 */
  copyPrompt: (markdown: string) => string;

  /**
 * Entrust the task to an agent: leave the surface (by saving what
 * is lying around), start the agent page and navigate there. Receives the
 * same markdown as `copyPrompt`.
 */
  launchAgent: (markdown: string) => void;

  /**
 * Promote the note to a ticket: leave the surface and open Numo with the
 * request. Receives the TEXT of the task (and its subtasks), not a
 * prompt — the wording belongs to the surface, which alone knows where the
 * note sort.
 */
  promote: (note: string) => void;
}

const TaskSurfaceContext = createContext<TaskSurface | null>(null);

export function TaskSurfaceProvider({
  value,
  children,
}: {
  value: TaskSurface;
  children: ReactNode;
}) {
  return (
    <TaskSurfaceContext.Provider value={value}>
      {children}
    </TaskSurfaceContext.Provider>
  );
}

/**
 * The surface that carries the task. `null` outside of any provider — the view renders
 * then the checkbox alone, without menu ⋯ or shortcuts: a task remains
 * checkable everywhere, but nothing is entrusted from a surface which has not said
 * what “entrust” means at home.
 */
export function useTaskSurface(): TaskSurface | null {
  return useContext(TaskSurfaceContext);
}
