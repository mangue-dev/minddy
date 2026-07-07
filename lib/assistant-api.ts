"use client";

import type { Conversation } from "./assistant-types";

export async function fetchConversations(
  projectId?: string | null
): Promise<Conversation[]> {
  const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const res = await fetch(`/api/assistant/conversations${params}`);
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
