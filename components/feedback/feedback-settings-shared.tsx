"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Checkbox,
  ColorInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
  toast,
} from "mangue-ui";
import { ChevronDown, Languages, Sparkles, TriangleAlert } from "lucide-react";
import { defaultLocale } from "@/i18n/config";
import { DEFAULT_BOARD_ACCENT } from "@/lib/feedback/accent";
import {
  FEEDBACK_LANGUAGES,
  languageLabel,
  normalizeLanguage,
  type FeedbackLanguage,
} from "@/lib/feedback/languages";
import { useProjects } from "@/lib/projects-context";
import { PICKER_FIELD_TRIGGER, SearchMultiSelect } from "@/components/search-select";
import { FieldGroup } from "@/components/ui/field";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import type { SettingsSectionId } from "@/lib/settings-sections";

/**
 * Feedback settings, rendered TWICE: in the Feedback tab
 * project parameters, and in the configuration wizard which has become the
 * entry point ([feedback-setup-wizard.tsx](feedback-setup-wizard.tsx)).
 *
 * Both surfaces show the same switches and write by the same
 * road — copying them down meant accepting that one day one of the two would lie. Gentle
 * module: the page and the wizard only add their layout.
 *
 * What is shared is divided into two forms, depending on what the page does with it:
 *
 * - **rows** (`BoardVisibilityRows`, `BoardAccentRow`) for what, in
 * the page, lives inside a larger card (that of the board, which
 * also carries the public URL and SSO);
 * - **entire cards** (`NumoReviewGroup`, `FeedbackTranslationGroup`)
 * for what already IS a card, master switch included.
 *
 * The `SETTINGS_SECTIONS` anchor is optional and is only passed through the page:
 * two cards mounted at the same time (the page behind, the wizard in front)
 * would pose the same `id` twice in the document, and ⌘K would unroll the
 * mauvaise.
 */

export interface BoardSettings {
  enabled: boolean;
  show_views: boolean;
  visible_view_ids: string[];
  show_pages: boolean;
  visible_page_ids: string[];
  show_categories: boolean;
  allow_comments: boolean;
  accent_light: string | null;
  accent_dark: string | null;
  token: string;
  sso_secret: string | null;
  sso_configured: boolean;
}

export interface SharedView {
  id: string;
  name: string;
}

export interface PublishedPageItem {
  id: string;
  title: string;
}

export interface FeedbackSettingsData {
  board: BoardSettings | null;
  shared_views: SharedView[];
  published_pages: PublishedPageItem[];
}

export const feedbackSettingsKey = (projectId: string) =>
  ["feedback-settings", projectId] as const;

export const feedbackDomainKey = (projectId: string) =>
  ["feedback-domain", projectId] as const;

export async function feedbackApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || "error");
  return data as T;
}

/**
 * The state of the board and the gestures that write it — for the page as for the
 * wizard. Both ride this hook at the same time; React Query deduplicates on
 * the key, so they read the same board and see each other move.
 */
