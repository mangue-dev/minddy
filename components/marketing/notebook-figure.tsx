"use client";

import { useState } from "react";
import { Checkbox } from "mangue-ui/components/ui/checkbox";

/** Local checklist interaction, using the product's checkbox component. */
export function NotebookFigure({ title, tasks }: { title: string; tasks: string[] }) {
  const [completed, setCompleted] = useState(() => tasks.map((_, index) => index === 0));
  return (
    <div className="w-full rounded-xl border border-border bg-background p-5 text-foreground shadow-sm">
      <p className="mb-4 text-sm font-medium">{title}</p>
      <ul className="space-y-3">
        {tasks.map((task, index) => (
          <li key={task}>
            <label className="flex min-h-8 cursor-pointer items-start gap-3 text-sm leading-relaxed">
              <Checkbox className="mt-1 shrink-0" checked={completed[index]} onCheckedChange={checked => setCompleted(current => current.map((value, i) => i === index ? checked === true : value))} />
              <span className={completed[index] ? "text-muted-foreground line-through" : ""}>{task}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
