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
 *   automation_chain_started, automation_chain_finished (MIN-147),
 *   mcp_tool_called, mcp_session_started, oauth_grant_created,
 *   public_feedback_created, public_feedback_voted, import_completed,
 *   desktop_download_started (MIN-292 — le `.dmg` qui part vraiment).
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
  /** Parcours « mot de passe oublié » (MIN-297) : demandé, échoué, terminé. */
  password_reset_requested: NoProps;
  password_reset_failed: { reason: string };
  password_reset_completed: NoProps;
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
  /** `draft` = un brouillon repris depuis la barre latérale ; `resume` = le
   *  retour d'un aller-retour chez le provider git, qui n'est pas une reprise
   *  volontaire mais le milieu d'un geste. */
  project_wizard_opened: {
    source: "sidebar" | "home" | "palette" | "resume" | "draft";
  };
  project_wizard_step_viewed: { step: string };
  /** Fermé SANS garder la saisie. Depuis les brouillons de projet, l'abandon
   *  est un choix explicite (« Abandonner ») et non plus le sort par défaut de
   *  toute fermeture : c'est `project_wizard_draft_saved` qu'il faut lui
   *  comparer pour lire l'étape qui fait décrocher. */
  project_wizard_abandoned: { last_step: string };
  /** Fermé EN GARDANT la saisie — le brouillon prend sa ligne dans la barre
   *  latérale. L'étape dit où l'on s'arrête quand on ne renonce pas. */
  project_wizard_draft_saved: { step: string };
  /** La première question du wizard (MIN-171) : d'où on part. C'est la mesure
   *  de laquelle des deux entrées sert vraiment — un projet neuf à cadrer, ou
   *  un backlog qui existe déjà ailleurs. */
  project_wizard_origin_chosen: { origin: "new" | "existing" };
  /** « Je souhaite rejoindre un projet », depuis l'étape « nom » : le compte
   *  n'avait pas de projet à créer, il lui fallait une invitation. C'est un
   *  ABANDON légitime du wizard — à retrancher de ceux qui décrochent. */
  project_wizard_join_opened: NoProps;
  /** Ce que l'étape d'amorce a récolté, « rien » compris : l'écart entre
   *  l'origine choisie et l'amorce retenue dit si l'étape tient sa promesse. */
  project_wizard_seed_chosen: { seed: "brief" | "numo" | "import" | "none" };
  project_wizard_completed: {
    has_git_link: boolean;
    smart_assign_enabled: boolean;
    auto_assign_enabled: boolean;
  };
  project_created: { has_icon: boolean; has_git_link: boolean };
  project_opened: { project_id: string };
  project_deleted: { project_id: string };
  project_updated: { field: string };
  project_icon_changed: { kind: "favicon" | "upload" | "orb" };
  /** Relance du tirage de l'orbe générée (aucune propriété : c'est un geste). */
  project_orb_rerolled: NoProps;
  project_setup_resumed: { step: string };

  // ── Tickets : création ──
  issue_created: {
    source:
      | "dialog"
      | "palette"
      | "kanban"
      | "numo"
      | "board"
      | "objective"
      | "sub_issue"
      /** Promotion d'un retour : le formulaire s'ouvre déjà rempli par lui. */
      | "feedback";
    has_description: boolean;
    has_categories: boolean;
    has_assignee: boolean;
    priority: string;
    status: IssueStatus;
    effort?: string | null;
    /** Créé depuis le sélecteur « dans un autre projet ». */
    cross_project?: boolean;
    resource_count?: number;
    description_length_bucket?: string;
    /** Le ticket vient d'un brouillon local récupéré (MIN-41). */
    created_from_draft?: boolean;
    /** Smart-fill était armé sur ce ticket (MIN-260) : ses propriétés viennent
        du modèle, pas de la personne. Les autres propriétés de cet événement
        (priority, effort, has_categories) décrivent alors ce que le FORMULAIRE
        portait au moment de l'envoi, c'est-à-dire les défauts — le remplissage
        se fait côté serveur, après. À lire avec ce drapeau, jamais sans. */
    smart_fill?: boolean;
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
  /** Le fil d'une PAGE est la quatrième cible (MIN-282), et la seule qui
      puisse être ANCRÉE à un bloc — d'où `anchored`, absent des trois autres. */
  comment_added: {
    target: "issue" | "objective" | "feedback" | "page";
    length_bucket: string;
  };
  comment_deleted: { target: "issue" | "objective" | "feedback" | "page" };
  /** Une ressource ajoutée — fichier OU lien (MIN-184). Aucune donnée de
      contenu : ni l'URL, ni le titre, ni le nom de fichier. `size_bucket` et
      `mime_kind` (la FAMILLE MIME : image, application…) n'existent que pour un
      fichier. */
  resource_added: {
    target: "issue" | "objective" | "comment";
    kind: "file" | "link" | "page";
    size_bucket?: string;
    mime_kind?: string;
    compressed?: boolean;
  };
  resource_removed: { target: "issue" | "objective" | "comment" };
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

  // ── Vues enregistrées de la palette (un écran retenu sous un nom) ──
  saved_view_created: NoProps;
  saved_view_opened: NoProps;
  saved_view_deleted: NoProps;

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

  // ── Routines (MIN-185) — un run d'agent qui revient tout seul ──
  // On mesure la FORME du geste (cadence, modèle choisi ou non), jamais
  // l'instruction : elle décrit le dépôt de quelqu'un.
  routine_created: {
    frequency: string;
    model: string;
    reasoning_level: string;
    has_branch: boolean;
    prompt_length_bucket: string;
  };
  /** « Lancer maintenant » : un passage hors calendrier, déclenché à la main. */
  routine_run_now: NoProps;

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

  // ── Pages publiées et exportées (MIN-283) ──
  page_published: { has_password: boolean; with_children: boolean };
  page_unpublished: NoProps;
  page_exported: { format: "md" | "zip" | "pdf" };

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

  // ── Notifications push / web (MIN-183) ──
  //
  // AUCUNE PII : ni endpoint (c'est une adresse de livraison, donc un
  // identifiant d'appareil stable), ni user-agent brut, ni libellé d'appareil.
  // `platform` reste au niveau de `navigator.platform` (« MacIntel »,
  // « iPhone ») — assez pour savoir d'où viennent les activations, jamais assez
  // pour reconnaître quelqu'un.
  push_device_enabled: { platform: string };
  push_device_disabled: NoProps;
  push_device_removed: NoProps;
  /** La boîte de dialogue du navigateur a été refusée (ou l'était déjà) : c'est
   *  LE point de perte du parcours, et il ne se rattrape pas depuis la page. */
  push_permission_denied: NoProps;
  push_test_sent: NoProps;

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
  /** L'autre sens : l'export CSV depuis ⌘K. `scope` dit si le compte sort UN
   *  projet ou tout, `status_count` combien de statuts sont restés cochés — les
   *  deux réponses qu'on ne peut pas déduire du reste. Un `truncated: true`
   *  répété dirait que le plafond de la route est trop bas. */
  issues_exported: {
    scope: "project" | "all";
    status_count: number;
    issue_count: number;
    truncated: boolean;
  };
  /** Amorce d'un projet par un brief (MIN-172, MIN-173). Seule l'ÉCRITURE se
   *  compte encore côté navigateur : la demande et la proposition sont passées
   *  dans la conversation avec Numo, où elles sont un appel d'outil comme un
   *  autre. `issue_count` est ce qui RESTE après les décochages. */
  brief_split_applied: { issue_count: number; objective_count: number };

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

  // ── App de bureau (MIN-292) ──
  //
  // Ce sont les INTENTIONS. Le téléchargement lui-même est compté par le
  // serveur (`desktop_download_started`, dans app/api/desktop/download) : lui
  // seul sait qu'un fichier est parti, et il compte aussi les liens partagés
  // hors de l'app. Les deux ensemble donnent le taux d'aboutissement ; l'un
  // sans l'autre ne donne rien.
  /** La proposition d'installer l'app, sur l'accueil web — vue par quelqu'un
   *  qui y est éligible (un Mac, hors de l'app, jamais écartée). C'est le
   *  dénominateur des deux événements suivants. */
  desktop_install_prompt_shown: NoProps;
  desktop_install_prompt_clicked: { surface: "home_banner" | "settings" };
  /** « Non merci », et c'est pour toujours (voir lib/desktop/install-prompt.ts).
   *  Le rapport au `shown` dit si la proposition dérange plus qu'elle ne sert. */
  desktop_install_prompt_dismissed: NoProps;
  /** Le clic sur le bouton de `/download`. `arch` distingue le lien Intel du
   *  bouton principal : c'est ce qui dira si les vieux Mac valent encore leur
   *  build. */
  desktop_download_clicked: { arch: "arm64" | "x64" };
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
  // « page » depuis MIN-226 : le panneau latéral d'objectif a disparu au profit
  // de la page Objectifs, et c'est elle qui porte désormais la dictée d'édition.
  objective_dictation_used: { surface: "create_dialog" | "page" };
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
  "password_reset_requested",
  "password_reset_failed",
  "password_reset_completed",
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
  "project_wizard_draft_saved",
  "project_wizard_origin_chosen",
  "project_wizard_join_opened",
  "project_wizard_seed_chosen",
  "project_wizard_completed",
  "project_created",
  "project_opened",
  "project_deleted",
  "project_updated",
  "project_icon_changed",
  "project_orb_rerolled",
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
  "resource_added",
  "resource_removed",
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
  // Vues enregistrées de la palette
  "saved_view_created",
  "saved_view_opened",
  "saved_view_deleted",
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
  // Routines
  "routine_created",
  "routine_run_now",
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
  // Pages publiées (MIN-283)
  "page_published",
  "page_unpublished",
  "page_exported",
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
  "push_device_enabled",
  "push_device_disabled",
  "push_device_removed",
  "push_permission_denied",
  "push_test_sent",
  "project_member_invited",
  "project_member_removed",
  "project_invitation_responded",
  "category_created",
  "category_updated",
  "category_deleted",
  "import_started",
  "import_completed",
  "import_failed",
  "issues_exported",
  "brief_split_applied",
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
  // App de bureau
  "desktop_install_prompt_shown",
  "desktop_install_prompt_clicked",
  "desktop_install_prompt_dismissed",
  "desktop_download_clicked",
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
