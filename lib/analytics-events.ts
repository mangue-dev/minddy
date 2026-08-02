/**
 * Catalogue d'événements analytics — LA source de vérité des événements PostHog
 * émis côté client via `useAnalytics().track()` (voir `lib/use-analytics.ts`).
 *
 * Pour ajouter un événement :
 *   1. ajouter une ligne à `AnalyticsEventProps` (nom → forme des props) ;
 *   2. ajouter le nom au tableau `EVENT_NAMES`.
 * Le `satisfies` refuse un nom qui n'existe pas dans le catalogue, et la garde
 * `_assertNoMissingEvents` plus bas refuse de compiler si un événement
 * catalogué manque au tableau. Comme `track()` est générique sur
 * `AnalyticsEventName`, une faute de frappe au call site est elle aussi une
 * erreur de compilation — plus d'événement perdu en silence.
 *
 * NOMMAGE : snake_case, `^[a-z0-9_:-]+$` (voir `sanitizeAnalyticsEventName`).
 *
 * DONNÉES : jamais de PII ni de texte libre dans les props — uniquement des
 * métadonnées (compteurs, booléens, ids, enums, tranches via `lengthBucket` /
 * `durationBucket` / `sizeBucket`). Les props sont sanitisées à l'envoi
 * (primitives, ≤24 clés, strings ≤512 caractères).
 *
 * Les événements SERVEUR (émis par `captureServerEvent()` dans les routes API,
 * qui ne passent pas par cette allowlist) ne sont PAS listés ici. À ce jour :
 *   user_signed_up, user_signed_in, signup_email_confirmed (app/auth/callback),
 *   issue_created_server, issue_updated_server (source web/mcp/api/agent),
 *   subscription_activated/updated/cancelled/payment_failed (webhook Stripe),
 *   agent_run_started/completed/failed, agent_pr_opened,
 *   mcp_tool_called, mcp_session_started, oauth_grant_created,
 *   public_feedback_created, public_feedback_voted,
 *   import_completed, cron_executed.
 */

/** Valeurs primitives acceptées après sanitisation (optionnelles par confort). */
type PropValue = string | number | boolean | null | undefined;
/** Événements qui ne portent aucune prop structurée. */
type NoProps = Record<string, never>;

/** Statuts de ticket — repris de `lib/issue-constants.ts` (string pour rester souple). */
type IssueStatus = string;

export interface AnalyticsEventProps {
  // ── Consentement ──
  cookie_consent_choice: { choice: "accepted" | "declined" };

  // ── Auth ──
  login_submitted: { method: "password" };
  login_failed: { method: "password" | "google" | "github"; reason: string };
  login_succeeded: { method: "password" };
  oauth_initiated: { provider: "google" | "github"; context: "login" | "signup" };
  signup_submitted: NoProps;
  signup_succeeded: { requires_email_confirmation: boolean };
  signup_failed: { reason: string };
  user_signed_out: NoProps;

  // ── Onboarding (MIN-74) ──
  onboarding_viewed: { current_step: string; completed_count: number };
  onboarding_step_viewed: { step: string; step_number: number };
  onboarding_step_acknowledged: { step: string };
  /** Étape « importer mes tickets » (MIN-98) : de quel outil vient le compte.
   *  `import_started` / `import_completed` couvrent déjà l'import lui-même. */
  onboarding_import_provider_selected: { provider: string };
  /** « Rejoindre un projet » à l'étape 1 : le compte n'en crée pas, il attend
   *  une invitation. C'est le seul endroit du produit qui le dit. */
  onboarding_join_opened: NoProps;
  /** Étape « connecter un agent » : lequel. Dit pour qui écrire la doc MCP
   *  en premier. */
  onboarding_mcp_agent_selected: { agent: string };
  /** Étape « votre clé d'API » (MIN-149) : le compte est arrivé avec sa clé.
   *  C'est la mesure de l'argument BYOK — combien de nouveaux comptes payent
   *  déjà leurs tokens ailleurs et n'ont pas à être comptés ici. */
  onboarding_ai_key_added: NoProps;
  onboarding_dismissed: { last_step: string; completed_count: number };
  onboarding_completed: { steps_acknowledged: number };

