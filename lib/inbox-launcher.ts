"use client";

export const OPEN_INBOX_EVENT = "minddy:open-inbox";

/** What a launch can ask of the inbox beyond opening it. */
export interface OpenInboxDetail {
  /** The notification to show: the inbox picks the tab that lists it,
   *  scrolls to its row and pulses it (MIN-846). */
  notificationId?: string;
  /** Open it, never close it: a notification or a link asked for it. */
  show?: boolean;
}

export function openInbox() {
  window.dispatchEvent(new Event(OPEN_INBOX_EVENT));
}

/**
 * Opens the inbox on one notification. Unlike `openInbox`, which toggles the
 * popover like its sidebar button, this always leaves it open: the command
 * palette asked for a row, and closing an open inbox would hide it.
 */
export function openInboxAtNotification(notificationId: string) {
  window.dispatchEvent(
    new CustomEvent<OpenInboxDetail>(OPEN_INBOX_EVENT, { detail: { notificationId } }),
  );
}

/** Opens the inbox, and leaves it open when it already is. */
export function showInbox() {
  window.dispatchEvent(new CustomEvent<OpenInboxDetail>(OPEN_INBOX_EVENT, { detail: { show: true } }));
}
