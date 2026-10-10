"use client";

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "minddy-docs-topics";
const EMPTY: Record<string, boolean> = {};
let preferences = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(next: Record<string, boolean>) {
  preferences = next;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Navigation still works when browser storage is unavailable. */ }
  listeners.forEach(listener => listener());
}

/** Use a locale-independent article ID as the persisted topic key. */
export function documentationTopicKey(articles: { id: string; topic: string }[], topic: string) {
  return articles.filter(article => article.id && article.topic === topic).map(article => article.id).sort()[0];
}

export function openDocumentationTopic(topic: string) {
  if (preferences[topic] === true && Object.values(preferences).filter(Boolean).length === 1) return;
  const closedTopics = Object.fromEntries(Object.keys(preferences).map(key => [key, false]));
  publish({ ...closedTopics, [topic]: true });
}

/** Remember one open topic for this tab, shared by desktop and mobile navigation. */
export function useDocumentationTopics(activeTopic: string | undefined, activeArticleId: string | null) {
  const snapshot = useSyncExternalStore(subscribe, () => preferences, () => EMPTY);
  useEffect(() => {
    if (!initialized) {
      initialized = true;
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
          preferences = Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === "boolean"));
        }
      } catch { /* Ignore unavailable storage and stale preferences. */ }
      // Older sessions could remember several open topics; keep only one.
      const rememberedTopic = Object.keys(preferences).find(topic => preferences[topic]);
      if (rememberedTopic) openDocumentationTopic(activeTopic ?? rememberedTopic);
      listeners.forEach(listener => listener());
    }
    // Arrival on another article overrides a stored fold, even within the same topic.
    if (activeTopic) openDocumentationTopic(activeTopic);
  }, [activeTopic, activeArticleId]);

  return {
    isOpen: (topic: string) => snapshot[topic] ?? false,
    setOpen: (topic: string, open: boolean) => open ? openDocumentationTopic(topic) : publish({ ...preferences, [topic]: false }),
  };
}