  // ── Projets ──
  project_wizard_opened: { source: "sidebar" | "home" | "palette" | "resume" };
  project_wizard_step_viewed: { step: string };
  project_wizard_abandoned: { last_step: string };
  project_wizard_completed: {
    has_git_link: boolean;
    feedback_enabled: boolean;
    smart_assign_enabled: boolean;
    auto_assign_enabled: boolean;
  };
  project_created: { has_icon: boolean; has_git_link: boolean };
  project_opened: { project_id: string };
  project_deleted: { project_id: string };
  project_updated: { field: string };
  project_icon_changed: { kind: "favicon" | "upload" | "orb" };
  project_setup_resumed: { step: string };

  // ── Tickets : création ──
  issue_created: {
    source: "dialog" | "palette" | "kanban" | "numo" | "board" | "objective" | "sub_issue";
    has_description: boolean;
    has_categories: boolean;
    has_assignee: boolean;
    priority: string;
    status: IssueStatus;
    effort?: string | null;
    /** Créé depuis le sélecteur « dans un autre projet ». */
    cross_project?: boolean;
    attachment_count?: number;
    description_length_bucket?: string;
    /** Le ticket vient d'un brouillon local récupéré (MIN-41). */
    created_from_draft?: boolean;
  };
  issue_create_dialog_opened: { source: string };
  issue_dictation_used: { surface: "create_dialog" | "side_panel" };
  issue_draft_recovered: NoProps;
  issue_draft_discarded: NoProps;

  // ── Tickets : édition ──
  issue_opened: { surface: string };
  /** `from` n'est renseigné que si l'appelant connaissait l'état précédent. */
  issue_status_changed: { from?: IssueStatus | null; to: IssueStatus; surface: string };
  issue_priority_changed: { to: string; surface: string };
  issue_assignee_changed: { assigned: boolean; surface: string; self?: boolean };
  issue_effort_changed: { to: string };
  issue_due_date_changed: { cleared: boolean };
  issue_category_changed: { count: number };
  issue_objective_changed: { assigned: boolean };
  issue_title_edited: NoProps;
  issue_description_edited: { length_bucket: string };
  issue_deleted: { surface: string };
  issue_moved_project: NoProps;

  // ── Tickets : contenu ──
  issue_plan_edited: { task_count: number };
  plan_task_toggled: { to_state: "pending" | "in_progress" | "completed" | "cancelled" };
  comment_added: { target: "issue" | "objective" | "feedback"; length_bucket: string };
  comment_deleted: { target: "issue" | "objective" | "feedback" };
  attachment_uploaded: { target: "issue" | "objective" | "comment"; size_bucket: string; kind: string };
  attachment_removed: { target: "issue" | "objective" | "comment" };
  sub_issue_created: NoProps;
  issue_relation_added: { relation: string };
  issue_relation_removed: { relation: string };

  // ── Board, vues, filtres ──
  board_viewed: { scope: "global" | "project" | "triage"; layout: string; issue_count: number };
  board_layout_changed: { to: "list" | "kanban" };
  board_grouped_by: { field: string };
  board_filter_applied: { filter: string; active_filter_count: number };
  board_filters_cleared: NoProps;
  board_sorted: { field: string };
  issue_dragged: { from: IssueStatus; to: IssueStatus; scope: "global" | "project" };
  view_created: { has_filters: boolean };
  view_switched: { view_kind: "system" | "custom" };
  view_updated: NoProps;
  view_deleted: NoProps;
  view_shared: { has_password: boolean; has_custom_domain: boolean };
  tab_reordered: NoProps;

  // ── Sélection groupée (MIN-75) ──
  bulk_selection_started: { surface: string };
  bulk_action_executed: { action: string; count: number };
  bulk_selection_cleared: { count: number };

  // ── Palette de commandes ──
  command_palette_opened: { source: "shortcut" | "click" | "mobile" };
  command_executed: { command_id: string; category: string };
  command_palette_no_results: { query_length: number };
  palette_favorite_toggled: { command_id: string; favorited: boolean };
  palette_view_changed: { view: string };

  // ── Numo (assistant) ──
  assistant_opened: { source: "fab" | "palette" | "shortcut" | "home" | "issue" };
  assistant_closed: NoProps;
  assistant_message_sent: { has_page_context: boolean; length_bucket: string; is_first_of_conversation: boolean };
  assistant_response_received: { had_tool_calls: boolean; tool_count: number; duration_bucket: string };
  assistant_response_failed: { reason: string };
  assistant_stopped: NoProps;
  assistant_conversation_new: NoProps;
  assistant_conversation_loaded: NoProps;
  assistant_conversation_deleted: NoProps;
  assistant_dictation_used: NoProps;
  assistant_suggestion_clicked: { suggestion_index: number };
  assistant_ask_user_answered: { answered: boolean };

