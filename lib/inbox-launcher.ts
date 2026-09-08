"use client";

export const OPEN_INBOX_EVENT = "minddy:open-inbox";

export function openInbox() {
  window.dispatchEvent(new Event(OPEN_INBOX_EVENT));
}
