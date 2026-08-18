/**
 * Analytics Event Catalog — THE source of truth for PostHog events
 * emitted client-side via `useAnalytics().track()` (see `lib/use-analytics.ts`).
 *
 * To add an event:
 * 1. add a line to `AnalyticsEventProps` (name → prop form);
 * 2. add the name to the table `EVENT_NAMES`.
 * The `satisfies` refuses a name that does not exist in the catalog, and keeps it
 * `_assertNoMissingEvents` below refuses to compile if a cataloged
 * event is missing from the table. As `track()` is generic to
 * `AnalyticsEventName`, a typo at the call site is also a
 * compilation error — no more silently lost events.
 *
 * NAMING: snake_case, `^[a-z0-9_:-]+$` (see `sanitizeAnalyticsEventName`).
 *
 * DATA: never PII or free text in props — only
 * metadata (counters, booleans, ids, enums, slices via `lengthBucket` /
 * `durationBucket` / `sizeBucket`). The props are sanitized on sending
 * (primitives, ≤24 keys, strings ≤512 characters).
 *
 * SERVER events have their own closed catalog below. They pass
 * through the same sanitization when sending, even if their properties remain more flexible because they come from webhooks, crons and integrations.
 */

/**
 * Exhaustive catalog of events emitted by `lib/server/posthog.ts`.
 *
 * Keeping this list distinct from the client catalog avoids confusing a browser gesture
 * (subject to the choice of cookies) with the server business fact which makes
 * authority. The type closes call sites at compilation; Set protects
 * values ​​that would still cross an untyped JavaScript boundary.
 */
export const SERVER_ANALYTICS_EVENT_NAMES = [
  "account_data_exported",
  "account_deleted",
  "agent_run_completed",
  "agent_run_failed",
  "agent_run_started",
  "automation_chain_finished",
  "automation_chain_started",
  "desktop_download_started",
  "issue_created_server",
  "issue_updated_server",
  "mcp_tool_called",
  "mfa_disabled",
  "mfa_enabled",
  "oauth_grant_created",
  "public_feedback_created",
  "public_feedback_voted",
  "signup_email_confirmed",
  "subscription_activated",
  "subscription_cancelled",
  "subscription_paused",
  "subscription_payment_failed",
  "subscription_resumed",
  "subscription_updated",
  "user_signed_in",
  "user_signed_up",
] as const;

export type ServerAnalyticsEventName = typeof SERVER_ANALYTICS_EVENT_NAMES[number];

export const ALLOWED_SERVER_ANALYTICS_EVENTS: ReadonlySet<ServerAnalyticsEventName> =
  new Set(SERVER_ANALYTICS_EVENT_NAMES);

/** Primitive values ​​accepted after sanitization (optional for convenience). */
type PropValue = string | number | boolean | null | undefined;
/** Events that carry no structured prop. */
type NoProps = Record<string, never>;

