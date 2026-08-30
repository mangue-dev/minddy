import {
  AppWindow,
  BarChart3,
  BellRing,
  Bot,
  CalendarClock,
  Code2,
  Download,
  FolderKanban,
  GitBranch,
  Import as ImportIcon,
  Inbox,
  IterationCw,
  Keyboard,
  KeyRound,
  Languages,
  ListPlus,
  Lock,
  LogOut,
  MessagesSquare,
  Palette,
  Plug,
  Repeat,
  Settings2,
  ShieldOff,
  Sparkles,
  Tags,
  Ticket,
  Trash2,
  TriangleAlert,
  User,
  Upload,
  Users,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

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

/** The default open tab for each screen (the one that `?tab=` can omit). */
export const ACCOUNT_SETTINGS_DEFAULT_TAB = "profile";
export const PROJECT_SETTINGS_DEFAULT_TAB = "general";

/** `/settings` tabs — keys are `?tab=` values. */
export type AccountSettingsTab =
  | "profile"
  | "security"
  | "preferences"
  | "cycles"
  | "automations"
  | "inbox"
  | "mcp"
  | "git"
  | "agent"
  | "data";

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
  accountSecurity: "account-security",
  accountAppearance: "account-appearance",
  accountIssues: "account-issues",
  accountKeyboard: "account-keyboard",
  accountCyclesEnable: "account-cycles",
  accountCyclesCadence: "account-cycles-cadence",
  accountCyclesCapture: "account-cycles-capture",
  accountAutomations: "account-automations",
  accountAutomationsProjects: "account-automations-projects",
  accountNotifications: "account-notifications",
  accountPushDevices: "account-push-devices",
  accountMcp: "account-mcp",
  accountConnectedApps: "account-connected-apps",
  accountGitBranchPrefix: "account-git-branch-prefix",
  accountGitConnections: "account-git-connections",
  accountAiProvider: "account-ai-provider",
  accountAgent: "account-agent",
  accountAnalytics: "account-analytics",
  accountDataImport: "account-data-import",
  accountDataExport: "account-data-export",
  accountDataDelete: "account-data-delete",

  projectGeneral: "project-general",
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
  icon: LucideIcon;
  /** The title of the card, WORD FOR WORD — the paddle line announces what it lands on. */
  title: string;
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
  const tAutomations = useTranslations("Automations");
  const tCycles = useTranslations("Cycles");
  const tNotifications = useTranslations("NotificationSettings");
  const tPush = useTranslations("Push");
  const tNav = useTranslations("Nav");
  const tRecurrence = useTranslations("Recurrence");
  const tSettings = useTranslations("Settings");

  return useMemo(() => {
    const accountTabs: Record<AccountSettingsTab, string> = {
      profile: tAccount("profileTab"),
      security: tAccount("securityTab"),
      preferences: tAccount("preferencesTab"),
      cycles: tAccount("cyclesTab"),
      automations: tAutomations("title"),
      inbox: tAccount("inboxTab"),
      mcp: tAccount("mcpTab"),
      git: tAccount("gitTab"),
      agent: tAccount("agentTab"),
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
      // ── Compte ──────────────────────────────────────────────────────────
      account({
        id: SETTINGS_SECTIONS.accountProfile,
        tab: "profile",
        icon: User,
        title: tAccount("profileSectionTitle"),
        keywords: [
          "profil", "profile", "nom", "name", "pseudo", "username",
          "avatar", "photo", "email", "adresse", "identité", "identite",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountSecurity,
        tab: "security",
        icon: Lock,
        title: tSecurity("title"),
        keywords: [
          "sécurité", "securite", "security", "2fa", "mfa", "totp", "otp",
          "double authentification", "two-factor", "deux facteurs",
          "authenticator", "mot de passe", "password",
          "codes de secours", "recovery codes",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountAppearance,
        tab: "preferences",
        icon: Palette,
        title: tNav("appearance"),
        keywords: [
          "apparence", "appearance", "thème", "theme", "sombre", "dark",
          "clair", "light", "langue", "language", "français", "francais",
          "english", "anglais", "préférences", "preferences",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountIssues,
        tab: "preferences",
        icon: Ticket,
        title: tNav("tickets"),
        keywords: [
          "tickets", "issues", "assignation", "assign", "auto-assign",
          "statut", "status", "prompt", "démarrer", "demarrer", "start",
          "préférences", "preferences",
          "smart-fill", "smart fill", "smartfill", "remplissage", "remplir",
          "priorité", "priorite", "priority", "effort", "catégories",
          "categories", "objectif", "objective",
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
        id: SETTINGS_SECTIONS.accountCyclesEnable,
        tab: "cycles",
        icon: IterationCw,
        title: tCycles("enableTitle"),
        keywords: [
          "cycle", "cycles", "sprint", "quinzaine", "fortnight",
          "itération", "iteration", "activer", "enable",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountCyclesCadence,
        tab: "cycles",
        icon: CalendarClock,
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
        id: SETTINGS_SECTIONS.accountAutomations,
        tab: "automations",
        icon: Workflow,
        title: tAutomations("title"),
        keywords: [
          "automatisation", "automatisations", "automation", "automations",
          "agent", "numo", "boucle", "loop", "preset", "plan", "planifier",
          "implémenter", "implementer", "implement", "vérifier", "verifier",
          "verify",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountAutomationsProjects,
        tab: "automations",
        icon: FolderKanban,
        title: tAutomations("projectsTitle"),
        keywords: [
          "automatisations", "automations", "projets", "projects",
          "actif sur", "run on", "effort", "agent", "numo",
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
        id: SETTINGS_SECTIONS.accountMcp,
        tab: "mcp",
        icon: Plug,
        title: tAccount("mcpSectionTitle"),
        keywords: [
          "mcp", "agent", "claude", "cursor", "windsurf", "codex",
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
      // Only one card since the merger: connection to the repository and
      // authorization to act on your behalf are two levels of the SAME account, and
      // two separate cards required them to be glued together head on. Keywords
      // the two are therefore united there — “act in my name” must always fall
      // on this map.
      account({
        id: SETTINGS_SECTIONS.accountGitBranchPrefix,
        tab: "git",
        icon: GitBranch,
        title: tAccount("gitAgentBranchesTitle"),
        keywords: [
          "agent", "numo", "git", "branche", "branch", "préfixe", "prefix",
          "namespace", "espace de noms",
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
        id: SETTINGS_SECTIONS.accountAgent,
        tab: "agent",
        icon: Bot,
        title: tAccount("agentTab"),
        keywords: [
          "agent", "numo", "modèle", "modele", "model", "raisonnement",
          "reasoning", "défaut", "defaut", "default",
        ],
      }),
      account({
        id: SETTINGS_SECTIONS.accountAnalytics,
        tab: "data",
        icon: BarChart3,
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
        id: SETTINGS_SECTIONS.projectLeave,
        tab: "general",
        icon: LogOut,
        audience: "member",
        title: tSettings("leaveProjectLabel"),
        keywords: [
          "quitter", "leave", "partir", "projet", "project", "membre",
          "member",
        ],
      }),
      project({
        id: SETTINGS_SECTIONS.projectDanger,
        tab: "general",
        icon: TriangleAlert,
        audience: "owner",
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
        icon: WandSparkles,
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
          "feedback", "board", "public", "votes", "retours", "domaine",
          "domain", "sso", "canal", "channel",
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
    tAutomations,
    tCycles,
    tNotifications,
    tPush,
    tNav,
    tRecurrence,
    tSettings,
  ]);
}