  // ── Agent de code (MIN-46) ──
  agent_launch_opened: { surface: "issue" | "agents_page" | "palette" };
  agent_launched: { model: string; has_branch: boolean; provider: string };
  agent_run_opened: { status: string };
  agent_steered: { length_bucket: string };
  agent_stopped: NoProps;
  agent_diff_viewed: { file_count: number };
  agent_note_sent: NoProps;
  agent_question_answered: NoProps;
  agent_model_changed: { model: string };
  agent_preferences_updated: { field: string };

  // ── Pull requests ──
  pr_list_viewed: { count: number };
  pr_opened: { state: string; provider: string };
  pr_diff_file_opened: NoProps;
  pr_review_comment_added: { length_bucket: string };
  pr_review_submitted: { verdict: string };
  /** « Faire vérifier par Numo » (MIN-141) — la review déclenchée à la main. */
  pr_ai_review_requested: NoProps;
  /**
   * Ticket rattaché À LA MAIN à une PR qui n'en avait pas (MIN-163). `pr_state`
   * dit à quel moment de la vie de la PR on rattrape le lien manquant — c'est ce
   * qu'on veut savoir pour juger si la convention de nommage suffit.
   */
  pr_issue_linked: { pr_state: string };
  pr_external_link_clicked: { provider: string };

  // ── Cycles ──
  cycle_viewed: { issue_count: number; is_empty: boolean };
  cycle_filled: { added_count: number };
  cycle_issue_added: { surface: string };
  cycle_issue_removed: { surface: string };
  cycle_prefs_changed: { field: string };
  cycles_enabled: { enabled: boolean };

  // ── Notes rapides (scratchpad) ──
  scratchpad_opened: { source: "shortcut" | "sidebar" | "palette" | "home" | "click" };
  scratchpad_task_added: NoProps;
  scratchpad_task_completed: NoProps;
  scratchpad_task_promoted: NoProps;
  scratchpad_edited: { length_bucket: string };

  // ── Feedback côté équipe (MIN-37) ──
  /** Action d'équipe sur un retour (promote, merge, undo…) — le verbe vient
   *  du dernier segment de la route appelée. */
  feedback_action: { action: string };
  feedback_board_viewed: { post_count: number };
  feedback_post_opened: { status: string };
  feedback_post_promoted: NoProps;
  feedback_post_merged: { count: number };
  feedback_merge_undone: NoProps;
  feedback_responded: { length_bucket: string };
  feedback_status_changed: { to: string };
  feedback_linked_to_issue: NoProps;
  feedback_suggestion_used: { accepted: boolean };
  feedback_board_enabled: { enabled: boolean };
  feedback_integration_wizard_step: { step: string };
  feedback_integration_prompt_copied: NoProps;

  // ── Board public (visiteurs anonymes) ──
  public_board_viewed: { board_token_present: boolean };
  public_feedback_submitted: { length_bucket: string; has_title: boolean };
  public_feedback_voted: { voted: boolean };
  public_feedback_commented: { length_bucket: string };
  public_feedback_opened: NoProps;
  public_board_signin_started: { method: "otp" | "sso" };
  public_board_signin_completed: { method: "otp" | "sso" };

  // ── Vues partagées (MIN-26) ──
  shared_view_opened: { has_password: boolean };
  shared_view_password_submitted: { success: boolean };
  share_link_created: { has_password: boolean };
  share_link_revoked: NoProps;
  share_link_copied: NoProps;

  // ── Notifications ──
  notifications_opened: { unread_count: number; surface: "inbox" | "popover" };
  notification_clicked: { type: string; was_unread: boolean };
  notifications_marked_read: { count: number };
  notification_prefs_changed: { key: string; enabled: boolean };

  // ── Réglages ──
  settings_opened: { scope: "account" | "project"; source: string };
  settings_tab_switched: { scope: "account" | "project"; tab: string };
  profile_updated: { field: "name" | "email" | "password" | "avatar" };
  language_changed: { locale: string };
  theme_changed: { theme: string };
  account_preference_toggled: { key: string; enabled: boolean };
  settings_assistant_prompt_sent: { scope: "account" | "project" };