export function useFeedbackBoardSettings(projectId: string) {
  const queryClient = useQueryClient();
  const settingsPath = `/api/projects/${projectId}/feedback/settings`;
  const key = feedbackSettingsKey(projectId);
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: () => feedbackApi<FeedbackSettingsData>(settingsPath),
  });

  /**
   * Optimist (MIN-40): patch it immediately so that the switch follows
   * the finger, then persists; revert + toast to failure.
   *
   * The server's response is written back to the cache — this is what gives the
   * wizard the NEW board (its token, its public URL) just after having
   * activated: the optimistic patch does not know how to invent anything about a board that
   * did not exist yet.
   */
  const patchBoard = async (body: Partial<BoardSettings>): Promise<boolean> => {
    const previous = queryClient.getQueryData<FeedbackSettingsData>(key);
    queryClient.setQueryData<FeedbackSettingsData>(key, (old) =>
      old && old.board ? { ...old, board: { ...old.board, ...body } } : old,
    );
    try {
      const fresh = await feedbackApi<FeedbackSettingsData>(settingsPath, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      queryClient.setQueryData(key, fresh);
      return true;
    } catch (e) {
      queryClient.setQueryData(key, previous);
      toast.error((e as Error).message);
      return false;
    }
  };

  // Accent (MIN-59): picker `ColorInput` emits continuously during drag. We
  // patch the cache right away (the swatch follows the finger) but we debounce
  // the network call so as not to spam the DB. Failed → resync from server.
  const accentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchBoardDebounced = (body: Partial<BoardSettings>) => {
    queryClient.setQueryData<FeedbackSettingsData>(key, (old) =>
      old && old.board ? { ...old, board: { ...old.board, ...body } } : old,
    );
    if (accentTimer.current) clearTimeout(accentTimer.current);
    accentTimer.current = setTimeout(() => {
      feedbackApi(settingsPath, {
        method: "PATCH",
        body: JSON.stringify(body),
      }).catch((e) => {
        toast.error((e as Error).message);
        void queryClient.invalidateQueries({ queryKey: key });
      });
    }, 350);
  };

  /** Actions that are not simple toggles (SSO secret): spinner. */
  const post = async (action: string): Promise<boolean> => {
    setBusy(true);
    try {
      await feedbackApi(settingsPath, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await queryClient.invalidateQueries({ queryKey: key });
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    board: data?.board ?? null,
    sharedViews: data?.shared_views ?? [],
    publishedPages: data?.published_pages ?? [],
    isPending,
    busy,
    patchBoard,
    patchBoardDebounced,
    post,
  };
}

/** Status dot: colored dot + label, to read the status at once. */
export function StatusPill({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        active ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-brand" : "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

/**
 * The body of a settings card, without its header — the form the settings take
 * stored in the wizard, where the step title already says what they are adjusting.
 * The `FieldGroup` is not decorative: it carries the container query
 * of which the `responsive` rows live.
 */
export function SettingsRows({ children }: { children: ReactNode }) {
  return (
    <FieldGroup className="divide-y divide-border rounded-xl border border-border bg-card px-4">
      {children}
    </FieldGroup>
  );
}

/**
 * One tab-family checklist (shared views or published pages): each entry is
 * opt-in, and every click sends the WHOLE selection — same semantics as the
 * API behind it.
 */
function TabPickList({
  items,
  selectedIds,
  disabled,
  onToggle,
}: {
  items: { id: string; label: string }[];
  selectedIds: string[];
  disabled: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => {
        const checked = selectedIds.includes(item.id);
        return (
          <label key={item.id} className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) => onToggle(item.id, Boolean(next))}
            />
            {item.label}
          </label>
        );
      })}
    </div>
  );
}

/**
 * What the board shows to the public: the word first (comments), then
 * displays. Four rows, to be placed in the board card (page) or in
 * `SettingsRows` (wizard).
 */
