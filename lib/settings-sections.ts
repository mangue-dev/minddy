import {
  AppWindow,
  Bot,
  CalendarClock,
  Code2,
  Download,
  FolderKanban,
  GitBranch,
  Import as ImportIcon,
  Inbox,
  IterationCw,
  KeyRound,
  ListPlus,
  Lock,
  LogOut,
  MessagesSquare,
  Palette,
  Plug,
  Repeat,
  Settings2,
  Sparkles,
  Tags,
  Ticket,
  Trash2,
  TriangleAlert,
  User,
  Users,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

/**
 * Le catalogue des sections de réglages — la table que lisent la palette ⌘K et
 * les écrans de réglages eux-mêmes.
 *
 * Une section de réglages vit à trois endroits : la carte `<SettingsGroup>` qui
 * la rend, l'onglet qui la contient, et la ligne de palette qui y mène. Le
 * chemin complet (page → onglet → ancre → surlignage) n'a de sens que si les
 * trois disent la même chose, d'où une seule table : `SETTINGS_SECTIONS` donne
 * les identifiants (posés en ancre DOM par `SettingsGroup anchor=…`, typés, donc
 * une faute de frappe ne compile pas), `useSettingsSections()` donne les lignes
 * de palette, et `lib/settings-sections.test.ts` vérifie que chaque entrée du
 * catalogue est effectivement rendue quelque part — sinon la ligne existerait
 * dans ⌘K et n'emmènerait nulle part.
 */

/** L'onglet ouvert par défaut de chaque écran (celui que `?tab=` peut omettre). */
export const ACCOUNT_SETTINGS_DEFAULT_TAB = "profile";
export const PROJECT_SETTINGS_DEFAULT_TAB = "general";

/** Les onglets de `/settings` — les clés sont les valeurs `?tab=`. */
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

/** Les onglets de `/projects/<id>/settings`. */
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
 * L'identifiant d'une section. Stable et jamais traduit : c'est à la fois
 * l'ancre DOM (`settingsSectionAnchor`), le paramètre `?section=` de l'URL et
 * l'identifiant de la ligne de palette (donc la clé des favoris et des stats).
 */
export const SETTINGS_SECTIONS = {
  accountProfile: "account-profile",
  accountSecurity: "account-security",
  accountAppearance: "account-appearance",
  accountIssues: "account-issues",
  accountCyclesEnable: "account-cycles",
  accountCyclesCadence: "account-cycles-cadence",
  accountCyclesCapture: "account-cycles-capture",
  accountAutomations: "account-automations",
  accountAutomationsProjects: "account-automations-projects",
  accountNotifications: "account-notifications",
  accountMcp: "account-mcp",
  accountConnectedApps: "account-connected-apps",
  accountGitConnections: "account-git-connections",
  accountAiProvider: "account-ai-provider",
  accountAgent: "account-agent",
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
  projectGit: "project-git",
  projectImport: "project-import",
  projectIntegrations: "project-integrations",
} as const;

export type SettingsSectionId =
  (typeof SETTINGS_SECTIONS)[keyof typeof SETTINGS_SECTIONS];

/** L'`id` DOM de la carte d'une section — le préfixe évite toute collision. */
export function settingsSectionAnchor(id: SettingsSectionId): string {
  return `settings-section-${id}`;
}

/** Le paramètre d'URL que l'écran de réglages consomme pour dérouler + surligner. */
export const SETTINGS_SECTION_PARAM = "section";

export type SettingsSection = {
  id: SettingsSectionId;
  /** Compte (`/settings`) ou projet (`/projects/<id>/settings`). */
  scope: "account" | "project";
  tab: AccountSettingsTab | ProjectSettingsTab;
  icon: LucideIcon;
  /** Le titre de la carte, MOT POUR MOT — la ligne de palette annonce ce sur
   *  quoi elle atterrit. */
  title: string;
  /** L'onglet qui la contient, affiché en contexte dim à côté du titre. */
  tabLabel: string;
  /** Termes de recherche, FR **et** EN : ils ne s'affichent pas, donc les deux
   *  langues cohabitent et la ligne se trouve quelle que soit celle de l'écran. */
  keywords: string[];
  /** Section réservée au propriétaire du projet (ou aux autres) — sans ça, la
   *  palette proposerait « Zone sensible » à qui ne la verra jamais. */
  audience?: "owner" | "member";
};

/** L'URL qui ouvre la section : bonne page, bon onglet, ancre à dérouler. */
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
  // L'onglet par défaut n'a pas besoin d'être dit : le shell le retire de l'URL
  // dès qu'on y revient à la main, autant ne pas l'y mettre.
  if (section.tab !== defaultTab) params.set("tab", section.tab);
  params.set(SETTINGS_SECTION_PARAM, section.id);
  return `${base}?${params.toString()}`;
}

/**
 * Le catalogue résolu dans la langue de l'écran. Appelé par le shell applicatif
 * (les lignes ⌘K) ; les cartes, elles, ne lisent que `SETTINGS_SECTIONS`.
 */
export function useSettingsSections(): SettingsSection[] {
  const tAccount = useTranslations("Account");
  const tSecurity = useTranslations("AccountSecurity");
  const tData = useTranslations("AccountData");
  const tAutomations = useTranslations("Automations");
  const tCycles = useTranslations("Cycles");
  const tNotifications = useTranslations("NotificationSettings");
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
      // Une seule carte depuis la fusion : la connexion au dépôt et
      // l'autorisation d'agir en votre nom sont deux niveaux du MÊME compte, et
      // deux cartes séparées obligeaient à les recoller de tête. Les mots-clés
      // des deux y sont donc réunis — « agir en mon nom » doit toujours tomber
      // sur cette carte-là.
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

      // ── Projet ──────────────────────────────────────────────────────────
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
    tNav,
    tRecurrence,
    tSettings,
  ]);
}
