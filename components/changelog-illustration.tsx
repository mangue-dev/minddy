"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Shield01Icon, Layout3ColumnIcon, File02Icon, Link01Icon, ChartLineData01Icon,
  ComputerIcon, Mic01Icon, Target01Icon, GitPullRequestIcon, GitMergeIcon,
  CheckIcon, Add01Icon, FlashIcon, Clock01Icon, TaskDone01Icon,
  SmartPhone01Icon, Brain02Icon, Notification01Icon, InboxIcon, LayoutTable01Icon,
  Search01Icon, BubbleChatIcon, RepeatIcon, WorkflowSquare01Icon, SidebarLeft01Icon,
  ComputerTerminal01Icon, ChartIncreaseIcon, Home01Icon, PinIcon, Wrench01Icon,
  DragDropVerticalIcon, ArrowRight02Icon, MinusSignIcon,
} from "@hugeicons/core-free-icons";
import Claude from "@lobehub/icons/es/Claude/components/Mono";
import Gemini from "@lobehub/icons/es/Gemini/components/Mono";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import { NumoFace } from "@/components/numo-face";
import { SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import { Github, Gitlab } from "@/components/git/provider-icons";
import type { ChangelogIllustration as Illustration, ChangelogIllustrationName } from "@/lib/changelog-types";
import styles from "./changelog-illustrations.module.css";

const ICONS = {
  shield: Shield01Icon, board: Layout3ColumnIcon, pages: File02Icon,
  connections: Link01Icon, activity: ChartLineData01Icon, desktop: ComputerIcon,
  microphone: Mic01Icon, relations: Target01Icon, "pull-request": GitPullRequestIcon,
  tabs: Layout3ColumnIcon, triage: TaskDone01Icon, providers: Link01Icon,
  performance: FlashIcon, merge: GitMergeIcon, deadline: Clock01Icon,
  phone: SmartPhone01Icon, memory: Brain02Icon, reminder: Notification01Icon,
  inbox: InboxIcon, database: LayoutTable01Icon, search: Search01Icon,
  conversation: BubbleChatIcon, routines: RepeatIcon, graph: WorkflowSquare01Icon,
  sidebar: SidebarLeft01Icon, "coding-agent": ComputerTerminal01Icon, forecast: ChartIncreaseIcon,
};

function ProductIcon({ name, className }: { name: ChangelogIllustrationName; className?: string }) {
  if (name === "assistant") return <NumoFace className={className} />;
  if (name === "smart-fill") return <HugeiconsIcon icon={SMART_FILL_ICON} className={className} strokeWidth={1.5} />;
  if (name === "smart-assign") return <HugeiconsIcon icon={SMART_ASSIGN_ICON} className={className} strokeWidth={1.5} />;
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
    {triage && <div className={styles.toolbar}><HugeiconsIcon icon={SMART_ASSIGN_ICON} className="size-5" /><Lines short /><HugeiconsIcon icon={CheckIcon} className="size-4 text-emerald-600 dark:text-emerald-400" /></div>}
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

const DONE = "size-4 text-emerald-600 dark:text-emerald-400";

function Phone() {
  return <Surface className={styles.phone}>
    <span className={styles.notch} />
    <div className={styles.phoneBody}>
      <NumoFace className="h-5 w-6 text-primary" /><Lines />
      {[0, 1, 2].map(i => <div key={i} className={styles.phoneRow}><span className={cn(styles.status, styles[`status${i}`])} /><Lines short /></div>)}
    </div>
    <div className={styles.phoneBar}>{[Home01Icon, InboxIcon, Layout3ColumnIcon, File02Icon].map((icon, i) =>
      <HugeiconsIcon key={i} icon={icon} className={cn("size-4", i === 0 ? "text-primary" : "text-muted-foreground")} />)}</div>
  </Surface>;
}

function Memory() {
  return <div className={styles.memory}>
    <NumoFace className={styles.connectionNumo} />
    <div className={styles.memoryNotes}>{[0, 1, 2].map(i => <Surface key={i} className={styles.memoryNote}>
      <HugeiconsIcon icon={PinIcon} className="size-3.5 shrink-0 text-muted-foreground" /><Lines short={i === 1} />
    </Surface>)}</div>
  </div>;
}

function Reminder() {
  return <div className={styles.reminder}>
    <Surface className={styles.reminderRow}><HugeiconsIcon icon={CheckIcon} className={DONE} /><Lines short /></Surface>
    <div className={styles.reminderLink} />
    <Surface className={styles.reminderRow}><ProductIcon name="reminder" className="size-4 shrink-0 text-primary" /><Lines /><span className={styles.tag} /></Surface>
  </div>;
}

function Inbox() {
  return <Surface className={styles.inbox}>
    <div className={styles.toolbar}><ProductIcon name="inbox" className="size-5" /><Lines short /></div>
    {[0, 1, 2].map(i => <div key={i} className={styles.inboxRow}>
      <span className={i < 2 ? styles.unread : styles.read} />
      {i === 0 ? <NumoFace className="h-4 w-5 shrink-0 text-primary" /> : <span className={styles.inboxAvatar} />}
      <Lines short={i === 1} /><i />
    </div>)}
  </Surface>;
}

function Database() {
  return <Surface className={styles.database}>
    {[0, 1, 2, 3].map(row => <div key={row} className={row === 0 ? styles.databaseHead : undefined}>
      <span><i style={{ width: `${[50, 78, 62, 70][row]}%` }} /></span>
      <span>{row === 0 ? <i style={{ width: "45%" }} /> : <b className={cn(styles.status, styles[`status${row - 1}`])} />}</span>
      <span><i style={{ width: `${[40, 30, 48, 36][row]}%` }} /></span>
    </div>)}
    <div className={styles.databaseFoot}><span /><span /><span><i /></span></div>
  </Surface>;
}

function Search() {
  return <Surface className={styles.search}>
    <div className={styles.toolbar}><ProductIcon name="search" className="size-4 text-muted-foreground" /><span className={styles.query} /></div>
    {[0, 1, 2].map(i => <div key={i} className={styles.searchRow}>
      <NumoFace className="h-3.5 w-4 shrink-0 text-muted-foreground" />
      <div><i style={{ width: `${[30, 18, 42][i]}%` }} /><mark /><i style={{ width: `${[25, 40, 12][i]}%` }} /></div>
    </div>)}
  </Surface>;
}

function Conversation() {
  return <div className={styles.conversation}>
    <div className={styles.bubble}><Lines short /></div>
    {[0, 1].map(i => <Surface key={i} className={styles.toolCall}>
      <HugeiconsIcon icon={Wrench01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={styles.headingLine} style={{ width: `${[42, 30][i]}%` }} />
      <HugeiconsIcon icon={CheckIcon} className={cn(DONE, "ml-auto")} />
    </Surface>)}
    <div className={styles.answer}><NumoFace className="h-4 w-5 shrink-0 text-primary" /><Lines /></div>
  </div>;
}

function Routines() {
  return <Surface className={styles.routines}>
    {[0, 1, 2].map(i => <div key={i} className={styles.routineRow}>
      <ProductIcon name="routines" className={cn("size-4 shrink-0", i === 2 ? "text-muted-foreground" : "text-primary")} />
      <Lines short={i === 1} /><span className={styles.tag} /><span className={i === 2 ? styles.switchOff : styles.switch} />
    </div>)}
  </Surface>;
}

function Graph() {
  return <Surface className={styles.graph}>
    <svg viewBox="0 0 200 120" role="presentation">
      {[[30, 30, 88, 60], [34, 92, 88, 60], [88, 60, 142, 26], [88, 60, 134, 94], [142, 26, 134, 94]].map(([x1, y1, x2, y2], i) =>
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      {[[30, 30, 7], [34, 92, 6], [88, 60, 10], [142, 26, 6], [134, 94, 8]].map(([cx, cy, r], i) =>
        <circle key={i} cx={cx} cy={cy} r={r} className={styles[`node${i % 3}`]} />)}
    </svg>
    <div className={styles.zoom}><HugeiconsIcon icon={Add01Icon} className="size-3" /><HugeiconsIcon icon={MinusSignIcon} className="size-3" /></div>
  </Surface>;
}

function Sidebar() {
  return <Surface className={styles.projects}>
    {[0, 1, 2, 3].map(i => <div key={i} className={i === 1 ? styles.dragged : undefined}>
      <span className={styles.projectMark} /><Lines short={i % 2 === 1} />
      {i === 1 && <HugeiconsIcon icon={DragDropVerticalIcon} className="size-3.5 shrink-0 text-muted-foreground" />}
    </div>)}
  </Surface>;
}

function CodingAgent() {
  return <div className={styles.codingAgent}>
    <Surface className={styles.prompt}>
      <div><span className={cn(styles.status, styles.status2)} /><span className={styles.headingLine} /></div>
      <Lines /><Lines short />
    </Surface>
    <HugeiconsIcon icon={ArrowRight02Icon} className="size-5 shrink-0 text-muted-foreground" />
    <Surface className={styles.agentApp}><ProductIcon name="coding-agent" className="size-7" /></Surface>
  </div>;
}

function Forecast() {
  return <Surface className={styles.forecast}>
    <div className={styles.toolbar}><ProductIcon name="forecast" className="size-5" /><Lines short /><span className={styles.tag} /></div>
    <div className={styles.bars}>{[28, 40, 36, 52, 60, 74, 88].map((height, i) =>
      <i key={i} className={i > 4 ? styles.projected : undefined} style={{ height: `${height}%` }} />)}</div>
  </Surface>;
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
    case "phone": return <Phone />;
    case "memory": return <Memory />;
    case "reminder": return <Reminder />;
    case "inbox": return <Inbox />;
    case "database": return <Database />;
    case "search": return <Search />;
    case "conversation": return <Conversation />;
    case "routines": return <Routines />;
    case "graph": return <Graph />;
    case "sidebar": return <Sidebar />;
    case "coding-agent": return <CodingAgent />;
    case "forecast": return <Forecast />;
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
