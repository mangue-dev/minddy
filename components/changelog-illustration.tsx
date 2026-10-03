"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Shield01Icon, DashboardSquare01Icon, SparklesIcon, File01Icon, Link01Icon, ChartLineData01Icon, ComputerIcon } from "@hugeicons/core-free-icons";
import type { ChangelogIllustration as Illustration } from "@/lib/changelog-types";

const ICONS = { shield: Shield01Icon, board: DashboardSquare01Icon, assistant: SparklesIcon,
  pages: File01Icon, connections: Link01Icon, activity: ChartLineData01Icon, desktop: ComputerIcon };
const TONES = {
  shield: "from-violet-500/20 via-violet-500/5 to-transparent text-violet-600 dark:text-violet-300",
  board: "from-blue-500/20 via-blue-500/5 to-transparent text-blue-600 dark:text-blue-300",
  assistant: "from-orange-500/20 via-orange-500/5 to-transparent text-orange-600 dark:text-orange-300",
  pages: "from-emerald-500/20 via-emerald-500/5 to-transparent text-emerald-600 dark:text-emerald-300",
  connections: "from-cyan-500/20 via-cyan-500/5 to-transparent text-cyan-600 dark:text-cyan-300",
  activity: "from-pink-500/20 via-pink-500/5 to-transparent text-pink-600 dark:text-pink-300",
  desktop: "from-indigo-500/20 via-indigo-500/5 to-transparent text-indigo-600 dark:text-indigo-300",
};

/** Reusable CSS figures keep historical releases out of the image bundle. */
export function ChangelogIllustration({ illustration }: { illustration: Illustration }) {
  const [failed, setFailed] = useState(false);
  const name = illustration.kind === "image" ? "pages" : illustration.name;
  return (
    <div aria-hidden className={`relative flex h-full min-h-44 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${TONES[name]}`}>
      {illustration.kind === "image" && !failed ? (
        // External illustrations are pre-optimized by the release author and never bundled.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={illustration.url} width={illustration.width} height={illustration.height}
          alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-contain p-4" onError={() => setFailed(true)} />
      ) : illustration.kind === "icon" || failed ? (
        <HugeiconsIcon icon={ICONS[name]} className="size-20 opacity-80" strokeWidth={1.3} />
      ) : name === "board" ? (
        <div className="grid w-4/5 max-w-64 rotate-[-4deg] grid-cols-3 gap-2 rounded-2xl border border-current/10 bg-background/80 p-3 shadow-lg shadow-blue-500/5">
          {[0, 1, 2].map(column => <div key={column} className="space-y-2">
            <div className="h-1.5 w-8 rounded-full bg-current/25" />
            {[0, 1, 2].slice(0, 3 - column).map(row => <div key={row} className="rounded-lg border border-current/10 bg-current/5 p-2">
              <div className="mb-2 h-1 w-3/4 rounded-full bg-current/25" /><div className="h-1 w-1/2 rounded-full bg-current/10" />
            </div>)}
          </div>)}
        </div>
      ) : name === "pages" ? (
        <div className="relative h-32 w-36">
          <div className="absolute inset-0 rotate-12 rounded-xl border border-current/15 bg-background/70" />
          <div className="absolute inset-0 -rotate-6 rounded-xl border border-current/20 bg-background p-4 shadow-lg shadow-emerald-500/5">
            <HugeiconsIcon icon={File01Icon} className="mb-3 size-7" />
            {[75, 100, 85, 60].map(width => <div key={width} className="mb-2 h-1.5 rounded-full bg-current/15" style={{ width: `${width}%` }} />)}
          </div>
        </div>
      ) : name === "activity" ? (
        <div className="flex h-28 w-44 items-end gap-3 border-b border-current/15 pb-2">
          {[28, 45, 38, 66, 82, 100].map(height => <div key={height} style={{ height: `${height}%` }} className="flex-1 rounded-t-md bg-current/25 last:bg-current/60" />)}
        </div>
      ) : name === "connections" ? (
        <div className="relative flex size-36 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-dashed border-current/25" />
          <div className="absolute inset-5 rounded-full border border-current/15" />
          <div className="rounded-2xl border border-current/15 bg-background/90 p-4 shadow-sm"><HugeiconsIcon icon={Link01Icon} className="size-9" /></div>
          {["top-0 left-1/2", "bottom-2 left-3", "bottom-2 right-3"].map(position => <span key={position} className={`absolute ${position} size-5 rounded-md border border-current/25 bg-background`} />)}
        </div>
      ) : name === "desktop" ? (
        <div className="w-44 -rotate-3 rounded-xl border border-current/20 bg-background/90 p-2 shadow-lg shadow-indigo-500/5">
          <div className="mb-2 flex gap-1">{[0, 1, 2].map(i => <span key={i} className="size-1.5 rounded-full bg-current/25" />)}</div>
          <div className="flex h-24 items-center justify-center rounded-lg bg-current/5"><HugeiconsIcon icon={ComputerIcon} className="size-12" strokeWidth={1.3} /></div>
        </div>
      ) : (
        <div className="relative flex size-36 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-current/10" />
          <div className="absolute inset-3 rounded-full bg-current/5" />
          <div className="absolute inset-7 rounded-full border border-current/15 bg-background/50" />
          <HugeiconsIcon icon={ICONS[name]} className="relative size-16" strokeWidth={1.3} />
        </div>
      )}
    </div>
  );
}
