import type { AppIcon } from "@/components/icon";
import { useMemo } from "react";
import { Mic01Icon, AppWindowIcon as AppWindow, AiAutoRotateIcon as CycleIcon, Analytics01Icon, BlurIcon, ChartLineData01Icon, Copy01Icon, LaptopIcon, Link01Icon, Moon02Icon, PlayIcon, SearchList01Icon, Sun01Icon, UserCheck01Icon, BellRingIcon as BellRing, CalendarClockIcon, CodeSimpleIcon as Code2, Download, GitBranchIcon as GitBranch, ImportIcon, InboxIcon as Inbox, Keyboard, KeyRoundIcon as KeyRound, Languages, ListPlus, LockIcon, LogOut, MessageMultiple01Icon as MessagesSquare, Palette, PlugIcon as Plug, RepeatIcon as Repeat, Settings02Icon as Settings2, ShieldOff, Sparkles, TagsIcon as Tags, TicketIcon as Ticket, Trash2, TriangleAlertIcon, Upload04Icon as Upload, ViewOffIcon, UserGroupIcon as Users, UserIcon as User } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";

/**
 * The catalog of settings sections — the table that the ⌘K palette reads and
 * the settings screens themselves.
 *
 * A settings section lives in three places: the `<SettingsGroup>` card that
 * renders it, the tab which contains it, and the pallet line which leads to it. The
 * full path (page → tab → anchor → highlight) only makes sense if the
 * three say the same thing, hence a single table: `SETTINGS_SECTIONS` gives
 * the identifiers (placed in DOM anchor by `SettingsGroup anchor=…`, typed, so
 * a typo doesn't compile), `useSettingsSections()` gives the
 * palette lines, and `lib/settings-sections.test.ts` checks that each entry in the
 * catalog is actually rendered somewhere — otherwise the line would exist
 * in ⌘K and wouldn't take you anywhere.
 */

/** The default open tab for each screen (the one that `?tab=` can omit).
 * "Account settings" opens on the preferences; the profile has its own entry
 * (`?tab=profile`) under the user's name. */
export const ACCOUNT_SETTINGS_DEFAULT_TAB = "preferences";
export const PROJECT_SETTINGS_DEFAULT_TAB = "general";

/** `/settings` tabs — keys are `?tab=` values. */
export type AccountSettingsTab =
  | "profile"
  | "security"
  | "preferences"
  | "hidden-projects"
  | "issues"
  | "smart-fill"
  | "cycles"
  | "inbox"
  | "agent"
  | "mcp"
  | "git"
  | "data";

/**
 * Former `/settings?tab=` values and the tab that now holds their cards
 * (MIN-737). Shared links, bookmarks and restored app tabs keep landing on
 * the right content instead of falling back to the default tab.
 */
export const ACCOUNT_SETTINGS_TAB_ALIASES: Readonly<Record<string, AccountSettingsTab>> = {
  "mcp-clients": "agent",
};

/** The `/projects/<id>/settings` tabs. */
export type ProjectSettingsTab =
  | "general"
  | "categories"
  | "members"
  | "recurrences"
  | "smart-assign"
  | "feedback"
  | "git"
  | "import"
  | "integrations";

/**
 * The identifier of a section. Stable and never translated: it is both
 * the DOM anchor (`settingsSectionAnchor`), the `?section=` parameter of the URL and
 * the identifier of the palette line (therefore the key to favorites and stats).
 */