export function BoardVisibilityRows({
  board,
  sharedViews,
  publishedPages,
  isOwner,
  onPatch,
}: {
  board: BoardSettings;
  sharedViews: SharedView[];
  publishedPages: PublishedPageItem[];
  isOwner: boolean;
  onPatch: (body: Partial<BoardSettings>) => void | Promise<unknown>;
}) {
  const t = useTranslations("Settings");
  return (
    <>
      {/* Public Comments (MIN-196) — the only row on the board that opens a
          WORD and not a display: it therefore comes before those which regulate
          what we show. When off, the thread already written remains readable; this is what
          que dit son hint. */}
      <SettingsRow
        label={t("feedbackAllowComments")}
        hint={t("feedbackAllowCommentsDesc")}
        control={
          <Switch
            checked={board.allow_comments}
            disabled={!isOwner}
            onCheckedChange={(v) => void onPatch({ allow_comments: v })}
            aria-label={t("feedbackAllowComments")}
          />
        }
      />

      {/* Shared Views Tabs */}
      <SettingsRow
        label={t("feedbackShowViews")}
        hint={t("feedbackShowViewsDesc")}
        control={
          <Switch
            checked={board.show_views}
            disabled={!isOwner}
            onCheckedChange={(v) => void onPatch({ show_views: v })}
            aria-label={t("feedbackShowViews")}
          />
        }
      >
        {board.show_views &&
          (sharedViews.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("feedbackNoSharedViews")}
            </p>
          ) : (
            <TabPickList
              items={sharedViews.map((view) => ({
                id: view.id,
                label: view.name,
              }))}
              selectedIds={board.visible_view_ids}
              disabled={!isOwner}
              onToggle={(id, next) =>
                void onPatch({
                  visible_view_ids: next
                    ? [...board.visible_view_ids, id]
                    : board.visible_view_ids.filter((v) => v !== id),
                })
              }
            />
          ))}
      </SettingsRow>

      {/* Published Pages Tabs — same coupling as the views, its own switch:
          the views switch only speaks of views and must not lie. */}
      <SettingsRow
        label={t("feedbackShowPages")}
        hint={t("feedbackShowPagesDesc")}
        control={
          <Switch
            checked={board.show_pages}
            disabled={!isOwner}
            onCheckedChange={(v) => void onPatch({ show_pages: v })}
            aria-label={t("feedbackShowPages")}
          />
        }
      >
        {board.show_pages &&
          (publishedPages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("feedbackNoPublishedPages")}
            </p>
          ) : (
            <TabPickList
              items={publishedPages.map((page) => ({
                id: page.id,
                label: page.title || t("feedbackUntitledPage"),
              }))}
              selectedIds={board.visible_page_ids}
              disabled={!isOwner}
              onToggle={(id, next) =>
                void onPatch({
                  visible_page_ids: next
                    ? [...board.visible_page_ids, id]
                    : board.visible_page_ids.filter((p) => p !== id),
                })
              }
            />
          ))}
      </SettingsRow>

      {/* Categories of posts on the public board (MIN-52) — off by default:
          the categories remain internal to the team dashboard. */}
      <SettingsRow
        label={t("feedbackShowCategories")}
        hint={t("feedbackShowCategoriesDesc")}
        control={
          <Switch
            checked={board.show_categories}
            disabled={!isOwner}
            onCheckedChange={(v) => void onPatch({ show_categories: v })}
            aria-label={t("feedbackShowCategories")}
          />
        }
      />
    </>
  );
}

/** Board accent color (MIN-59): optional switch that reveals two
 * `ColorInput` (light/dark). Off = accents null → minddy blue by default.
 * Enable boots both colors on the default to give a starting point. */
export function BoardAccentRow({
  board,
  isOwner,
  onToggle,
  onColorChange,
}: {
  board: BoardSettings;
  isOwner: boolean;
  onToggle: (body: Partial<BoardSettings>) => void | Promise<unknown>;
  onColorChange: (body: Partial<BoardSettings>) => void;
}) {
  const t = useTranslations("Settings");
  const custom = board.accent_light !== null || board.accent_dark !== null;

  return (
    <SettingsRow
      label={t("feedbackAccentTitle")}
      hint={t("feedbackAccentDesc")}
      control={
        <Switch
          checked={custom}
          disabled={!isOwner}
          aria-label={t("feedbackAccentTitle")}
          onCheckedChange={(v) =>
            void onToggle(
              v
                ? {
                    accent_light: board.accent_light ?? DEFAULT_BOARD_ACCENT,
                    accent_dark: board.accent_dark ?? DEFAULT_BOARD_ACCENT,
                  }
                : { accent_light: null, accent_dark: null },
            )
          }
        />
      }
    >
      {custom && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("feedbackAccentLight")}
            </span>
            <ColorInput
              value={board.accent_light ?? DEFAULT_BOARD_ACCENT}
              onChange={(next) => onColorChange({ accent_light: next })}
              label={t("feedbackAccentLight")}
              disabled={!isOwner}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("feedbackAccentDark")}
            </span>
            <ColorInput
              value={board.accent_dark ?? DEFAULT_BOARD_ACCENT}
              onChange={(next) => onColorChange({ accent_dark: next })}
              label={t("feedbackAccentDark")}
              disabled={!isOwner}
            />
          </div>
        </div>
      )}
    </SettingsRow>
  );
}

