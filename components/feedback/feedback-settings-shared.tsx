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
 * Les réglages du feedback, rendus DEUX FOIS : dans l'onglet Retours des
 * paramètres du projet, et dans le wizard de configuration qui en est devenu le
 * point d'entrée ([feedback-setup-wizard.tsx](feedback-setup-wizard.tsx)).
 *
 * Les deux surfaces montrent les mêmes interrupteurs et écrivent par la même
 * route — les recopier, c'était accepter qu'un jour l'un des deux mente. D'où ce
 * module : la page et le wizard n'y ajoutent que leur mise en page.
 *
 * Ce qui est partagé se répartit en deux formes, selon ce que la page en fait :
 *
 *  - des **rangées** (`BoardVisibilityRows`, `BoardAccentRow`) pour ce qui, dans
 *    la page, vit à l'intérieur d'une carte plus grande (celle du board, qui
 *    porte aussi l'URL publique et le SSO) ;
 *  - des **cartes entières** (`NumoReviewGroup`, `FeedbackTranslationGroup`)
 *    pour ce qui EST déjà une carte, interrupteur maître compris.
 *
 * L'ancre `SETTINGS_SECTIONS` est facultative et n'est passée que par la page :
 * deux cartes montées en même temps (la page derrière, le wizard devant)
 * poseraient deux fois le même `id` dans le document, et ⌘K déroulerait la
 * mauvaise.
 */

export interface BoardSettings {
  enabled: boolean;
  show_views: boolean;
  visible_view_ids: string[];
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

export interface FeedbackSettingsData {
  board: BoardSettings | null;
  shared_views: SharedView[];
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
 * L'état du board et les gestes qui l'écrivent — pour la page comme pour le
 * wizard. Les deux montent ce hook en même temps ; React Query déduplique sur
 * la clé, donc ils lisent le même board et se voient l'un l'autre bouger.
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
   * Optimiste (MIN-40) : patch le cache tout de suite pour que le switch suive
   * le doigt, puis persiste ; revert + toast à l'échec.
   *
   * La réponse du serveur est réécrite dans le cache — c'est ce qui donne au
   * wizard le board NEUF (son token, son URL publique) juste après l'avoir
   * activé : le patch optimiste, lui, ne sait rien inventer d'un board qui
   * n'existait pas encore.
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

  // Accent (MIN-59) : le picker `ColorInput` émet en continu pendant le drag. On
  // patche le cache tout de suite (le swatch suit le doigt) mais on debounce
  // l'appel réseau pour ne pas spammer la DB. Échec → resync depuis le serveur.
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

  /** Les actions qui ne sont pas de simples bascules (secret SSO) : spinner. */
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
    isPending,
    busy,
    patchBoard,
    patchBoardDebounced,
    post,
  };
}

/** Pastille d'état : point coloré + libellé, pour lire le statut d'un coup. */
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
 * Le corps d'une carte de réglages, sans son en-tête — la forme que prennent les
 * rangées dans le wizard, où le titre de l'étape dit déjà ce qu'elles règlent.
 * Le `FieldGroup` n'est pas décoratif : c'est lui qui porte la container query
 * dont vivent les rangées `responsive`.
 */
export function SettingsRows({ children }: { children: ReactNode }) {
  return (
    <FieldGroup className="divide-y divide-border rounded-xl border border-border bg-card px-4">
      {children}
    </FieldGroup>
  );
}

/**
 * Ce que le board montre au public : la parole d'abord (les commentaires), puis
 * les affichages. Trois rangées, à poser dans la carte du board (page) ou dans
 * `SettingsRows` (wizard).
 */
export function BoardVisibilityRows({
  board,
  sharedViews,
  isOwner,
  onPatch,
}: {
  board: BoardSettings;
  sharedViews: SharedView[];
  isOwner: boolean;
  onPatch: (body: Partial<BoardSettings>) => void | Promise<unknown>;
}) {
  const t = useTranslations("Settings");
  return (
    <>
      {/* Commentaires publics (MIN-196) — la seule rangée du board qui ouvre une
          PAROLE et pas un affichage : elle vient donc avant celles qui règlent
          ce qu'on montre. Éteinte, le fil déjà écrit reste lisible ; c'est ce
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

      {/* Onglets des vues partagées */}
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
            <div className="flex flex-col gap-1.5">
              {sharedViews.map((view) => {
                const checked = board.visible_view_ids.includes(view.id);
                return (
                  <label
                    key={view.id}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!isOwner}
                      onCheckedChange={(next) => {
                        const ids = next
                          ? [...board.visible_view_ids, view.id]
                          : board.visible_view_ids.filter(
                              (id) => id !== view.id,
                            );
                        void onPatch({ visible_view_ids: ids });
                      }}
                    />
                    {view.name}
                  </label>
                );
              })}
            </div>
          ))}
      </SettingsRow>

      {/* Catégories des posts sur le board public (MIN-52) — off par défaut :
          les catégories restent internes au dashboard équipe. */}
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