  // Connexions / intégrations
  mcp_connect_opened: { source: string };
  mcp_install_copied: { client: string; method: string };
  mcp_client_link_opened: { client: string };
  ai_key_added: { provider: string };
  ai_key_removed: NoProps;
  git_connection_started: { provider: "github" | "gitlab" };
  git_connection_completed: { provider: "github" | "gitlab" };
  /** `provider` peut valoir "unknown" : la déconnexion se fait par id de
   *  connexion, sans que l'appelant sache de quel fournisseur il s'agit. */
  git_connection_removed: { provider: string };
  /** Compte git PERSONNEL, sous lequel partent les gestes de PR (MIN-144) —
   *  distinct de l'installation de l'App ci-dessus. */
  git_identity_connect_started: { provider: "github" | "gitlab" };
  git_identity_removed: { provider: string };
  project_git_linked: { provider: string };
  project_git_unlinked: { provider: string };
  /** Synchro unidirectionnelle des issues du dépôt lié (MIN-97). */
  project_git_issue_sync_toggled: { provider: string; enabled: boolean };
  /** Ménage des branches d'agent des PR fermées (MIN-102). */
  project_git_branches_cleaned: { provider: string; deleted: number; failed: number };
  oauth_grant_revoked: NoProps;
  connected_app_viewed: NoProps;
  integration_added: { kind: string };
  integration_removed: { kind: string };
  custom_domain_added: NoProps;
  custom_domain_removed: NoProps;
  smart_assign_toggled: { enabled: boolean };

  // Membres, catégories, import
  project_member_invited: NoProps;
  project_member_removed: NoProps;
  project_invitation_responded: { response: "accepted" | "declined" };
  category_created: NoProps;
  category_updated: NoProps;
  category_deleted: NoProps;
  import_started: { source: string };
  import_completed: { source: string; issue_count: number };
  import_failed: { source: string; reason: string };

  // ── Billing (MIN-72) ──
  pricing_viewed: { surface: "marketing" | "app" };
  plan_cta_clicked: { plan_id: string; interval: string; current_plan_id: string };
  checkout_started: { plan_id: string; interval: string };
  billing_portal_opened: { current_plan_id: string };
  usage_viewed: NoProps;
  usage_history_filtered: { filter: string };
  plan_limit_hit: { limit_type: string; plan_id: string };
  upgrade_prompt_clicked: { source: string };

  // ── Site public (MIN-73) ──
  landing_viewed: NoProps;
  // `mcp_page`, `comparison` et `changelog` : les pages de contenu ajoutées par
  // MIN-93. Elles n'existent que pour être trouvées — savoir laquelle amène
  // vraiment à l'inscription est la moitié de la mesure du lot.
  landing_cta_clicked: {
    location:
      | "hero"
      | "nav"
      | "pricing_teaser"
      | "cta_section"
      | "footer"
      | "faq"
      | "mcp_page"
      | "comparison"
      | "changelog";
  };
  // `landing_section_viewed` a été retiré (MIN-150) : catalogué à sa création,
  // il n'a JAMAIS eu d'émetteur, et PostHog n'en a donc jamais reçu un seul.
  // Un nom qui traîne ici se lit comme une mesure existante — on croit pouvoir
  // interroger « quelles sections sont vues », et la réponse vide passe pour
  // une absence de trafic. Le rétablir = une ligne ici + un composant client
  // qui l'émet, les deux dans le même geste.
  landing_faq_opened: { question_index: number };
  /** Démo de dictée jouable (MIN-150). `input` distingue la prise au micro de
   *  la phrase d'exemple : savoir laquelle des deux fait le « aha » décide de
   *  laquelle mettre en avant. Aucun texte dicté ne remonte, jamais. */
  landing_voice_demo_started: { input: "mic" | "sample" };
  /** `duration_bucket` = l'attente entre le clic et le ticket rempli. Une démo
   *  qui met dix secondes à répondre n'est plus une démo : c'est la mesure qui
   *  le dira avant que quiconque s'en plaigne. */
  landing_voice_demo_completed: { input: "mic" | "sample"; duration_bucket: string };
  landing_voice_demo_failed: { input: "mic" | "sample"; reason: string };