export const SETTINGS_SECTIONS = {
  accountProfile: "account-profile",
  accountStatistics: "account-statistics",
  accountSecurity: "account-security",
  accountSessions: "account-sessions",
  accountAppearance: "account-appearance",
  accountLanguage: "account-language",
  accountTheme: "account-theme",
  accountThemeLight: "account-theme-light",
  accountThemeDark: "account-theme-dark",
  accountTransparency: "account-transparency",
  accountKeyboard: "account-keyboard",
  accountDictation: "account-dictation",
  accountDictationVocabulary: "account-dictation-vocabulary",
  accountHiddenProjects: "account-hidden-projects",
  accountDesktop: "account-desktop",
  // The id predates MIN-737, when the card held every issue preference. It
  // now names the Assignment card; keeping it preserves palette favorites.
  accountIssues: "account-issues",
  accountStartingWork: "account-starting-work",
  accountAutoAssignStart: "account-auto-assign-start",
  accountPromptAutoStart: "account-prompt-auto-start",
  accountSmartFill: "account-smart-fill",
  accountSmartFillScope: "account-smart-fill-scope",
  accountSmartFillRelations: "account-smart-fill-relations",
  accountIssueIndexing: "account-issue-indexing",
  accountNumoStatus: "account-numo-status",
  accountCyclesEnable: "account-cycles",
  accountCyclesCadence: "account-cycles-cadence",
  accountCyclesCapture: "account-cycles-capture",
  accountNotifications: "account-notifications",
  accountPushDevices: "account-push-devices",
  accountMcp: "account-mcp",
  accountMcpClients: "account-mcp-clients",
  accountConnectedApps: "account-connected-apps",
  accountGitConnections: "account-git-connections",
  accountAiProvider: "account-ai-provider",
  accountAnalytics: "account-analytics",
  accountDataImport: "account-data-import",
  accountDataExport: "account-data-export",
  accountDataDelete: "account-data-delete",

  projectGeneral: "project-general",
  projectVisibility: "project-visibility",
  projectLeave: "project-leave",
  projectDanger: "project-danger",
  projectCategories: "project-categories",
  projectMembers: "project-members",
  projectRecurrences: "project-recurrences",
  projectSmartAssign: "project-smart-assign",
  projectFeedbackBoard: "project-feedback-board",
  projectFeedbackApi: "project-feedback-api",
  projectFeedbackReview: "project-feedback-review",
  projectFeedbackTranslation: "project-feedback-translation",
  projectFeedbackParticipants: "project-feedback-participants",
  projectGit: "project-git",
  projectImport: "project-import",
  projectIntegrations: "project-integrations",
} as const;

export type SettingsSectionId =
  (typeof SETTINGS_SECTIONS)[keyof typeof SETTINGS_SECTIONS];

/** The `id` DOM of a section's map — the prefix prevents collisions. */
export function settingsSectionAnchor(id: SettingsSectionId): string {
  return `settings-section-${id}`;
}

/** The URL parameter that the settings screen consumes to expand + highlight. */
export const SETTINGS_SECTION_PARAM = "section";

export type SettingsSection = {
  id: SettingsSectionId;
  /** Account (`/settings`) or project (`/projects/<id>/settings`). */
  scope: "account" | "project";
  tab: AccountSettingsTab | ProjectSettingsTab;
  icon: AppIcon;
  /** The title of the card or row, WORD FOR WORD — the palette line
   *  announces what it lands on. */
  title: string;
  /** For a single setting (a row inside a card): the card that contains it,
   *  shown as context in the settings filter and searchable in ⌘K. */
  parentTitle?: string;
  /** The tab that contains it, displayed in dim context next to the title. */
  tabLabel: string;
  /** Search terms, FR **and** EN: they are not displayed, so the two
 * languages ​​coexist and the line is found regardless of the one on the screen. */
  keywords: string[];
  /** Section reserved for the project owner (or others) — otherwise, the
 * palette would offer “Sensitive Zone” to anyone who will never see it. */
  audience?: "owner" | "member";
};

/** The URL that opens the section: correct page, correct tab, anchor to drop down. */
export function settingsSectionHref(
  section: SettingsSection,
  projectId?: string,
): string {
  const base =
    section.scope === "account"
      ? "/settings"
      : `/projects/${projectId}/settings`;
  const defaultTab =
    section.scope === "account"
      ? ACCOUNT_SETTINGS_DEFAULT_TAB
      : PROJECT_SETTINGS_DEFAULT_TAB;
  const params = new URLSearchParams();
  // The default tab does not need to be said: the shell removes it from the URL
  // as soon as you come back to it by hand, you might as well not put it there.
  if (section.tab !== defaultTab) params.set("tab", section.tab);
  params.set(SETTINGS_SECTION_PARAM, section.id);
  return `${base}?${params.toString()}`;
}

