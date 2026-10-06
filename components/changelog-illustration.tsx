"use client";

import { useState, type ReactNode } from "react";
import { cn } from "mangue-ui/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Shield01Icon, Layout3ColumnIcon, File02Icon, Link01Icon, ChartLineData01Icon,
  ComputerIcon, Mic01Icon, Target01Icon, GitPullRequestIcon, GitMergeIcon,
  CheckIcon, Add01Icon, FlashIcon, Clock01Icon, TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { Claude, Gemini, OpenAI } from "@lobehub/icons";
import { NumoFace } from "@/components/numo-face";
import { SmartFillIcon, SmartAssignIcon } from "@/components/smart-icons";
import { Github, Gitlab } from "@/components/git/provider-icons";
import type { ChangelogIllustration as Illustration, ChangelogIllustrationName } from "@/lib/changelog-types";
import styles from "./changelog-illustrations.module.css";

const ICONS = {
  shield: Shield01Icon, board: Layout3ColumnIcon, pages: File02Icon,
  connections: Link01Icon, activity: ChartLineData01Icon, desktop: ComputerIcon,
  microphone: Mic01Icon, relations: Target01Icon, "pull-request": GitPullRequestIcon,
  tabs: Layout3ColumnIcon, triage: TaskDone01Icon, providers: Link01Icon,
  performance: FlashIcon, merge: GitMergeIcon, deadline: Clock01Icon,
};

function ProductIcon({ name, className }: { name: ChangelogIllustrationName; className?: string }) {
  if (name === "assistant") return <NumoFace className={className} />;
  if (name === "smart-fill") return <SmartFillIcon className={className} />;
  if (name === "smart-assign") return <SmartAssignIcon className={className} />;
  return <HugeiconsIcon icon={ICONS[name]} className={className} strokeWidth={1.5} />;
}

function Lines({ short = false }: { short?: boolean }) {
  return <div className={styles.lines}><span /><span className={short ? styles.short : undefined} /></div>;
}

function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(styles.surface, className)}>{children}</div>;
}

function Board({ triage = false }: { triage?: boolean }) {
  return <Surface className={styles.board}>
    {triage && <div className={styles.toolbar}><SmartAssignIcon className="h-5 w-5" /><Lines short /><HugeiconsIcon icon={CheckIcon} className="size-4 text-emerald-600 dark:text-emerald-400" /></div>}
    <div className={styles.columns}>
      {[2, 2, 1].map((count, column) => <div key={column} className={styles.column}>
        <div className={styles.columnHeading}><span className={cn(styles.status, styles[`status${column}`])} /><span className={styles.headingLine} /><HugeiconsIcon icon={Add01Icon} className="size-3" /></div>
        {Array.from({ length: count }, (_, row) => <div key={row} className={styles.ticket}>
          <Lines short={row === 1} /><div className={styles.ticketMeta}><span className={styles.tag} /><span className={styles.avatar} /></div>
        </div>)}
      </div>)}
    </div>
  </Surface>;
}