  // ── Recherche, raccourcis, divers ──
  search_opened: { source: string };
  search_result_selected: { kind: string; query_length: number };
  search_no_results: { query_length: number };
  keyboard_shortcut_used: { shortcut: string };
  cheatsheet_opened: NoProps;
  undo_triggered: { action: string };
  statistics_viewed: { range: string };
  // Corbeille (MIN-133) — `item_type` ∈ issue | project | objective | feedback.
  trash_viewed: { items: number };
  trash_item_restored: { item_type: string };
  trash_item_purged: { item_type: string };
  trash_emptied: NoProps;
  home_viewed: { has_projects: boolean; onboarding_visible: boolean };
  home_quick_action_clicked: { action: string };
  objective_created: NoProps;
  objective_opened: NoProps;
  objective_updated: { field: string };
  objective_deleted: NoProps;
  objective_dictation_used: { surface: "create_dialog" | "side_panel" };
  admin_dashboard_viewed: { tab: string };
  external_link_clicked: { destination: string };
}

/** Union de tous les noms catalogués. */
export type AnalyticsEventName = keyof AnalyticsEventProps;

/** Props acceptées par `track()` pour un nom donné. */
export type AnalyticsPropsFor<E extends AnalyticsEventName> =
  AnalyticsEventProps[E] & Record<string, PropValue>;

/**
 * Source de l'allowlist runtime. `satisfies` refuse un nom absent du catalogue ;
 * la garde plus bas refuse un nom catalogué absent de ce tableau.
 */
