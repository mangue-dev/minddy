"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  Switch,
  toast,
} from "mangue-ui";
import { ArrowUpDown, Check, ChevronDown, ListFilter, Mic, MessagesSquare, Megaphone, Search } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { EmptyScene } from "@/components/empty-scene";
import { MarkdownEditor } from "@/components/markdown-editor";
import { NumoIcon } from "@/components/numo-icon";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { SendShortcutTooltip, isSendShortcut } from "@/components/send-shortcut";
import { HelpHint } from "@/components/settings/help-hint";
import { SidebarFilterField, matchesFilter } from "@/components/sidebar-filter-field";
import { useFeedbackDictation } from "@/lib/use-feedback-dictation";
import {
  FEEDBACK_PUBLIC_STATUSES,
  FEEDBACK_TO_ISSUE_STATUS,
  type PublicIdentity,
  type PublicPost,
  type PublicProject,
  type PublicStatusFilter,
  type SimilarPost,
} from "@/lib/feedback/types";
import { createPostAction, dictateFeedbackAction, findSimilarPostsAction } from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { StatusIndicator } from "@/components/issue-indicators";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  FeedbackPostRow,
} from "./feedback-bits";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

/**
 * Public board list (MIN-37) — UserJot-style structure: filter bar
 * by status + sorting, author/title/excerpt lines with vote in pill, sidebar
 * “Share feedback” (dialog composer with live suggestion “exists
 * maybe already). Any action requiring an identity goes through the door
 * OTP, then automatically replays the action.
 */

const SIMILAR_DEBOUNCE_MS = 1000;
const SIMILAR_MIN_CHARS = 15;

