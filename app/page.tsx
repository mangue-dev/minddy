"use client";

import { Button, Badge, useTheme } from "mangue-ui";
import { Moon, Sun } from "lucide-react";

export default function Home() {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight">minddy</h1>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle theme"
            onClick={toggleTheme}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          Blank starter wired to <Badge variant="secondary">mangue-ui</Badge>. Edit{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">app/globals.css</code>{" "}
          to retheme — the buttons below use your <code className="rounded bg-muted px-1 py-0.5 text-xs">--primary</code>.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Delete</Button>
        </div>
      </div>
    </main>
  );
}