const EVENT_NAMES = [
  // Consentement
  "cookie_consent_choice",
  // Auth
  "login_submitted",
  "login_failed",
  "login_succeeded",
  "oauth_initiated",
  "signup_submitted",
  "signup_succeeded",
  "signup_failed",
  "user_signed_out",
  // Onboarding
  "onboarding_viewed",
  "onboarding_step_viewed",
  "onboarding_step_acknowledged",
  "onboarding_import_provider_selected",
  "onboarding_join_opened",
  "onboarding_mcp_agent_selected",
  "onboarding_ai_key_added",
  "onboarding_dismissed",
  "onboarding_completed",
  // Projets
  "project_wizard_opened",
  "project_wizard_step_viewed",
  "project_wizard_abandoned",
  "project_wizard_completed",
  "project_created",
  "project_opened",
  "project_deleted",
  "project_updated",
  "project_icon_changed",
  "project_setup_resumed",
  // Tickets : création
  "issue_created",
  "issue_create_dialog_opened",
  "issue_dictation_used",
  "issue_draft_recovered",
  "issue_draft_discarded",
  // Tickets : édition
  "issue_opened",
  "issue_status_changed",
  "issue_priority_changed",
  "issue_assignee_changed",
  "issue_effort_changed",
  "issue_due_date_changed",
  "issue_category_changed",
  "issue_objective_changed",
  "issue_title_edited",
  "issue_description_edited",
  "issue_deleted",
  "issue_moved_project",
  // Tickets : contenu
  "issue_plan_edited",
  "plan_task_toggled",
  "comment_added",
  "comment_deleted",
  "attachment_uploaded",
  "attachment_removed",
  "sub_issue_created",
  "issue_relation_added",
  "issue_relation_removed",
  // Board / vues
  "board_viewed",
  "board_layout_changed",
  "board_grouped_by",
  "board_filter_applied",
  "board_filters_cleared",
  "board_sorted",
  "issue_dragged",
  "view_created",
  "view_switched",
  "view_updated",
  "view_deleted",
  "view_shared",
  "tab_reordered",
  // Sélection groupée
  "bulk_selection_started",
  "bulk_action_executed",
  "bulk_selection_cleared",
  // Palette
  "command_palette_opened",
  "command_executed",
  "command_palette_no_results",
  "palette_favorite_toggled",
  "palette_view_changed",
  // Numo
  "assistant_opened",
  "assistant_closed",
  "assistant_message_sent",
  "assistant_response_received",
  "assistant_response_failed",
  "assistant_stopped",
  "assistant_conversation_new",
  "assistant_conversation_loaded",
  "assistant_conversation_deleted",
  "assistant_dictation_used",
  "assistant_suggestion_clicked",
  "assistant_ask_user_answered",
  // Agent de code
  "agent_launch_opened",
  "agent_launched",
  "agent_run_opened",
  "agent_steered",
  "agent_stopped",
  "agent_diff_viewed",
  "agent_note_sent",
  "agent_question_answered",
  "agent_model_changed",
  "agent_preferences_updated",
  // Pull requests
  "pr_list_viewed",
  "pr_opened",
  "pr_diff_file_opened",
  "pr_review_comment_added",
  "pr_review_submitted",
  "pr_ai_review_requested",
  "pr_issue_linked",
  "pr_external_link_clicked",
  // Cycles
  "cycle_viewed",
  "cycle_filled",
  "cycle_issue_added",
  "cycle_issue_removed",
  "cycle_prefs_changed",
  "cycles_enabled",
  // Scratchpad
  "scratchpad_opened",
  "scratchpad_task_added",
  "scratchpad_task_completed",
  "scratchpad_task_promoted",
  "scratchpad_edited",
  // Feedback équipe
  "feedback_action",
  "feedback_board_viewed",
  "feedback_post_opened",
  "feedback_post_promoted",
  "feedback_post_merged",
  "feedback_merge_undone",
  "feedback_responded",
  "feedback_status_changed",
  "feedback_linked_to_issue",
  "feedback_suggestion_used",
  "feedback_board_enabled",
  "feedback_integration_wizard_step",
  "feedback_integration_prompt_copied",
  // Board public
  "public_board_viewed",
  "public_feedback_submitted",
  "public_feedback_voted",
  "public_feedback_commented",
  "public_feedback_opened",
  "public_board_signin_started",
  "public_board_signin_completed",
  // Vues partagées
  "shared_view_opened",
  "shared_view_password_submitted",
  "share_link_created",
  "share_link_revoked",
  "share_link_copied",
  // Notifications
  "notifications_opened",
  "notification_clicked",
  "notifications_marked_read",
  "notification_prefs_changed",
  // Réglages
  "settings_opened",
  "settings_tab_switched",
  "profile_updated",
  "language_changed",
  "theme_changed",
  "account_preference_toggled",
  "settings_assistant_prompt_sent",
  "mcp_connect_opened",
  "mcp_install_copied",
  "mcp_client_link_opened",
  "ai_key_added",
  "ai_key_removed",
  "git_connection_started",
  "git_connection_completed",
  "git_connection_removed",
  "git_identity_connect_started",
  "git_identity_removed",
  "project_git_linked",
  "project_git_unlinked",
  "project_git_issue_sync_toggled",
  "project_git_branches_cleaned",
  "oauth_grant_revoked",
  "connected_app_viewed",
  "integration_added",
  "integration_removed",
  "custom_domain_added",
  "custom_domain_removed",
  "smart_assign_toggled",
  "project_member_invited",
  "project_member_removed",
  "project_invitation_responded",
  "category_created",
  "category_updated",
  "category_deleted",
  "import_started",
  "import_completed",
  "import_failed",
  // Billing
  "pricing_viewed",
  "plan_cta_clicked",
  "checkout_started",
  "billing_portal_opened",
  "usage_viewed",
  "usage_history_filtered",
  "plan_limit_hit",
  "upgrade_prompt_clicked",
  // Site public
  "landing_viewed",
  "landing_cta_clicked",
  "landing_faq_opened",
  "landing_voice_demo_started",
  "landing_voice_demo_completed",
  "landing_voice_demo_failed",
  // Divers
  "search_opened",
  "search_result_selected",
  "search_no_results",
  "keyboard_shortcut_used",
  "cheatsheet_opened",
  "undo_triggered",
  "statistics_viewed",
  "trash_viewed",
  "trash_item_restored",
  "trash_item_purged",
  "trash_emptied",
  "home_viewed",
  "home_quick_action_clicked",
  "objective_created",
  "objective_opened",
  "objective_updated",
  "objective_deleted",
  "objective_dictation_used",
  "admin_dashboard_viewed",
  "external_link_clicked",
] as const satisfies readonly AnalyticsEventName[];

// Garde de compilation : si un événement catalogué manque à EVENT_NAMES, ce type
// vaut ce nom-là et l'affectation `= true` échoue. Correctif : l'ajouter ci-dessus.
type _MissingEvent = Exclude<AnalyticsEventName, (typeof EVENT_NAMES)[number]>;
const _assertNoMissingEvents: _MissingEvent extends never ? true : _MissingEvent = true;
void _assertNoMissingEvents;

/** Allowlist runtime consommée par `track()`. */
export const ALLOWED_ANALYTICS_EVENTS: ReadonlySet<AnalyticsEventName> = new Set(EVENT_NAMES);
