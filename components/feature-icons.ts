import {
  Analytics01Icon,
  BubbleChatDelayIcon,
  DateTimeIcon,
  Layout3ColumnIcon,
} from "@hugeicons/core-free-icons";

/**
 * One glyph per feature (MIN-690): the one its sidebar entry shows. Every
 * other surface naming the same feature (empty states, menus, tabs, tool
 * calls) uses these, so a feature is recognized by the same icon everywhere.
 */
export const BOARD_ICON = Layout3ColumnIcon;
export const ROUTINE_ICON = BubbleChatDelayIcon;
export const STATISTICS_ICON = Analytics01Icon;
/** A date or deadline. Recurring dates keep `RepeatIcon`; created-at times keep their clock. */
export const DATE_ICON = DateTimeIcon;
