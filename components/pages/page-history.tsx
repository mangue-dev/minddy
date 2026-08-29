"use client";

// One-page HISTORY (MIN-277) — list of previous states, overview
// of one of them, and going back.
//
// It is the agent's net, and that is why it exists: six tools
// writing are open to Numo, MCP and Code Agent, and without this screen
// the only possible response to "the agent overwrote my page" would be "we can't
// do nothing.” Hence two biases which are immediately visible:
//
// 1. **an agent's writing can be recognized in the list** — in the name (“minddy”,
// never that of the account which authorized it) and to its brand. This is the line
//    that we look for when opening this panel.
// 2. **restore is a gesture, not a journey**: a button on the version
// that we read. It does not destroy anything — the state before the restoration enters
// itself in history, therefore restores itself in turn.
//
// The preview shows the REAL editor as `editable: false`, and not a separate rendering:
// the editor IS the surface (see the architecture of mentions). A second rendering
// would end up diverging on exactly the blocks we look at least.
//
// ─── THE FURNITURE is that of a ticket (MIN-282) ──────────────────────────────
//
// `SidePanel`, exactly like the ticket panel: same margins, same
// radius, same shadow, same drawer switch under 480 px, and the same grammar
// inside — title on the left, round cross on the right, full underlined tabs
// width, body in `px-6` which scrolls in one block.
//
// What it cost, and that's the only thing this panel loses: the preview doesn't
// no longer opens in a SECOND column next to the list. A panel for two
// 900 px panes didn't exist anywhere else in the app — it was
// precisely the reproach. The chosen version therefore unfolds UNDER its line, with
// its restore button, in the same card: the vocabulary of the threads of
// comments (bordered card, internal separators), which we read everywhere else.
//
// ─── And the ACTIVITY next to it (MIN-278) ──────────────────── ─────────────────────
//
// A second tab, in the same panel, because the question is the same —
// “what happened to this page?” » — and that it arises in the same place: in
// reading "edited by someone else" at the top of the page. Two tabs and
// not a list, because the two answers are not of the same nature: the
// versions are STATES that we reread and put back in place, the activity of
// GESTURES — including those that leave no state behind them (created, released
// trash, restored, renamed).

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  SidePanelTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toast,
} from "mangue-ui";
import { ChevronDown, RotateCcw, X } from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";

import {
  fetchPageVersionApi,
  fetchPageVersionsApi,
  restorePageVersionApi,
} from "@/lib/pages-api";
import { pageKey, pagesKey } from "@/lib/use-pages-query";
import { TAB_LIST_DENSE, TAB_TRIGGER_DENSE } from "@/components/tab-bar";
import { PageEditor } from "@/components/pages/page-editor";
import { PageActivity, PageCommentBar } from "@/components/pages/page-activity";
import { McpAvatar, NumoAvatar } from "@/components/actor-avatars";
import { UserAvatar } from "@/components/user-avatar";
import { useMembersQuery } from "@/lib/use-members-query";
import type { Member } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import type { PageVersion } from "@/lib/pages";

/** The announced shelf life, the same as the basket (30 days). */
const RETENTION_DAYS = 30;

export type PageHistoryTab = "versions" | "activity";

