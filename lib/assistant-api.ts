"use client";

import { createSerialQueue } from "./serial-queue";
import type { Conversation } from "./assistant-types";

/** All user conversations, most recent first, projects
 * combined — Numo history no longer filters by scope (MIN-353). */
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/assistant/conversations");
  if (!res.ok) return [];
  return res.json();
}

export async function deleteConversation(
  conversationId: string
): Promise<boolean> {
  const res = await fetch(
    `/api/assistant/conversations?id=${encodeURIComponent(conversationId)}`,
    { method: "DELETE" }
  );
  return res.ok;
}

/** Open conversation, and its scope (MIN-353). The pointer lives in base:
 * it survives reloading, the next tab and the desktop app. */
export interface ActiveConversationRef {
  conversationId: string | null;
  projectId: string | null;
}

export async function fetchActiveConversation(): Promise<ActiveConversationRef> {
  const res = await fetch("/api/assistant/active-conversation");
  if (!res.ok) return { conversationId: null, projectId: null };
  return res.json();
}

/**
 * Pointer writes, END TO END.
 *
 * They follow each other closely and cancel each other: “new
 * conversation” clears, the first message written. Launched in parallel, nothing
 * guarantees that they arrive in the order in which they left — a DELETE
 * processed after the PUT leaves the base without a pointer while the thread is alive.
 * And ignoring the response of a stale write would not change anything: the server
 * has already applied it. Only the TRANSMIT order is controlled, hence the queue.
 */
const pointerWrites = createSerialQueue();

/** `null` clears the pointer (“new conversation”). Best-effort: lose
 * writing only costs a failed restart, never a message. */
export function setActiveConversation(
  conversationId: string | null
): Promise<void> {
  return pointerWrites(async () => {
    try {
      await fetch("/api/assistant/active-conversation", {
        method: conversationId ? "PUT" : "DELETE",
        ...(conversationId
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationId }),
            }
          : {}),
      });
    } catch {
      // Network cut — the pointer will update at the next message.
    }
  });
}
