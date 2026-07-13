"use client";

import type { AttachmentInput, Comment, IssueEvent } from "./types";

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
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
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
  mentionedUserIds: string[] = [],
  parentId: string | null = null,
  attachments: AttachmentInput[] = []
): Promise<Comment> {
  return parseJson<Comment>(
    await fetch(`/api/issues/${issueId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        mentioned_user_ids: mentionedUserIds,
        parent_id: parentId,
        attachments,
      }),
    })
  );
}

export async function fetchObjectiveCommentsApi(objectiveId: string): Promise<Comment[]> {
  return parseJson<Comment[]>(await fetch(`/api/objectives/${objectiveId}/comments`));
}

export async function fetchObjectiveEventsApi(objectiveId: string): Promise<IssueEvent[]> {
  return parseJson<IssueEvent[]>(await fetch(`/api/objectives/${objectiveId}/events`));
}

export async function fetchFeedbackEventsApi(
  projectId: string,
  postId: string
): Promise<IssueEvent[]> {
  return parseJson<IssueEvent[]>(
    await fetch(`/api/projects/${projectId}/feedback/${postId}/events`)
  );
}

export async function addObjectiveCommentApi(
  objectiveId: string,
  body: string,
  mentionedUserIds: string[] = [],
  parentId: string | null = null,
  attachments: AttachmentInput[] = []
): Promise<Comment> {
  return parseJson<Comment>(
    await fetch(`/api/objectives/${objectiveId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        mentioned_user_ids: mentionedUserIds,
        parent_id: parentId,
        attachments,
      }),
    })
  );
}

export async function deleteAttachmentApi(attachmentId: string): Promise<void> {
  const response = await fetch(`/api/attachments/${attachmentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
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
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
}