/**
 * The catalog resolved in the screen language. Called by the application shell
 * (the ⌘K lines); the cards only read `SETTINGS_SECTIONS`.
 */
export function useSettingsSections(): SettingsSection[] {
  const tAccount = useTranslations("Account");
  const tSecurity = useTranslations("AccountSecurity");
  const tData = useTranslations("AccountData");
  const tAnalytics = useTranslations("Analytics");
  const tCycles = useTranslations("Cycles");
  const tNotifications = useTranslations("NotificationSettings");
  const tPush = useTranslations("Push");
  const tNav = useTranslations("Nav");
  const tRecurrence = useTranslations("Recurrence");
  const tSettings = useTranslations("Settings");
  const tLanguage = useTranslations("Language");
  const tStats = useTranslations("Stats");

  return useMemo(() => {
    const accountTabs: Record<AccountSettingsTab, string> = {
      profile: tAccount("profileTab"),
      security: tAccount("securityTab"),
      preferences: tAccount("preferencesTab"),
      "hidden-projects": tAccount("hiddenProjectsTitle"),
      issues: tAccount("issuesTab"),
      "smart-fill": tAccount("smartFillTab"),
      cycles: tAccount("cyclesTab"),
      inbox: tAccount("inboxTab"),
      agent: tAccount("agentTab"),
      mcp: tAccount("mcpTab"),
      git: tAccount("gitTab"),
      data: tAccount("dataTab"),
    };
    const projectTabs: Record<ProjectSettingsTab, string> = {
      general: tSettings("generalTab"),
      categories: tSettings("categoriesTab"),
      members: tSettings("membersTab"),
      recurrences: tSettings("recurrencesTab"),
      "smart-assign": tSettings("smartAssignTab"),
      feedback: tSettings("feedbackTab"),
      git: tSettings("gitTab"),
      import: tSettings("importTab"),
      integrations: tSettings("integrationsTab"),
    };

    const account = (
      s: Omit<SettingsSection, "scope" | "tabLabel"> & { tab: AccountSettingsTab },
    ): SettingsSection => ({
      ...s,
      scope: "account",
      tabLabel: accountTabs[s.tab],
    });
    const project = (
      s: Omit<SettingsSection, "scope" | "tabLabel"> & { tab: ProjectSettingsTab },
    ): SettingsSection => ({
      ...s,
      scope: "project",
      tabLabel: projectTabs[s.tab],
    });

    return [
      // ── Account ─────────────────────────────────────────────────────────
      account({
        id: SETTINGS_SECTIONS.accountProfile,
        tab: "profile",
        icon: User,
        title: tAccount("profileSectionTitle"),
        keywords: [
          "profil", "profile", "nom", "name", "pseudo", "username",
          "avatar", "photo", "email", "adresse", "identité", "identite",
          "modifier", "edit",
        ],
      }),
      // Statistics moved into the profile (MIN-737): the words people used to
      // reach the former page must still land on it.
      account({
        id: SETTINGS_SECTIONS.accountStatistics,
        tab: "profile",
        icon: ChartLineData01Icon,
        title: tStats("title"),
        keywords: [
          "statistiques", "statistics", "stats", "activité", "activite",
          "activity", "série", "serie", "streak", "historique", "history",
          "rythme", "rhythm", "charge", "workload", "terminés", "termines",
          "completed",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountSecurity,
        tab: "security",
        icon: LockIcon,
        title: tSecurity("title"),
        keywords: [
          "sécurité", "securite", "security", "2fa", "mfa", "totp", "otp",
          "double authentification", "two-factor", "deux facteurs",
          "authenticator", "mot de passe", "password",
          "codes de secours", "recovery codes",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountSessions,
        tab: "security",
        icon: LogOut,
        title: tSecurity("sessionsTitle"),
        keywords: [
          "sessions", "session", "appareils", "devices", "déconnexion",
          "deconnexion", "sign out", "log out", "déconnecter", "deconnecter",
          "autres appareils", "other devices",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountAppearance,
        tab: "preferences",
        icon: Palette,
        title: tNav("appearance"),
        keywords: [
          "apparence", "appearance", "thème", "theme", "sombre", "dark",
          "clair", "light", "langue", "language", "préférences", "preferences",
        ],
      }),
      // Single settings of the Appearance card: each one is a word people
      // type, and landing on the row beats landing on a five-row card.
      account({
        id: SETTINGS_SECTIONS.accountLanguage,
        tab: "preferences",
        icon: Languages,
        title: tLanguage("title"),
        parentTitle: tNav("appearance"),
        keywords: [
          "langue", "language", "français", "francais", "english", "anglais",
          "deutsch", "español", "espanol", "italiano", "português", "portugues",
          "traduction", "translation",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountTheme,
        tab: "preferences",
        icon: Sun01Icon,
        title: tAccount("themeTitle"),
        parentTitle: tNav("appearance"),
        keywords: [
          "thème", "theme", "sombre", "dark", "clair", "light", "système",
          "systeme", "system", "mode",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountThemeLight,
        tab: "preferences",
        icon: Palette,
        title: tAccount("themeLightPresetTitle"),
        parentTitle: tNav("appearance"),
        keywords: [
          "palette", "couleurs", "colors", "colours", "clair", "light",
          "thème", "theme",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountThemeDark,
        tab: "preferences",
        icon: Moon02Icon,
        title: tAccount("themeDarkPresetTitle"),
        parentTitle: tNav("appearance"),
        keywords: [
          "palette", "couleurs", "colors", "colours", "sombre", "dark",
          "thème", "theme",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountTransparency,
        tab: "preferences",
        icon: BlurIcon,
        title: tAccount("themeTransparencyTitle"),
        parentTitle: tNav("appearance"),
        keywords: [
          "transparence", "transparency", "verre", "glass", "flou", "blur",
          "vibrancy",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountKeyboard,
        tab: "preferences",
        icon: Keyboard,
        title: tAccount("keyboardSectionTitle"),
        keywords: [
          "clavier", "keyboard", "raccourci", "raccourcis", "shortcut",
          "shortcuts", "entrée", "entree", "enter", "envoyer", "send",
          "cmd", "commande", "command", "ctrl", "contrôle", "controle",
          "maj", "shift", "saut de ligne", "line break", "nouvelle ligne",
          "new line", "commentaire", "comment", "composer", "message",
          "préférences", "preferences",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountDictation,
        tab: "preferences",
        icon: Mic01Icon,
        title: tAccount("dictationSectionTitle"),
        keywords: [
          "dictée", "dictee", "dictation", "voix", "voice", "vocal", "micro",
          "microphone", "transcription", "nettoyage", "cleanup", "clean up",
          "brut", "raw", "préférences", "preferences",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountDictationVocabulary,
        tab: "preferences",
        icon: Mic01Icon,
        title: tAccount("vocabularyTitle"),
        parentTitle: tAccount("dictationSectionTitle"),
        keywords: [
          "vocabulaire", "vocabulary", "mots", "words", "dictionnaire",
          "dictionary", "remplacement", "replacement", "orthographe",
          "spelling", "dictée", "dictee", "dictation", "transcription",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountHiddenProjects,
        tab: "hidden-projects",
        icon: ViewOffIcon,
        title: tAccount("hiddenProjectsTitle"),
        keywords: [
          "projets masqués", "projets masques", "hidden projects", "masquer",
          "hide", "réafficher", "reafficher", "show", "afficher", "unhide",
          "sidebar", "barre latérale", "navigation", "projet", "project",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountDesktop,
        tab: "preferences",
        icon: LaptopIcon,
        title: tAccount("desktopSectionTitle"),
        keywords: [
          "bureau", "desktop", "application", "app", "mac", "macos",
          "windows", "linux", "télécharger", "telecharger", "download",
          "installer", "install", "version", "mise à jour", "mise a jour",
          "update", "serveur", "server",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountIssues,
        tab: "issues",
        icon: UserCheck01Icon,
        title: tAccount("assignmentTitle"),
        keywords: [
          "assignation", "assignment", "assigner", "assign", "auto-assign",
          "créer", "creer", "create", "tickets", "issues", "moi", "me",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountStartingWork,
        tab: "issues",
        icon: PlayIcon,
        title: tAccount("startingWorkTitle"),
        keywords: [
          "démarrer", "demarrer", "start", "commencer", "en cours",
          "in progress", "tickets", "issues",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountAutoAssignStart,
        tab: "issues",
        icon: UserCheck01Icon,
        title: tAccount("autoAssignStartLabel"),
        parentTitle: tAccount("startingWorkTitle"),
        keywords: [
          "assignation", "assignment", "assigner", "assign", "démarrer",
          "demarrer", "start", "auto-assign",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountPromptAutoStart,
        tab: "issues",
        icon: Copy01Icon,
        title: tAccount("promptAutoStartLabel"),
        parentTitle: tAccount("startingWorkTitle"),
        keywords: [
          "prompt", "copier", "copy", "démarrer", "demarrer", "start",
          "agent", "tâche", "tache", "task", "carnet", "notebook",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountSmartFill,
        tab: "smart-fill",
        icon: SMART_FILL_ICON,
        title: tAccount("smartFillTitle"),
        keywords: [
          "smart fill", "smart-fill", "smartfill", "remplissage", "remplir",
          "fill", "priorité", "priorite", "priority", "effort",
          "catégories", "categories", "objectif", "objective", "ia", "ai",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountSmartFillScope,
        tab: "smart-fill",
        icon: ListPlus,
        title: tAccount("smartFillScopeTitle"),
        keywords: [
          "smart fill", "smart-fill", "smartfill", "créés", "crees",
          "created", "triage", "remplir", "fill", "réévaluer", "reevaluer",
          "re-evaluate", "reevaluate", "modifiés", "modifies", "edited",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountSmartFillRelations,
        tab: "smart-fill",
        icon: Link01Icon,
        title: tAccount("smartFillRelationsTitle"),
        keywords: [
          "smart fill", "smart-fill", "relations", "liens", "links",
          "lier", "link", "liés", "lies", "related", "doublons",
          "duplicates",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountIssueIndexing,
        tab: "smart-fill",
        icon: SearchList01Icon,
        title: tAccount("issueIndexingTitle"),
        keywords: [
          "indexation", "indexing", "index", "indexer", "recherche",
          "search", "sémantique", "semantique", "semantic", "vecteurs",
          "vectors", "embeddings", "smart fill",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountCyclesEnable,
        tab: "cycles",
        icon: CycleIcon,
        title: tCycles("enableTitle"),
        keywords: [
          "cycle", "cycles", "sprint", "quinzaine", "fortnight",
          "itération", "iteration", "activer", "enable",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountCyclesCadence,
        tab: "cycles",
        icon: CalendarClockIcon,
        title: tCycles("cadenceTitle"),
        keywords: [
          "cadence", "cycle", "durée", "duree", "duration", "semaine",
          "week", "quinzaine", "fortnight", "jour de début", "start day",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountCyclesCapture,
        tab: "cycles",
        icon: ListPlus,
        title: tCycles("captureTitle"),
        keywords: [
          "cycle", "ajout automatique", "auto-add", "capture", "remplir",
          "fill", "automatique", "automatic",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountNotifications,
        tab: "inbox",
        icon: Inbox,
        title: tNotifications("title"),
        keywords: [
          "notifications", "notification", "inbox", "alertes", "alerts",
          "mentions", "assignations", "assignments", "commentaires",
          "comments", "feedback",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountPushDevices,
        tab: "inbox",
        icon: BellRing,
        title: tPush("devicesTitle"),
        keywords: [
          "push", "notifications système", "notifications systeme",
          "system notifications", "appareil", "appareils", "device", "devices",
          "téléphone", "telephone", "phone", "mobile", "navigateur", "browser",
          "pwa", "alertes", "alerts", "web push",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountAiProvider,
        tab: "agent",
        icon: KeyRound,
        title: tAccount("aiProviderTitle"),
        keywords: [
          "ia", "ai", "clé", "cle", "key", "api", "byok", "openai",
          "anthropic", "provider", "quota", "budget",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountMcpClients,
        tab: "agent",
        icon: Plug,
        title: tAccount("mcpClientsTab"),
        keywords: ["mcp", "numo", "notion", "linear", "google", "connectors", "oauth"],
      }),
      account({
        id: SETTINGS_SECTIONS.accountNumoStatus,
        tab: "agent",
        icon: Ticket,
        title: tAccount("numoIssuesTitle"),
        keywords: [
          "numo", "statut", "status", "tickets créés", "tickets crees",
          "created issues", "triage", "backlog", "assistant",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountMcp,
        tab: "mcp",
        icon: Plug,
        title: tAccount("mcpSectionTitle"),
        keywords: [
          "mcp", "agent", "claude", "cursor", "windsurf", "codex", "opencode",
          "connecter", "connect", "serveur", "server", "oauth",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountConnectedApps,
        tab: "mcp",
        icon: AppWindow,
        title: tAccount("connectedAppsTitle"),
        keywords: [
          "applications", "apps", "connectées", "connectees", "connected",
          "oauth", "autorisation", "authorization", "révoquer", "revoquer",
          "revoke", "déconnecter", "deconnecter", "disconnect",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountGitConnections,
        tab: "git",
        icon: GitBranch,
        title: tAccount("gitConnectionsTitle"),
        keywords: [
          "git", "github", "gitlab", "comptes", "accounts", "connexion",
          "connection", "dépôt", "depot", "repo", "repository",
          "déconnecter", "deconnecter", "disconnect",
          "identité", "identite", "identity", "en mon nom", "in my name",
          "autoriser", "authorize", "révoquer", "revoquer", "revoke",
          "pull request", "pr",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountAnalytics,
        tab: "data",
        icon: Analytics01Icon,
        title: tAnalytics("title"),
        keywords: [
          "audience", "analytics", "mesure", "statistiques", "posthog",
          "cookies", "consentement", "consent", "vie privée", "vie privee",
          "privacy", "rgpd", "gdpr", "suivi", "tracking",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountDataImport,
        tab: "data",
        icon: Upload,
        title: tData("importTitle"),
        keywords: [
          "import", "importer", "transfer", "transfert", "données", "donnees",
          "data", "instance", "self-hosted", "cloud", "json",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountDataExport,
        tab: "data",
        icon: Download,
        title: tData("exportTitle"),
        keywords: [
          "export", "exporter", "données", "donnees", "data", "json",
          "télécharger", "telecharger", "download", "rgpd", "gdpr",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountDataDelete,
        tab: "data",
        icon: Trash2,
        title: tData("deleteTitle"),
        keywords: [
          "supprimer", "suppression", "delete", "compte", "account",
          "effacer", "fermer", "close", "rgpd", "gdpr",
        ],
      }),

      // ── Project ───────────────────────────── ─────────────────────────────
      project({
        id: SETTINGS_SECTIONS.projectGeneral,
        tab: "general",
        icon: Settings2,
        title: tSettings("generalSectionTitle"),
        keywords: [
          "général", "general", "nom", "name", "clé", "cle", "key",
          "icône", "icone", "icon", "projet", "project", "renommer",
          "rename",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectVisibility,
        tab: "general",
        icon: ViewOffIcon,
        title: tSettings("hideProjectLabel"),
        parentTitle: tSettings("dangerZoneTitle"),
        keywords: [
          "masquer", "hide", "cacher", "visibilité", "visibilite",
          "visibility", "sidebar", "barre latérale", "navigation",
          "projet", "project", "archiver", "archive",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectLeave,
        tab: "general",
        icon: LogOut,
        audience: "member",
        title: tSettings("leaveProjectLabel"),
        parentTitle: tSettings("dangerZoneTitle"),
        keywords: [
          "quitter", "leave", "partir", "projet", "project", "membre",
          "member",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectDanger,
        tab: "general",
        icon: TriangleAlertIcon,
        title: tSettings("dangerZoneTitle"),
        keywords: [
          "supprimer", "delete", "zone sensible", "danger", "corbeille",
          "trash", "projet", "project",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectCategories,
        tab: "categories",
        icon: Tags,
        title: tSettings("categoriesTab"),
        keywords: [
          "catégories", "categories", "categorie", "labels", "étiquettes",
          "etiquettes", "tags",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectMembers,
        tab: "members",
        icon: Users,
        title: tSettings("membersTab"),
        keywords: [
          "membres", "members", "inviter", "invite", "invitation",
          "équipe", "equipe", "team", "rôle", "role", "accès", "acces",
          "access",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectRecurrences,
        tab: "recurrences",
        icon: Repeat,
        title: tRecurrence("title"),
        keywords: [
          "récurrent", "recurrent", "récurrences", "recurrences",
          "recurring", "répéter", "repeter", "repeat", "hebdomadaire",
          "weekly", "mensuel", "monthly", "quotidien", "daily",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectSmartAssign,
        tab: "smart-assign",
        icon: SMART_ASSIGN_ICON,
        title: tSettings("smartAssignTab"),
        keywords: [
          "smart assign", "assignation", "assignment", "assigné", "assigne",
          "assignee", "règles", "regles", "rules", "répartition",
          "repartition", "automatique", "automatic",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectFeedbackBoard,
        tab: "feedback",
        icon: MessagesSquare,
        title: tSettings("feedbackChannelBoardTitle"),
        keywords: [
          "feedback", "board", "public", "votes", "retours",
          "sso", "canal", "channel",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectFeedbackApi,
        tab: "feedback",
        icon: Code2,
        title: tSettings("feedbackChannelApiTitle"),
        keywords: [
          "feedback", "api", "clé", "cle", "key", "serveur", "server",
          "endpoint", "intégrer", "integrer", "integrate", "canal",
          "channel",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectFeedbackReview,
        tab: "feedback",
        icon: Sparkles,
        title: tSettings("feedbackReviewTitle"),
        keywords: [
          "feedback", "revue", "review", "numo", "modération", "moderation",
          "ia", "ai", "filtrer", "filter",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectFeedbackTranslation,
        tab: "feedback",
        icon: Languages,
        title: tSettings("feedbackTranslationTitle"),
        keywords: [
          "feedback", "retours", "traduction", "translation", "translate",
          "langue", "language", "langues", "languages", "numo", "ia", "ai",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectFeedbackParticipants,
        tab: "feedback",
        icon: ShieldOff,
        title: tSettings("feedbackParticipantsTitle"),
        keywords: [
          "feedback", "participants", "visiteurs", "visitors", "effacer",
          "erase", "supprimer", "delete", "droit à l'oubli", "right to be forgotten",
          "rgpd", "gdpr", "données personnelles", "donnees personnelles",
          "personal data", "email",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectGit,
        tab: "git",
        icon: GitBranch,
        title: tSettings("gitTab"),
        keywords: [
          "git", "github", "gitlab", "dépôt", "depot", "repo", "repository",
          "lier", "link", "branche", "branch", "pull request",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectImport,
        tab: "import",
        icon: ImportIcon,
        title: tSettings("importTab"),
        keywords: [
          "import", "importer", "csv", "linear", "jira", "github",
          "migrer", "migrate", "migration",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectIntegrations,
        tab: "integrations",
        icon: Plug,
        title: tSettings("integrationsTab"),
        keywords: [
          "intégrations", "integrations", "clés api", "cles api",
          "api keys", "webhook", "webhooks", "jetons", "tokens", "mcp",
        ],
      }),
    ];
  }, [
    tAccount,
    tSecurity,
    tData,
    tCycles,
    tNotifications,
    tPush,
    tNav,
    tRecurrence,
    tSettings,
    tLanguage,
    tStats,
  ]);
}