/**
 * Review by Numo — the step that categorizes, filters and moderates every feedback before
 * publication. Two switches, on the project (not on the board: the review
 * also covers API and internal input).
 *
 * The second only exists as long as the first is armed: it only responds to
 * question “what if the AI ​​budget is exhausted?” ". Disarming the review is possible
 * but not recommended, hence the warning in clear rather than simple wording.
 */
export function NumoReviewGroup({
  projectId,
  isOwner,
  anchor,
}: {
  projectId: string;
  isOwner: boolean;
  anchor?: SettingsSectionId;
}) {
  const t = useTranslations("Settings");
  const { projects, updateProject } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  // Local mirroring so that the switches follow the finger, then reconciliation
  // from the project (refetch) — the SmartAssignSection pattern.
  const [reviewOn, setReviewOn] = useState(
    project?.feedback_review_enabled !== false,
  );
  const [skipOn, setSkipOn] = useState(
    project?.feedback_review_skip_over_budget === true,
  );
  useEffect(() => {
    if (!project) return;
    setReviewOn(project.feedback_review_enabled !== false);
    setSkipOn(project.feedback_review_skip_over_budget === true);
  }, [project]);

  if (!project) return null;

  const patch = async (
    field: "feedback_review_enabled" | "feedback_review_skip_over_budget",
    next: boolean,
    revert: (value: boolean) => void,
  ) => {
    revert(next);
    try {
      await updateProject(projectId, { [field]: next });
    } catch (e) {
      revert(!next);
      toast.error((e as Error).message);
    }
  };

  return (
    <SettingsGroup
      anchor={anchor}
      icon={Sparkles}
      title={t("feedbackReviewTitle")}
      description={t("feedbackReviewDesc")}
      help={t("feedbackReviewHelp")}
      action={
        <>
          <StatusPill
            active={reviewOn}
            label={reviewOn ? t("feedbackActive") : t("feedbackInactive")}
          />
          <Switch
            checked={reviewOn}
            disabled={!isOwner}
            onCheckedChange={(v) =>
              void patch("feedback_review_enabled", v, setReviewOn)
            }
            aria-label={t("feedbackReviewTitle")}
          />
        </>
      }
    >
      {!reviewOn && (
        <div className="py-3.5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-600 dark:text-amber-500">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {t("feedbackReviewOffWarning")}
          </p>
        </div>
      )}
      {reviewOn && (
        <SettingsRow
          label={t("feedbackReviewSkipLabel")}
          hint={t("feedbackReviewSkipDesc")}
          control={
            <Switch
              checked={skipOn}
              disabled={!isOwner}
              onCheckedChange={(v) =>
                void patch("feedback_review_skip_over_budget", v, setSkipOn)
              }
              aria-label={t("feedbackReviewSkipLabel")}
            />
          }
        />
      )}
    </SettingsGroup>
  );
}

/**
 * Automatic translation of feedback (in the same pass as the review).
 *
 * Two settings, and a third which is not one:
 *
 * - **the language of the team** — the one we translate into. It is sown
 * when creating the project with the language of the creator's interface, because
 * that this is the only moment where we can read it: the app holds it in a
 * cookie, never on the account, and a review pass that runs for three days
 * later would have no way of finding her;
 * - **languages ​​that we read without help** — a French team does not need
 *   have the English translated for it;
 * - the language of the team itself, which is in the second automatic list and
 * is therefore not offered: we do not translate into our own language, and
 * offering the box would suggest that we can ask for the opposite.
 */