export function PageHistorySheet({
  projectId,
  pageId,
  open,
  initialTab = "activity",
  onOpenChange,
  onRestored,
}: {
  projectId: string;
  pageId: string;
  open: boolean;
  /** Which question opened the panel: comments/activity, or saved versions. */
  initialTab?: PageHistoryTab;
  onOpenChange: (open: boolean) => void;
  /**
   * The page has just been rewritten: the open editor behind is holding a document
   * and a `version` now expired, and tiptap does not reread its `content`.
   * The caller therefore goes back to the surface (see page-view.tsx).
   */
  onRestored: () => void;
}) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // MEMBERS, for the face of the human authors of history: the seed
  // of an avatar lives on the member, never on the version line (it does not
  // carries only an id and a name already resolved). The same cache as everywhere else.
  const { members } = useMembersQuery(projectId, open);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<PageHistoryTab>(initialTab);

  // Each header button names the question it opens. Do not reuse the tab from a
  // previous visit: Comments opens activity and the save indicator opens versions.
  useEffect(() => {
    setSelected(null);
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const versions = useQuery({
    queryKey: ["page-versions", pageId],
    queryFn: () => fetchPageVersionsApi(projectId, pageId),
    // Like the newspaper next door: the list only goes to get its lines
    // when you look at it. It is the ACTIVITY which opens the panel now,
    // so without this guard each opening would pay a request for a
    // tab that no one asked for.
    enabled: open && tab === "versions",
    // History changes with each writing, one's own as well as that of another:
    // we ask for it again each time we open it rather than painting a cover.
    refetchOnMount: "always",
    staleTime: 0,
  });

  const preview = useQuery({
    queryKey: ["page-version", pageId, selected],
    queryFn: () => fetchPageVersionApi(projectId, pageId, selected as string),
    enabled: open && !!selected,
  });

  const restore = useMutation({
    mutationFn: (versionId: string) =>
      restorePageVersionApi(projectId, pageId, versionId),
    onSuccess: () => {
      toast.success(t("historyRestored"));
      void queryClient.invalidateQueries({ queryKey: pageKey(pageId) });
      // The LIST too: a restoration brings back the title and the icon of the
      // version, and it is this cache that the sidebar, the breadcrumbs, read,
      // the subpage block — and the title displayed at the top. Without this line, they
      // keep the old name for five minutes (the `staleTime` of the repository), on a
      // page whose body has changed a lot before our eyes.
      void queryClient.invalidateQueries({ queryKey: pagesKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ["page-versions", pageId] });
      onOpenChange(false);
      onRestored();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t("historyRestoreFailed"));
    },
  });

  const rows = versions.data ?? [];

  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent
        // A little wider than a ticket panel (460 px): what we read
        // here is a DOCUMENT, not a three line description. Enough for
        // that the titles and lists of the body keep their air, quite narrow
        // to remain a sidebar.
        className="w-[min(560px,calc(100vw-2rem))]"
        // The composer of the Activity tab carries a suggested mention,
        // rendered as a portal OUTSIDE the panel: otherwise, choose a name in the
        // list counted as clicking out and closing everything.
        onInteractOutside={keepOverlayOpenForPopper}
      >
        {/* Header, in the grammar of a ticket panel: the title to
            left, the round buttons on the right, and no lines — that's the line
            tabs that separate. */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-3">
          <SidePanelTitle asChild>
            <span className="text-lg font-semibold tracking-tight">
              {t("activityTitle")}
            </span>
          </SidePanelTitle>
          <div className="-mr-1.5 flex items-center gap-0.5">
            <SidePanelClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tCommon("close")}
                className="rounded-full text-muted-foreground hover:text-foreground"
              >
                <X />
              </Button>
            </SidePanelClose>
          </div>
        </div>

        <SidePanelBody className="flex flex-col gap-4 pt-0">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as PageHistoryTab)}
          >
            <TabsList variant="line" className={TAB_LIST_DENSE}>
              <TabsTrigger value="activity" className={TAB_TRIGGER_DENSE}>
                {t("historyTabActivity")}
              </TabsTrigger>
              <TabsTrigger value="versions" className={TAB_TRIGGER_DENSE}>
                {t("historyTabVersions")}
              </TabsTrigger>
            </TabsList>

            {/* THE ACTIVITY (MIN-278): GESTURES, where the next tab makes
                the STATES. `enabled` follows the tab — the newspaper does not search
                its lines only when you look at it. */}
            <TabsContent value="activity" className="mt-4">
              <PageActivity
                projectId={projectId}
                pageId={pageId}
                currentUserId={user?.id ?? null}
                enabled={open && tab === "activity"}
              />
            </TabsContent>

            <TabsContent value="versions" className="mt-4 flex flex-col gap-3">
              {versions.isPending ? (
                <div className="flex justify-center py-8">
                  <Spinner className="size-4 text-muted-foreground" />
                </div>
              ) : versions.error ? (
                <p className="py-6 text-xs text-muted-foreground">
                  {t("historyLoadFailed")}
                </p>
              ) : rows.length === 0 ? (
                // A page that has just been created has nothing behind it. say it
                // is better than an empty column that we would mistake for a failure.
                <p className="py-6 text-xs text-muted-foreground">
                  {t("historyEmpty")}
                </p>
              ) : (
                <>
                  <ol className="flex flex-col gap-2">
                    {rows.map((version) => (
                      <VersionCard
                        key={version.id}
                        version={version}
                        members={members}
                        label={versionLabel(version, t, format)}
                        open={version.id === selected}
                        onToggle={() =>
                          setSelected((current) =>
                            current === version.id ? null : version.id
                          )
                        }
                        preview={
                          version.id === selected
                            ? {
                                pending: preview.isPending,
                                failed: !!preview.error,
                                data: preview.data ?? null,
                              }
                            : null
                        }
                        restoring={restore.isPending}
                        onRestore={() => restore.mutate(version.id)}
                      />
                    ))}
                  </ol>
                  {/* Retention is stated UNDER the list, not in the header: this
                      is not what we come to look for, it is what we get
                      demande en arrivant au bout. */}
                  <p className="text-xs text-muted-foreground">
                    {t("historyDescription", { days: RETENTION_DAYS })}
                  </p>
                </>
              )}
            </TabsContent>

          </Tabs>
        </SidePanelBody>

        {/* The dialer is FIXED, at the bottom of the panel — exactly like the one
            of a ticket. We write after reading, therefore after scrolling:
            a field placed at the end of the list moves away as you go down.
            Only on the Activity tab: nothing to comment on a list of
            versions, and an inert field before the eyes is a false promise. */}
        {tab === "activity" && (
          <SidePanelFooter className="border-t-0 pt-3 sm:flex-row">
            <PageCommentBar projectId={projectId} pageId={pageId} />
          </SidePanelFooter>
        )}
      </SidePanelContent>
    </SidePanel>
  );
}