/** Couleur d'accent du board (MIN-59) : switch optionnel qui révèle deux
 *  `ColorInput` (clair/sombre). Off = accents null → bleu minddy par défaut.
 *  Activer amorce les deux couleurs sur le défaut pour donner un point de départ. */
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
 * Revue par Numo — l'étape qui catégorise, filtre et modère chaque retour avant
 * publication. Deux interrupteurs, sur le projet (pas sur le board : la revue
 * couvre aussi l'API et la saisie interne).
 *
 * Le second n'existe que tant que le premier est armé : il ne répond qu'à la
 * question « et si le budget IA est épuisé ? ». Désarmer la revue est possible
 * mais déconseillé, d'où l'avertissement en clair plutôt qu'un simple libellé.
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

  // Miroir local pour que les switches suivent le doigt, puis reconciliation
  // depuis le projet (refetch) — le pattern de SmartAssignSection.
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
 * Traduction automatique des retours (dans la même passe que la revue).
 *
 * Deux réglages, et un troisième qui n'en est pas un :
 *
 * - **la langue de l'équipe** — celle vers laquelle on traduit. Elle est semée
 *   à la création du projet avec la langue de l'interface du créateur, parce
 *   que c'est le seul instant où on peut la lire : l'app la tient dans un
 *   cookie, jamais sur le compte, et une passe de revue qui tourne trois jours
 *   plus tard n'aurait aucun moyen de la retrouver ;
 * - **les langues qu'on lit sans aide** — une équipe française n'a pas besoin
 *   qu'on lui traduise l'anglais ;
 * - la langue de l'équipe elle-même, qui est dans la seconde liste d'office et
 *   n'y est donc pas proposée : on ne traduit pas vers sa propre langue, et
 *   offrir la case laisserait croire qu'on peut demander l'inverse.
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

  // Miroir local pour que le switch suive le doigt, puis réconciliation depuis
  // le projet — le pattern de `NumoReviewGroup` juste au-dessus.
  const [on, setOn] = useState(project?.feedback_translate_enabled !== false);
  useEffect(() => {
    if (project) setOn(project.feedback_translate_enabled !== false);
  }, [project]);

  if (!project) return null;

  // NULL en base = jamais renseignée : la revue retombe sur la locale par
  // défaut de l'app, et le sélecteur montre donc la même chose qu'elle.
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
  // Deux surfaces peuvent monter cette carte en même temps (la page derrière, le
  // wizard devant) : un `id` en dur ferait deux fois le même dans le document,
  // et le libellé du sélecteur pointerait sur le mauvais champ.
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
          {/* Le sélecteur des réglages, celui de la langue de l'interface juste
              à côté dans le compte — même contrôle, même largeur. */}
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
          {/* Choix multiple : le combobox cherchable de l'app (celui des
              catégories d'un ticket), et non une grille de cases — quatorze
              cases à cocher dans une rangée de réglages font un mur qu'on
              parcourt des yeux au lieu d'y chercher une langue.
              La langue de l'équipe n'y est pas : elle est exclue d'office, et
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