export function FeedbackTranslationGroup({
  projectId,
  isOwner,
  anchor,
}: {
  projectId: string;
  isOwner: boolean;
  anchor?: SettingsSectionId;
}) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const { projects, updateProject } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  // Local mirror so that the switch follows the finger, then reconciliation from
  // the project — the `NumoReviewGroup` pattern just above.
  const [on, setOn] = useState(project?.feedback_translate_enabled !== false);
  useEffect(() => {
    if (project) setOn(project.feedback_translate_enabled !== false);
  }, [project]);

  if (!project) return null;

  // NULL in base = never entered: the review falls back to the local by
  // default of the app, and the selector therefore shows the same thing as it.
  const teamLanguage =
    normalizeLanguage(project.feedback_team_language) ??
    (normalizeLanguage(defaultLocale) as FeedbackLanguage);
  const skipped = new Set(
    (project.feedback_no_translate_languages ?? [])
      .map(normalizeLanguage)
      .filter((code): code is FeedbackLanguage => code !== null),
  );

  const patch = async (input: Parameters<typeof updateProject>[1]) => {
    try {
      await updateProject(projectId, input);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const selectedSkip = FEEDBACK_LANGUAGES.filter(
    (code) => code !== teamLanguage && skipped.has(code),
  );

  const label = (code: string) => languageLabel(code, locale);
  // Two surfaces can mount this card at the same time (the page behind, the
  // wizard in front): a hard `id` would do the same thing twice in the document,
  // and the selector label would point to the wrong field.
  const selectId = `feedback-team-language-${anchor ?? "wizard"}`;

  return (
    <SettingsGroup
      anchor={anchor}
      icon={Languages}
      title={t("feedbackTranslationTitle")}
      description={t("feedbackTranslationDesc")}
      help={t("feedbackTranslationHelp")}
      action={
        <>
          <StatusPill
            active={on}
            label={on ? t("feedbackActive") : t("feedbackInactive")}
          />
          <Switch
            checked={on}
            disabled={!isOwner}
            onCheckedChange={(v) => {
              setOn(v);
              void patch({ feedback_translate_enabled: v }).catch(() =>
                setOn(!v),
              );
            }}
            aria-label={t("feedbackTranslationTitle")}
          />
        </>
      }
    >
      {on && (
        <>
          {/* The settings selector, that of the interface language just
              next to it in the account — same control, same width. */}
          <SettingsRow
            htmlFor={selectId}
            label={t("feedbackTeamLanguageLabel")}
            hint={t("feedbackTeamLanguageDesc")}
            control={
              <Select
                value={teamLanguage}
                disabled={!isOwner}
                onValueChange={(value) =>
                  void patch({ feedback_team_language: value })
                }
              >
                <SelectTrigger id={selectId} className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_LANGUAGES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {label(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          {/* Multiple choice: the searchable combobox of the app (that of
              categories of a ticket), and not a grid of boxes — fourteen
              check boxes in a row of settings make a wall that we
              looks around instead of looking for a tongue.
              The language of the team is not there: it is automatically excluded, and
              l'offrir laisserait croire qu'on peut demander l'inverse. */}
          <SettingsRow
            label={t("feedbackNoTranslateLabel")}
            hint={t("feedbackNoTranslateDesc")}
            control={
              <SearchMultiSelect
                values={[...skipped]}
                onChange={(codes) =>
                  void patch({ feedback_no_translate_languages: codes })
                }
                options={FEEDBACK_LANGUAGES.filter(
                  (code) => code !== teamLanguage,
                ).map((code) => ({ value: code, label: label(code) }))}
                align="end"
                searchPlaceholder={t("feedbackNoTranslateSearch")}
                trigger={
                  <button
                    type="button"
                    disabled={!isOwner}
                    aria-label={t("feedbackNoTranslateLabel")}
                    className={cn(
                      PICKER_FIELD_TRIGGER,
                      "w-48 disabled:pointer-events-none disabled:opacity-50",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {selectedSkip.length === 0
                        ? t("feedbackNoTranslateNone")
                        : selectedSkip.length === 1
                          ? label(selectedSkip[0])
                          : t("feedbackNoTranslateCount", {
                              count: selectedSkip.length,
                            })}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                }
              />
            }
          />
        </>
      )}
    </SettingsGroup>
  );
}
