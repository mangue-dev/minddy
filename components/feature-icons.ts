import {
  AiAutoRotateIcon,
  AiContentGenerator01Icon,
  AiUserIcon,
  Analytics01Icon,
  BubbleChatDelayIcon,
  DateTimeIcon,
  GitPullRequestIcon,
  Layout3ColumnIcon,
  PlugIcon,
  StickyNote02Icon,
} from "@hugeicons/core-free-icons";

/**
 * One glyph per feature (MIN-690): the one its sidebar entry shows. Every
 * other surface naming the same feature (empty states, menus, tabs, tool
 * calls) uses these, so a feature is recognized by the same icon everywhere.
 */
export const BOARD_ICON = Layout3ColumnIcon;
export const ROUTINE_ICON = BubbleChatDelayIcon;
export const STATISTICS_ICON = Analytics01Icon;
export const PULL_REQUEST_ICON = GitPullRequestIcon;
export const CYCLE_ICON = AiAutoRotateIcon;
/** The task notebook. */
export const SCRATCHPAD_ICON = StickyNote02Icon;
/** A connected MCP server. */
export const MCP_ICON = PlugIcon;
/** A date or deadline. Recurring dates keep `RepeatIcon`; created-at times keep their clock. */
export const DATE_ICON = DateTimeIcon;
/** Smart Fill: properties a new ticket receives from its text. */
export const SMART_FILL_ICON = AiContentGenerator01Icon;
/** Smart Assign: the assignee chosen for a ticket leaving triage. */
export const SMART_ASSIGN_ICON = AiUserIcon;