/** Ticket statuses — taken from `lib/issue-constants.ts` (string to remain flexible). */
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
  /** “Forgotten password” route (MIN-297): requested, failed, completed. */
  password_reset_requested: NoProps;
  password_reset_failed: { reason: string };
  password_reset_completed: NoProps;
  user_signed_out: NoProps;

  // ── Onboarding (MIN-74) ──
  onboarding_viewed: { current_step: string; completed_count: number };
  onboarding_step_viewed: { step: string; step_number: number };
  onboarding_step_acknowledged: { step: string };
  /** “Import my tickets” step (MIN-98): which tool does the account come from.
 * `import_started` / `import_completed` already cover the import itself. */
  onboarding_import_provider_selected: { provider: string };
  /** “Join a project” in step 1: the account does not create one, it waits for an invitation. This is the only place in the product that says so. */
  onboarding_join_opened: NoProps;
  /** “Connect an agent” step: which one. Tells who to write the MCP
 * doc for first. */
  onboarding_mcp_agent_selected: { agent: string };
  /** "Your API key" step (MIN-149): The account has arrived with its key.
 * This is the measure of the BYOK argument — how many new accounts are already paying for their tokens elsewhere and don't have to be counted here. */
  onboarding_ai_key_added: NoProps;
  onboarding_dismissed: { last_step: string; completed_count: number };
  onboarding_completed: { steps_acknowledged: number };

  // ── Projects ──
  /** `draft` = a draft taken from the sidebar; `resume` = the
 * return of a round trip to the git provider, which is not a voluntary recovery
 * but the middle of a gesture. */
  project_wizard_opened: {
    source: "sidebar" | "home" | "palette" | "resume" | "draft";
  };
  project_wizard_step_viewed: { step: string };
  /** Closed WITHOUT keeping the entry. Since the project drafts, abandoning
 * is an explicit choice ("Abort") and no longer the default outcome of
 * any closure: it is `project_wizard_draft_saved` that must be compared to read the step which causes the disconnection. */
  project_wizard_abandoned: { last_step: string };
  /** Closed WHILE KEEPing input — the draft takes its line in the
 * sidebar. The stage says where we stop when we don't give up. */
  project_wizard_draft_saved: { step: string };
  /** The wizard's first question (MIN-171): where do we start from. This is the measure
 * of which of the two entries is really used — a new project to frame, or
 * a backlog that already exists elsewhere. */
  project_wizard_origin_chosen: { origin: "new" | "existing" };
  /** “I want to join a project”, from the “name” step: the account
 * did not have a project to create, it needed an invitation. This is a legitimate
 * ABANDONMENT of the wizard — to be removed from those who drop out. */
  project_wizard_join_opened: NoProps;
  /** What the seed step collected, including “nothing”: the gap between
 * the chosen origin and the retained seed says whether the step keeps its promise. */
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
  /** Restart drawing of the generated orb (no property: it's a gesture). */
  project_orb_rerolled: NoProps;
  project_setup_resumed: { step: string };

  // ── Tickets: creation ──
  issue_created: {
    source:
      | "dialog"
      | "palette"
      | "kanban"
      | "numo"
      | "board"
      | "objective"
      | "sub_issue"
      /** Promotion of a return: the form opens already completed by him. */
      | "feedback";
    has_description: boolean;
    has_categories: boolean;
    has_assignee: boolean;
    priority: string;
    status: IssueStatus;
    effort?: string | null;
    /** Created from the “in another project” selector. */
    cross_project?: boolean;
    resource_count?: number;
    description_length_bucket?: string;
    /** The ticket comes from a retrieved local draft (MIN-41). */
    created_from_draft?: boolean;
    /** Smart-fill was armed on this ticket (MIN-260): its properties come
 from the model, not from the person. The other properties of this event
 (priority, effort, has_categories) then describe what the FORM
 carried at the time of sending, that is to say the defaults — the filling
 is done on the server side, afterwards. To read with this flag, never without. */
    smart_fill?: boolean;
  };
  issue_create_dialog_opened: { source: string };
  issue_dictation_used: { surface: "create_dialog" | "side_panel" };
  issue_draft_recovered: NoProps;
  issue_draft_discarded: NoProps;

  // ── Tickets: edition ──
  issue_opened: { surface: string };
  /** `from` is only set if the caller knew the previous state. */
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
  /** The thread of a PAGE is the fourth target (MIN-282), and the only one that
 can be ANCHORED to a block — hence `anchored`, absent from the other three. */
  comment_added: {
    target: "issue" | "objective" | "feedback" | "page";
    length_bucket: string;
  };
  comment_deleted: { target: "issue" | "objective" | "feedback" | "page" };
  /** An added resource — file OR link (MIN-184). No data from
 content: neither the URL, nor the title, nor the file name. `size_bucket` and
 `mime_kind` (the MIME FAMILY: image, application…) only exist for one
 file. */
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

  // ── Saved views of the palette (one screen retained under a name) ──
  saved_view_created: NoProps;
  saved_view_opened: NoProps;
  saved_view_deleted: NoProps;

  // ── Group selection (MIN-75) ──
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
  // We measure the FORM of the gesture (cadence, model chosen or not), never
  // the instruction: it describes someone's deposit.
  routine_created: {
    frequency: string;
    model: string;
    reasoning_level: string;
    has_branch: boolean;
    prompt_length_bucket: string;
  };
  /** “Launch now”: an off-schedule passage, triggered by hand. */
  routine_run_now: NoProps;

  // ── Pull requests ──
  pr_list_viewed: { count: number };
  pr_opened: { state: string; provider: string };
  pr_diff_file_opened: NoProps;
  pr_review_comment_added: { length_bucket: string };
  pr_review_submitted: { verdict: string };
  /** “Have it checked by Numo” (MIN-141) — the review triggered by hand. */
  pr_ai_review_requested: NoProps;
  /**
 * Ticket attached BY HAND to a PR which did not have one (MIN-163). `pr_state`
 * says at what point in the life of the PR we catch the missing link — this is what
 * we want to know to judge whether the naming convention is sufficient.
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

  // ── Team-side feedback (MIN-37) ──
  /** Team action on a return (promote, merge, undo…) — the verb comes
 * from the last segment of the called route. */
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

  // ── Shared views (MIN-26) ──
  shared_view_opened: { has_password: boolean };
  shared_view_password_submitted: { success: boolean };
  share_link_created: { has_password: boolean };
  share_link_revoked: NoProps;
  share_link_copied: NoProps;

  // ── Published and exported pages (MIN-283) ──
  page_published: { has_password: boolean; with_children: boolean };
  page_unpublished: NoProps;
  page_exported: { format: "md" | "zip" | "pdf" };
  /** A page copied for an agent: `source` says if the gesture was made via the
 menu ⋯ or by ⌘L — this is what will say if the shortcut has found its audience,
 or if no one has discovered it. `with_instructions` says if the optional
 field was used: if it is never used, the dialog is toll. */
  page_copied_for_agent: { source: "menu" | "shortcut"; with_instructions: boolean };

  // ── Notifications ──
  notifications_opened: { unread_count: number; surface: "inbox" | "popover" };
  notification_clicked: { type: string; was_unread: boolean };
  notifications_marked_read: { count: number };
  notification_prefs_changed: { key: string; enabled: boolean };

  // ── Settings ──
  settings_opened: { scope: "account" | "project"; source: string };
  settings_tab_switched: { scope: "account" | "project"; tab: string };
  profile_updated: { field: "name" | "email" | "password" | "avatar" };
  language_changed: { locale: string };
  theme_changed: { theme: string };
  account_preference_toggled: { key: string; enabled: boolean };
  settings_assistant_prompt_sent: { scope: "account" | "project" };

  // Connections / integrations
  mcp_connect_opened: { source: string };
  mcp_install_copied: { client: string; method: string };
  mcp_client_link_opened: { client: string };
  ai_key_added: { provider: string };
  ai_key_removed: NoProps;
  git_connection_started: { provider: "github" | "gitlab" };
  git_connection_completed: { provider: "github" | "gitlab" };
  /** `provider` can be "unknown": disconnection is done by id of
 * connection, without the caller knowing which provider it is. */
  git_connection_removed: { provider: string };
  /** PERSONAL git account, under which PR gestures are sent (MIN-144) —
 * distinct from the installation of the App above. */
  git_identity_connect_started: { provider: "github" | "gitlab" };
  git_identity_removed: { provider: string };
  project_git_linked: { provider: string };
  project_git_unlinked: { provider: string };
  /** Unidirectional synchronization of linked repository outputs (MIN-97). */
  project_git_issue_sync_toggled: { provider: string; enabled: boolean };
  /** Cleaning up closed PR agent branches (MIN-102). */
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
  // NO PII: neither endpoint (it is a delivery address, therefore a
  // stable device identifier), neither raw user-agent nor device label.
  // `platform` reste au niveau de `navigator.platform` (« MacIntel »,
  // “iPhone”) — enough to know where the activations come from, never enough
  // to recognize someone.
  push_device_enabled: { platform: string };
  push_device_disabled: NoProps;
  push_device_removed: NoProps;
  /** The browser dialog has been refused (or already was): this is
 * THE lost point of the path, and it is not catching up from the page. */
  push_permission_denied: NoProps;
  push_test_sent: NoProps;

  // Members, categories, import
  project_member_invited: NoProps;
  project_member_removed: NoProps;
  project_invitation_responded: { response: "accepted" | "declined" };
  category_created: NoProps;
  category_updated: NoProps;
  category_deleted: NoProps;
  import_started: { source: string };
  import_completed: { source: string; issue_count: number };
  import_failed: { source: string; reason: string };
  /** The other direction: CSV export from ⌘K. `scope` says if the account leaves UN
 * project or all, `status_count` how many statuses remained checked — the
 * two answers that cannot be deduced from the rest. A repeated `truncated: true`
 * would say the route ceiling is too low. */
  issues_exported: {
    scope: "project" | "all";
    status_count: number;
    issue_count: number;
    truncated: boolean;
  };
  /** Start of a project with a brief (MIN-172, MIN-173). Only WRITING se
 * still counts on the browser side: the request and the proposal are passed
 * in the conversation with Numo, where they are a tool call like a
 * other. `issue_count` is what REMAINS after unchecks. */
  brief_split_applied: { issue_count: number; objective_count: number };

  // ── Billing (MIN-72) ──
  pricing_viewed: { surface: "marketing" | "app" };
  plan_cta_clicked: { plan_id: string; interval: string; current_plan_id: string };
  checkout_started: { plan_id: string; interval: string };
  billing_portal_opened: { current_plan_id: string };
  // Termination and recovery FROM the app (MIN-296): the gesture no longer goes through
  // the Stripe portal, so no more by `billing_portal_opened`.
  subscription_canceled: NoProps;
  subscription_resumed: NoProps;
  usage_viewed: NoProps;
  usage_history_filtered: { filter: string };
  plan_limit_hit: { limit_type: string; plan_id: string };
  upgrade_prompt_clicked: { source: string };

  // ── Site public (MIN-73) ──
  landing_viewed: NoProps;
  // `mcp_page`, `comparison` and `changelog`: the content pages added by
  //MIN-93. They exist only to be found — knowing which one leads
  // really at registration is half the lot measurement.
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
  // `landing_section_viewed` has been removed (MIN-150): cataloged at its creation,
  // he NEVER had a transmitter, and PostHog therefore never received one.
  // A name lying around here reads like an existing measurement — we think we can
  // query "which sections are seen", and the empty response passes as
  // an absence of traffic. Revert it = a line here + a client component
  // who emits it, both in the same gesture.
  landing_faq_opened: { question_index: number };

  // ── App de bureau (MIN-292) ──
  //
  // These are the INTENTIONS. The download itself is counted by the
  // server (`desktop_download_started`, in app/api/desktop/download): him
  // only knows that a file is gone, and it also counts shared links
  // outside the app. The two together give the success rate; mon
  // sans l'autre ne donne rien.
  /** The proposal to install the app, on the web home page — seen by someone
 * who is eligible (a Mac, outside the app, never rejected). This is the
 * denominator of the next two events. */
  desktop_install_prompt_shown: NoProps;
  desktop_install_prompt_clicked: { surface: "home_banner" | "settings" };
  /** "No thanks", and it's forever (see lib/desktop/install-prompt.ts).
 * The report to `shown` says if the proposal bothers more than it helps. */
  desktop_install_prompt_dismissed: NoProps;
  /** Clicking on the `/download` button. `arch` distinguishes the Intel link from the
 * main button: this is what will tell if old Macs are still worth their
 * build. */
  desktop_download_clicked: { arch: "arm64" | "x64" };
  /** Playable dictation demo (MIN-150). `input` distinguishes taking the microphone from
 * the example sentence: knowing which of the two makes the “aha” decides
 * which one to highlight. No dictated text comes back, ever. */
  landing_voice_demo_started: { input: "mic" | "sample" };
  /** `duration_bucket` = the wait between click and ticket filled. A demo
 * that takes ten seconds to respond is no longer a demo: it's the measure that
 * will tell you before anyone complains. */
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
  // “page” since MIN-226: the lens side panel has disappeared in favor
  // of the Objectives page, and it is she who now carries the editing dictation.
  objective_dictation_used: { surface: "create_dialog" | "page" };
  admin_dashboard_viewed: { tab: string };
  external_link_clicked: { destination: string };
}