function PullRequest({ merge = false }: { merge?: boolean }) {
  return <Surface className={styles.pullRequest}>
    <div className={styles.toolbar}><ProductIcon name={merge ? "merge" : "pull-request"} className="size-5 text-violet-500" /><Lines /><span className={styles.tag} /></div>
    {merge ? <div className={styles.checks}>
      {[0, 1, 2].map(row => <div key={row} className={styles.checkRow}>
        <HugeiconsIcon icon={row === 2 ? Clock01Icon : CheckIcon} className={cn("size-4", row === 2 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400")} /><Lines short={row === 1} />
      </div>)}
    </div> : <div className={styles.diff}>
      {[0, 1, 2, 3, 4].map(row => <div key={row} className={row === 1 ? styles.removed : row === 3 ? styles.added : undefined}>
        <span>{row === 1 ? "−" : row === 3 ? "+" : "·"}</span><i style={{ width: `${[72, 55, 82, 64, 40][row]}%` }} />
      </div>)}
    </div>}
  </Surface>;
}

function Relations() {
  return <div className={styles.relations}>
    <Surface className={styles.objective}><ProductIcon name="relations" className="size-6 text-blue-500" /><Lines /><span className={styles.progress}><i /></span></Surface>
    <div className={styles.branches} />
    <div className={styles.relatedIssues}>{[0, 1].map(i => <Surface key={i} className={styles.relatedIssue}><span className={cn(styles.status, styles[`status${i}`])} /><Lines short /></Surface>)}</div>
  </div>;
}

function Tabs() {
  return <Surface className={styles.window}>
    <div className={styles.tabs}>{["board", "pages", "pull-request"].map((name, i) => <div key={name} className={i === 0 ? styles.activeTab : undefined}>
      <ProductIcon name={name as ChangelogIllustrationName} className="size-3.5" /><span />
    </div>)}</div>
    <div className={styles.windowBody}><div className={styles.sidebar}><NumoFace className="h-5 w-6" /><i /><i /><i /></div><div className={styles.windowContent}><Lines /><div className={styles.miniRows}>{[0, 1, 2].map(i => <div key={i}><span className={cn(styles.status, styles[`status${i}`])} /><Lines short /></div>)}</div></div></div>
  </Surface>;
}

function Usage({ deadline = false }: { deadline?: boolean }) {
  return <Surface className={styles.usage}>
    <div className={styles.toolbar}><ProductIcon name={deadline ? "deadline" : "assistant"} className="size-6" /><Lines short /></div>
    <div className={styles.usageValue}><span className={styles.headingLine} /><span className={styles.tag} /></div>
    <div className={styles.meter}><i /><i /><i /></div>
    {deadline ? <div className={styles.timeline}><span /><span /><span /><span /></div> : <div className={styles.legend}>{[0, 1, 2].map(i => <div key={i}><span /><i /></div>)}</div>}
  </Surface>;
}

function Pages() {
  return <Surface className={styles.page}>
    <ProductIcon name="pages" className="size-6 text-muted-foreground" />
    <span className={styles.pageTitle} /><Lines /><Lines short />
    <div className={styles.pageChecklist}><HugeiconsIcon icon={CheckIcon} className="size-3.5" /><span /><span /></div>
  </Surface>;
}

function Connections({ providers = false }: { providers?: boolean }) {
  return <div className={styles.connections}>
    <NumoFace className={styles.connectionNumo} />
    <div className={styles.connectionLine} />
    <div className={styles.services}>
      {(providers ? [<OpenAI key="openai" size={30} />, <Claude key="claude" size={30} />, <Gemini key="gemini" size={30} />]
        : [<Github key="github" className="size-7" />, <Gitlab key="gitlab" className="size-7" />, <ProductIcon key="pages" name="pages" className="size-7" />])
        .map((logo, i) => <Surface key={i} className={styles.service}>{logo}</Surface>)}
    </div>
  </div>;
}

function CodeFigure({ name }: { name: ChangelogIllustrationName }) {
  switch (name) {
    case "board": return <Board />;
    case "triage": return <Board triage />;
    case "pull-request": return <PullRequest />;
    case "merge": return <PullRequest merge />;
    case "relations": return <Relations />;
    case "desktop":
    case "tabs": return <Tabs />;
    case "pages": return <Pages />;
    case "activity": return <Usage />;
    case "deadline": return <Usage deadline />;
    case "connections": return <Connections />;
    case "providers": return <Connections providers />;
    default: return <ProductIcon name={name} className={styles.mark} />;
  }
}

/** Product marks and quiet UI excerpts use the app's own theme, without raster assets. */
export function ChangelogIllustration({ illustration, className, aspectRatio }: { illustration: Illustration; className?: string; aspectRatio?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const name = illustration.kind === "image" ? "pages" : illustration.name;
  const showImage = illustration.kind === "image" && failedUrl !== illustration.url;
  return <div aria-hidden="true" data-illustration={name} style={{ aspectRatio }} className={cn(styles.figure, aspectRatio ? "h-auto" : "h-full", className)}>
    {showImage ? (
      // External illustrations are pre-optimized by the release author and never bundled.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={illustration.url} width={illustration.width} height={illustration.height} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        className="absolute inset-0 size-full object-contain p-4" onError={() => setFailedUrl(illustration.url)} />
    ) : illustration.kind === "icon" || illustration.kind === "image" ? <ProductIcon name={name} className={styles.mark} /> : <CodeFigure name={name} />}
  </div>;
}