export function FeedbackBoardClient({
  token,
  basePath,
  project,
  posts,
  sort,
  filter,
  boardEmpty,
  identity,
  ssoError,
}: {
  token: string;
  /** Public prefix of links: /f/<token>, or "" on custom domain. */
  basePath: string;
  /** The product: name (status tooltips) and icon (“Team responded” badge). */
  project: PublicProject;
  posts: PublicPost[];
  sort: "top" | "recent";
  /** null = the board's fault: the returns still alive. */
  filter: PublicStatusFilter;
  /** No public feedback, separate filter — separates the two empty states. */
  boardEmpty: boolean;
  identity: PublicIdentity | null;
  ssoError: boolean;
}) {
  const t = useTranslations("PublicFeedback");
  const [authOpen, setAuthOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pendingAfterAuth = useRef<(() => void) | null>(null);

  const requireAuth = (run: () => void) => {
    if (identity) {
      run();
    } else {
      pendingAfterAuth.current = run;
      setAuthOpen(true);
    }
  };

  // The search works on the already loaded page, in place and without going-
  // return — the same gesture as the app's sidebar filters, and the same
  // match function (words, without accents, title AND body).
  const query = search.trim();
  const visible = query
    ? posts.filter((post) => matchesFilter(query, [post.title, post.body]))
    : posts;

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-8 px-4 pb-16 pt-4 desktop:px-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {ssoError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("ssoError")}
          </p>
        )}

        <Button className="desktop:hidden" onClick={() => setComposerOpen(true)}>
          <Megaphone />
          {t("composerTitle")}
        </Button>

        <FilterBar
          basePath={basePath}
          sort={sort}
          filter={filter}
          search={search}
          onSearchChange={setSearch}
          // A board without the slightest public feedback has nothing to look for: the
          // field there would promise a list that does not exist.
          searchable={!boardEmpty}
        />

        {visible.length === 0 ? (
          query ? (
            /* The void of SEARCH, not that of the filter: it names the words
               typed, and the output it suggests is to erase them — not
               to widen the filter, which is not what has just emptied the
               liste. */
            <EmptyScene icon={Search} title={t("emptySearch", { query })}>
              <Button variant="outline" onClick={() => setSearch("")}>
                {t("emptySearchClear")}
              </Button>
            </EmptyScene>
          ) : (
            /* The void is NAMED: “no open return” says both what
               missing and under what filter we look, where “nothing matches”
               let's figure out which one. And the default board only shows the
               living returns: empty here does not mean empty quite simply, it is
               the server that decides (`boardEmpty`), not the filter. */
            <EmptyScene
              icon={MessagesSquare}
              title={
                boardEmpty || filter === "all"
                  ? t("empty")
                  : // Key assembled at runtime (lib/i18n-keys.ts).
                    t(`emptyStatus.${filter ?? "open"}` as MessageKey<"PublicFeedback">)
              }
            >
              {boardEmpty || filter === "all" ? (
                <Button onClick={() => setComposerOpen(true)}>
                  <Megaphone />
                  {t("composerTitle")}
                </Button>
              ) : (
                /* The output of the filter, under the sentence which has just named it: the
                   combobox is a 20 px dot at the top of the page, and it's here
                   that we wonder where the other returns have gone. */
                <Button variant="outline" asChild>
                  <Link href={buildHref(basePath, sort, "all")}>{t("emptySeeAll")}</Link>
                </Button>
              )}
            </EmptyScene>
          )
        ) : (
          <>
            {/* Cards, therefore air between them: the net that separated them
                stuck two returns together, and a stopped hover background
                net on this net read like a rendering error. */}
            <ul className="-mx-3 flex flex-col gap-0.5">
              {visible.map((post) => (
                <FeedbackPostRow
                  key={post.id}
                  token={token}
                  href={`${basePath}/p/${post.id}`}
                  post={post}
                  project={project}
                  onNeedAuth={requireAuth}
                />
              ))}
            </ul>
            <EndOfList filter={filter} query={query} />
          </>
        )}
      </div>

      <aside className="hidden w-64 shrink-0 desktop:block">
        {/* The button is CENTERED on the header strip, like the triggers of
            filter centers there — not on the top of the column, nor on the net.
            The strip is 24 px (`h-6`, the same as that of FilterBar); THE
            button makes 36 (`h-9`) and therefore overflows by 6 px on both sides,
            symmetrically. FIXED height, otherwise the box stretches to the size of the
            button and “center” no longer means anything (MIN-255). */}
        <div className="flex h-6 items-center">
          <Button className="w-full" onClick={() => setComposerOpen(true)}>
            <Megaphone />
            {t("composerTitle")}
          </Button>
        </div>
      </aside>

      <ComposerDialog
        token={token}
        basePath={basePath}
        identified={!!identity}
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onNeedAuth={requireAuth}
      />
      <FeedbackAuthDialog
        token={token}
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuthed={() => {
          const run = pendingAfterAuth.current;
          pendingAfterAuth.current = null;
          run?.();
        }}
      />
    </div>
  );
}

// ── Filtres par statut + tri ─────────────────────────────────────────────────

function buildHref(
  basePath: string,
  sort: "top" | "recent",
  filter: PublicStatusFilter
): string {
  const params = new URLSearchParams();
  if (sort === "recent") params.set("sort", "recent");
  // The default is the ABSENCE of a parameter: the board URL remains the board URL.
  if (filter) params.set("status", filter);
  const query = params.toString();
  // basePath "" (custom domain): the root of the board is "/".
  return `${basePath || "/"}${query ? `?${query}` : ""}`;
}

/**
 * The state filter, in ONE trigger.
 *
 * It was six tablets online, which spilled over onto mobile and gave the
 * same visual weight to “Open” as to “Declined” — while one is what we
 * comes to see and the other what we rarely come to look for. The same combo box
 * searchable that the dashboard folds it: “Open” first, which is the point
 * starting point and groups the three living states, the exact states then, “all”
 * last for those who want the archive.
 */