/**
 * THE FACE of a version author — the same vocabulary as the timeline of a
 * ticket, where we already recognize Numo, an MCP key and a colleague without reading.
 *
 * Three cases, and the order between them is minddy's identity rule:
 *
 * • a KEY AGENT writing bears the logo of his agent — Claude Code,
 * Cursor… — because it was HE who acted, never the bearer of the key;
 * • all other agent writing is that of Numo, and bears his face. It is
 * also the fallback of versions before MIN-282, which did not keep the key;
 * • a HUMAN writing bears the portrait of its author, sown since the
 * member. An author who left the project no longer has a seed to borrow: his name
 * actually a stable one, like in the timeline.
 */
function VersionAvatar({
  version,
  members,
}: {
  version: PageVersion;
  members: Member[];
}) {
  const t = useTranslations("Pages");
  if (version.author_kind === "agent") {
    return (
      <span className="shrink-0" aria-label={t("writtenByAgent")}>
        {version.author_agent ? (
          <McpAvatar agent={version.author_agent} />
        ) : (
          <NumoAvatar />
        )}
      </span>
    );
  }
  const seed =
    (version.author_id
      ? members.find((m) => m.user_id === version.author_id)?.avatar_seed
      : null) ?? version.author_name;
  return <UserAvatar seed={seed} className="size-5 shrink-0" />;
}

/**
 * The preview of a version, BORNE in height - around fifteen lines, then we
 * scrolls inside.
 *
 * Without that, unfolding a page of three hundred lines unfolds three hundred lines
 * in the panel: the next card is screens away, and the LIST —
 * who is what we came to read — disappears. The preview is used to recognize a
 * state, not to reread it in full; for that there is the page.
 *
 * The GRADIENT is not a decoration: without it, the last visible line is
 * cut cleanly and nothing distinguishes “the document stops here” from “it continues
 * lower.” It therefore only appears when there is really something left to
 * read, and erases once at the bottom.
 */
function PreviewScroller({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      // A tolerance of one pixel: the fractional heights of a zoom
      // browser otherwise leave the gradient on at the bottom of the stroke.
      setMore(remaining > 1);
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // The editor is mounted AFTER this rendering (`immediatelyRender: false`): without
    // observe, we would measure a still empty container and the gradient
    // would never appear.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={box}
        className="scrollbar-quiet max-h-[22rem] overflow-y-auto overscroll-contain"
      >
        {children}
      </div>
      {more && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
        />
      )}
    </div>
  );
}

/** “minddy · 2 hours ago” — the author, then the when. */
function versionLabel(
  version: PageVersion,
  t: ReturnType<typeof useTranslations<"Pages">>,
  format: ReturnType<typeof useFormatter>
): string {
  return t("historyBy", {
    name: version.author_name || t("someone"),
    time: format.relativeTime(new Date(version.created_at), new Date()),
  });
}

/**
 * A version, in MAP — the same as that of a comments thread: lined,
 * basemap, internal separators in `border-border/60`. It unfolds on
 * the preview of its document and the button that puts it back in place, rather than
 * to send the gaze into a second column.
 */
function VersionCard({
  version,
  members,
  label,
  open,
  onToggle,
  preview,
  restoring,
  onRestore,
}: {
  version: PageVersion;
  members: Member[];
  label: string;
  open: boolean;
  onToggle: () => void;
  /** The preview of THIS version — null while collapsed. */
  preview: { pending: boolean; failed: boolean; data: PageVersion | null } | null;
  restoring: boolean;
  onRestore: () => void;
}) {
  const t = useTranslations("Pages");

  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-colors",
        open ? "border-border" : "border-border/60"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left outline-none"
      >
        <VersionAvatar version={version} members={members} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {version.title || t("untitled")}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 px-3.5 py-3">
          {preview?.pending ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4 text-muted-foreground" />
            </div>
          ) : preview?.failed || !preview?.data ? (
            <p className="py-4 text-sm text-muted-foreground">
              {t("historyLoadFailed")}
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate font-display text-lg font-semibold tracking-tight">
                  {preview.data.icon ? `${preview.data.icon} ` : ""}
                  {preview.data.title || t("untitled")}
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={restoring}
                  onClick={onRestore}
                >
                  {restoring ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  {t("historyRestore")}
                </Button>
              </div>
              {/* `key` on the id: tiptap does not reread its `content`, so pass
                  from one version to another requires new assembly. */}
              <PreviewScroller>
                <PageEditor
                  key={preview.data.id}
                  editable={false}
                  initialContent={(preview.data.content as JSONContent | null) ?? null}
                  onChange={() => {}}
                />
              </PreviewScroller>
            </>
          )}
        </div>
      )}
    </li>
  );
}
