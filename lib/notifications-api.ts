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
      (data as { error?: string } | null)?.error || text.trim() || "Requête échouée";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchNotificationsApi(): Promise<MyNotification[]> {
  return parseJson<MyNotification[]>(await fetch("/api/notifications"));
}

export async function markReadApi(ids: string[]): Promise<void> {
  await parseJson(
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
  );
}

export async function markAllReadApi(): Promise<void> {
  await parseJson(
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
  );
}
