"use client";

import type { Comment, IssueEvent } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Requête échouée";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchCommentsApi(issueId: string): Promise<Comment[]> {
  return parseJson<Comment[]>(await fetch(`/api/issues/${issueId}/comments`));
}

export async function fetchEventsApi(issueId: string): Promise<IssueEvent[]> {
  return parseJson<IssueEvent[]>(await fetch(`/api/issues/${issueId}/events`));
}

export async function addCommentApi(
  issueId: string,
  body: string,
  mentionedUserIds: string[] = []
): Promise<Comment> {
  return parseJson<Comment>(
    await fetch(`/api/issues/${issueId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, mentioned_user_ids: mentionedUserIds }),
    })
  );
}

export async function updateCommentApi(commentId: string, body: string): Promise<Comment> {
  return parseJson<Comment>(
    await fetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    })
  );
}

export async function deleteCommentApi(commentId: string): Promise<void> {
  const response = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Suppression échouée"
    );
  }
}