function StatusFilterMenu({
  basePath,
  sort,
  filter,
}: {
  basePath: string;
  sort: "top" | "recent";
  filter: PublicStatusFilter;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const label =
    filter === null
      ? t("filterOpen")
      : filter === "all"
        ? t("filterAll")
        : t(`status.${filter}`);

  const pick = (next: PublicStatusFilter) => {
    setOpen(false);
    router.push(buildHref(basePath, sort, next));
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="start"
      searchPlaceholder={t("filterSearch")}
      trigger={
        <button
          type="button"
          className="flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ListFilter className="size-3" />
          {label}
          <ChevronDown className="size-3" />
        </button>
      }
    >
      <CommandGroup>
        {/* The cmdk `value` is the IDENTITY of the lines, not a label:
            the “Open” group and the `open` status shared
            “filter-open”, and cmdk therefore turned on both at once. Two
            distinct prefixes, and the question no longer arises. */}
        <CommandItem
          value="group-open"
          keywords={[t("filterOpen")]}
          onSelect={() => pick(null)}
          {...checkedProps(filter === null)}
        >
          <span className="truncate">{t("filterOpen")}</span>
        </CommandItem>
        {FEEDBACK_PUBLIC_STATUSES.map((value) => (
          <CommandItem
            key={value}
            value={`status-${value}`}
            keywords={[t(`status.${value}`)]}
            onSelect={() => pick(value)}
            {...checkedProps(filter === value)}
          >
            <StatusIndicator
              status={FEEDBACK_TO_ISSUE_STATUS[value]}
              className="size-4 shrink-0"
            />
            <span className="truncate">{t(`status.${value}`)}</span>
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandSeparator className="my-1" />
      <CommandGroup>
        <CommandItem
          value="filter-all"
          keywords={[t("filterAll")]}
          onSelect={() => pick("all")}
          {...checkedProps(filter === "all")}
        >
          <span className="truncate">{t("filterAll")}</span>
        </CommandItem>
      </CommandGroup>
    </SearchMenu>
  );
}

/**
 * The header bar of the board: search, filter, sort — in that order.
 *
 * The order is that of the question we ask ourselves: “is my need
 * already there? » first, and only then “show me what is planned” or
 * “most voted”. The search takes its place, the two triggers are
 * row to the right, side by side, because they do the same thing — restrict
 * then order the same list.
 *
 * The field is that of sidebars (`SidebarFilterField`): neither border nor background,
 * the discrete grammar of the app's filters. A real search box
 * lined, at the top of a public page, would read like the SITE search.
 */
function FilterBar({
  basePath,
  sort,
  filter,
  search,
  onSearchChange,
  searchable,
}: {
  basePath: string;
  sort: "top" | "recent";
  filter: PublicStatusFilter;
  search: string;
  onSearchChange: (value: string) => void;
  searchable: boolean;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  return (
    // `min-h-6` freezes the height of the strip at 24 px — that of the triggers
    // filtered. It is on this strip, and not on the net, that the
    // “Share Feedback” button in the right column.
    <div className="flex min-h-6 items-center gap-3 border-b border-border/60 pb-3">
      {searchable ? (
        <SidebarFilterField
          value={search}
          onChange={onSearchChange}
          placeholder={t("searchPlaceholder")}
          clearLabel={t("searchClear")}
        />
      ) : (
        <span className="flex-1" />
      )}
      <StatusFilterMenu basePath={basePath} sort={sort} filter={filter} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowUpDown className="size-3" />
            {sort === "top" ? t("sortTop") : t("sortRecent")}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(["top", "recent"] as const).map((value) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => router.push(buildHref(basePath, value, filter))}
            >
              {value === "top" ? t("sortTop") : t("sortRecent")}
              {sort === value && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The end of the list, SAY.
 *
 * A board ends with nothing: the page stops, and nothing says if we have everything
 * seen or if the loading stopped there. The line closes the list — and it
 * name what it is the end of, because it is almost never "all
 * returns”: the board opens onto the living, and the resolute ones are
 * behind a filter that we haven't opened yet.
 */
function EndOfList({ filter, query }: { filter: PublicStatusFilter; query: string }) {
  const t = useTranslations("PublicFeedback");
  return (
    <p className="pt-2 text-center text-xs text-muted-foreground">
      {query
        ? t("endOfSearch")
        : // Key assembled at runtime (lib/i18n-keys.ts): “all” and the
          // exact statuses are keys in their own right, `null` falls on
          // “open” as the empty state already does.
          t(`endOfList.${filter ?? "open"}` as MessageKey<"PublicFeedback">)}
    </p>
  );
}

// ── Composeur (dialog) ────────────────────────────────────────────────────────

function ComposerDialog({
  token,
  basePath,
  identified,
  open,
  onOpenChange,
  onNeedAuth,
}: {
  token: string;
  basePath: string;
  /** The visitor has passed the OTP door — the only condition for opening the microphone. */
  identified: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const tDictate = useTranslations("Dictate");
  const router = useRouter();
  const [title, setTitle] = useState("");
  // Checked by default: publish on the board. Unchecked = private return to the team.
  const [isPublic, setIsPublic] = useState(true);
  const [similar, setSimilar] = useState<SimilarPost[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The MarkdownEditor only commits to blur — the ref always carries the
  // last committed value, and submit() forces the blur before reading.
  const bodyRef = useRef("");
  const [initialBody, setInitialBody] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  // Draft in localStorage: if the modal closes (email verification which
  // goes wrong, wrong manipulation), the return being written is retrieved at the
  // reopening. Deleted only after publication.
  const draftKey = `mdy-feedback-draft:${token}`;
  const persistDraft = (nextTitle: string, nextBody: string) => {
    try {
      if (!nextTitle.trim() && !nextBody.trim()) {
        localStorage.removeItem(draftKey);
      } else {
        localStorage.setItem(draftKey, JSON.stringify({ title: nextTitle, body: nextBody }));
      }
    } catch {
      // localStorage unavailable — too bad for the draft
    }
  };

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { title?: string; body?: string };
      if (typeof draft.title === "string") setTitle(draft.title);
      if (typeof draft.body === "string" && draft.body) {
        bodyRef.current = draft.body;
        setInitialBody(draft.body);
        setEditorKey((k) => k + 1);
      }
    } catch {
      // illegible draft — we start from scratch
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live suggestion “this post may already exist” — title only, debounce.
  // Reserved for identified visitors: embedding is billed to the owner
  // of the board (MIN-342), and the action would refuse it anyway - we might as well
  // not show a “searching…” state that can never find anything.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = title.trim();
    if (!open || !identified || trimmed.length < SIMILAR_MIN_CHARS) {
      setSimilar([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      // The “search…” state makes the system visible even without results.
      setChecking(true);
      void findSimilarPostsAction(token, trimmed)
        .then(setSimilar)
        .catch(() => setSimilar([]))
        .finally(() => setChecking(false));
    }, SIMILAR_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title, token, open, identified]);

  // ── Dictation (MIN-37) ──────────────────────────── ────────────────────────────
  // One take = two visible stages: listening (the microphone switches to a spinner),
  // then Numo who tidies up (his face replaces the microphone, and the border highlights the
  // modal). The transport differs from the dashboard, the mechanics do not — hence the hook.

  const [transcribing, setTranscribing] = useState(false);

  /** Replace the title/body with what Numo just wrote. The body is
      a rich editor: remounting it is the only way to add text to it. */
  const applyPatch = (patch: { title?: string; body?: string }) => {
    const nextTitle = patch.title ?? title;
    const nextBody = patch.body ?? bodyRef.current;
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) {
      bodyRef.current = patch.body;
      setInitialBody(patch.body);
      setEditorKey((k) => k + 1);
    }
    persistDraft(nextTitle, nextBody);
  };

  const {
    busy: numoBusy,
    onTranscript,
    noteRun,
    reset: resetDictation,
  } = useFeedbackDictation({
    getDraft: () => ({ title, body: bodyRef.current }),
    applyPatch,
    dictate: async ({ runId, transcript, draft, history }) => {
      const result = await dictateFeedbackAction(token, {
        runId: runId ?? undefined,
        transcript,
        draft,
        history,
      });
      if (result.ok) return { ok: true, patch: result.patch, reply: result.reply };
      if (result.error === "notAuthenticated") {
        // The session expired between listening and storage: we return to the
        // door, the catch is lost but the already written text remains.
        onNeedAuth(() => {});
        return { ok: false, handled: true };
      }
      if (result.error === "unavailable") {
        toast.error(tDictate("unavailable"));
        return { ok: false, handled: true };
      }
      if (result.error === "rateLimited") {
        toast.error(tDictate("rateLimitReached", { minutes: 60 }));
        return { ok: false, handled: true };
      }
      return { ok: false };
    },
  });

  /** Listening: the take goes to the board, which transcribes it and returns the run. */
  const uploadAudio = async (blob: Blob): Promise<string | null> => {
    const form = new FormData();
    form.append(
      "audio",
      blob,
      `feedback.${blob.type.includes("ogg") ? "ogg" : "webm"}`
    );
    const res = await fetch(`/f/${token}/voice`, { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        retry_after?: number;
      };
      if (res.status === 401) onNeedAuth(() => {});
      else if (res.status === 413) toast.error(tDictate("tooLarge"));
      else if (res.status === 422) toast.error(tDictate("emptyResult"));
      else if (res.status === 429) {
        const minutes = Math.max(1, Math.ceil((data.retry_after ?? 3600) / 60));
        toast.error(tDictate("rateLimitReached", { minutes }));
      } else if (res.status === 503) toast.error(tDictate("unavailable"));
      else toast.error(tDictate("error"));
      return null;
    }
    const data = (await res.json()) as { text?: string; runId?: string };
    noteRun(data.runId ?? null);
    return data.text ?? "";
  };

  const reset = () => {
    setTitle("");
    setIsPublic(true);
    setSimilar([]);
    setChecking(false);
    setError(null);
    bodyRef.current = "";
    setInitialBody("");
    setEditorKey((k) => k + 1);
    resetDictation();
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        // Commits currently edited markdown content before reading.
        (document.activeElement as HTMLElement | null)?.blur();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const result = await createPostAction(token, {
          title: title.trim(),
          body: bodyRef.current.trim(),
          isPublic,
        });
        if (!result?.ok) {
          if (result?.error === "notAuthenticated") {
            onNeedAuth(submit);
            return;
          }
          setError(result ? result.error : "failed");
          return;
        }
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        reset();
        onOpenChange(false);
        // Review before publication (MIN-54): public feedback first goes through
        // AI verification (categorization + moderation) before appearing; A
        // private return leaves directly to the team.
        toast.success(isPublic ? t("submittedPublic") : t("submittedPrivate"));
        router.refresh();
      } catch {
        setError("failed");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // An in-flight dictation works ON this form: the transcript, then
        // the text of Numo, will land there. Closing now would throw them away.
        if (!next && (transcribing || numoBusy)) {
          toast.info(tDictate("inFlight"), { id: "dictation-in-flight" });
          return;
        }
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      {/* ⌘/Ctrl+Enter sends from ANY field in the modal — the title
          like the body. The shortcut is placed here rather than on each field
          because the body is a rich editor: the key goes back to it through
          bubbling. `defaultPrevented` leaves priority to the editor when
          he uses it himself (exiting a block of code). */}
      <DialogContent
        className="top-24 translate-y-0 gap-0 sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.defaultPrevented || !isSendShortcut(e)) return;
          e.preventDefault();
          if (title.trim() && !pending && !numoBusy) submit();
        }}
      >
        {/* “Issue creation modal” style: title and description are
            free writing surfaces, without containers. */}
        <DialogTitle className="sr-only">{t("composerTitle")}</DialogTitle>
        <AutoTextarea
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            persistDraft(e.target.value, bodyRef.current);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (title.trim() && !pending && !numoBusy) submit();
          }}
          placeholder={t("postTitlePlaceholder")}
          maxLength={200}
          className="w-full overflow-hidden bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <MarkdownEditor
          key={editorKey}
          value={initialBody}
          onCommit={(markdown) => {
            bodyRef.current = markdown;
            persistDraft(title, markdown);
          }}
          placeholder={t("postBodyPlaceholder")}
          className="mt-3 min-h-24"
        />
        {checking && similar.length === 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            {t("similarChecking")}
          </p>
        )}
        {similar.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">{t("similarTitle")}</p>
            {similar.map((s) => (
              <Link
                key={s.id}
                href={`${basePath}/p/${s.id}`}
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-brand"
              >
                <span className="min-w-0 truncate">{s.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  ▲ {s.voteCount}
                </span>
              </Link>
            ))}
          </div>
        )}
        {error && (
          <p className="mt-3 text-sm text-destructive">
            {/* Server error code: key assembled at runtime. */}
            {t(`errors.${error}` as MessageKey<"PublicFeedback">)}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          {/* The ⓘ lives OUTSIDE the <label>: inside, opening it would also switch
              the switch — reading the explanation would make the return public
              which we were reluctant to publish. */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="feedback-make-public"
                className="cursor-pointer text-sm font-medium"
              >
                {t("makePublic")}
              </label>
              <HelpHint>
                <span className="flex flex-col gap-2">
                  <span className="block">{t("makePublicHelpAnonymous")}</span>
                  <span className="block">{t("makePublicHelpPrivate")}</span>
                </span>
              </HelpHint>
            </div>
            <span className="text-xs text-muted-foreground">
              {isPublic ? t("makePublicHint") : t("makePrivateHint")}
            </span>
          </div>
          <Switch
            id="feedback-make-public"
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </div>
        {/* Bottom bar: voice on the left, send on the right — the same as
            ticket creation modal, because it is the same gesture. During
            that Numo puts away, his face takes the place of the microphone. */}
        <div className="mt-3 flex items-center justify-between gap-4 border-t pt-3">
          {numoBusy ? (
            <span
              className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center"
              aria-hidden
            >
              <NumoIcon
                state="thinking"
                className="size-6 text-primary animate-in fade-in duration-300"
              />
            </span>
          ) : identified ? (
            /* The tooltip says what the mic DOES, not what it's called:
               a visitor does not come here to look for a dictation, and “Dictation
               vocal” doesn’t teach him anything. She promises the result — to speak,
               and find the written return. */
            <DictateButton
              onTranscription={onTranscript}
              uploadAudio={uploadAudio}
              onProcessingChange={setTranscribing}
              tooltipLabel={t("voiceTooltip")}
              disabled={pending}
              className="-ml-2"
            />
          ) : (
            /* Not yet identified: the microphone EXISTS, it first asks who
               speak. Hiding it would make a button appear out of nowhere
               once the email is verified — and dictating makes the team spend, so we
               always knows who spoke. Same promise in tooltip: the door
               can only be justified if we already know what is behind it. */
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onNeedAuth(() => {})}
                    aria-label={t("voiceTooltip")}
                    className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    <Mic className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("voiceTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {numoBusy && (
            <span className="sr-only" role="status">
              {tDictate("numoWorking")}
            </span>
          )}
          <SendShortcutTooltip scope="form" label={t("submitPost")}>
            <Button
              onClick={() => title.trim() && submit()}
              disabled={pending || numoBusy || !title.trim()}
            >
              {pending && <Spinner />}
              {t("submitPost")}
            </Button>
          </SendShortcutTooltip>
        </div>

        {/* Numo takes over the dictation: the border highlights the edge of the modal during
            that he is working — same signal as his face, higher up. */}
        <AgentBeamOverlay active={numoBusy} />
      </DialogContent>
    </Dialog>
  );
}
