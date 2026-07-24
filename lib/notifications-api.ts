"use client";

import type { MyNotification } from "./types";

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

export async function fetchNotificationsApi(): Promise<MyNotification[]> {
  return parseJson<MyNotification[]>(await fetch("/api/notifications"));
}

const patch = async (body: unknown): Promise<void> => {
  await parseJson(
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
};

const del = async (body: unknown): Promise<void> => {
  await parseJson(
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
};

export async function markReadApi(ids: string[]): Promise<void> {
  await patch({ ids });
}

export async function markAllReadApi(): Promise<void> {
  await patch({ all: true });
}

export async function markUnreadApi(ids: string[]): Promise<void> {
  await patch({ ids, read: false });
}

export async function removeNotificationsApi(ids: string[]): Promise<void> {
  await del({ ids });
}

export async function clearReadNotificationsApi(): Promise<void> {
  await del({ allRead: true });
}