/** Union of all cataloged names. */
export type AnalyticsEventName = keyof AnalyticsEventProps;

/** Props accepted by `track()` for a given name. */
export type AnalyticsPropsFor<E extends AnalyticsEventName> =
  AnalyticsEventProps[E] & Record<string, PropValue>;

/**
 * Runtime allowlist source. `satisfies` refuses a name absent from the catalog;
 * the lower guard refuses a cataloged name absent from this table.
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
  // Projects
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
  // Tickets: creation
  "issue_created",
  "issue_create_dialog_opened",
  "issue_dictation_used",
  "issue_draft_recovered",
  "issue_draft_discarded",
  // Tickets: edition
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
  // Saved views of the palette
  "saved_view_created",
  "saved_view_opened",
  "saved_view_deleted",
  // Bulk selection
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
  // Team feedback
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
  // Shared views
  "shared_view_opened",
  "shared_view_password_submitted",
  "share_link_created",
  "share_link_revoked",
  "share_link_copied",
  // Published pages (MIN-283)
  "page_published",
  "page_unpublished",
  "page_exported",
  "page_copied_for_agent",
  // Notifications
  "notifications_opened",
  "notification_clicked",
  "notifications_marked_read",
  "notification_prefs_changed",
  // Settings
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
  "subscription_canceled",
  "subscription_resumed",
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

// Compilation guard: if a cataloged event is missing from EVENT_NAMES, this type
// is that name and the `= true` assignment fails. Fix: Add it above.
type _MissingEvent = Exclude<AnalyticsEventName, (typeof EVENT_NAMES)[number]>;
const _assertNoMissingEvents: _MissingEvent extends never ? true : _MissingEvent = true;
void _assertNoMissingEvents;

/** Allowlist runtime consumed by `track()`. */
export const ALLOWED_ANALYTICS_EVENTS: ReadonlySet<AnalyticsEventName> = new Set(EVENT_NAMES);
