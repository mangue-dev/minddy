"use client";

import { createContext, useContext, type ComponentType, type ReactElement, type ReactNode } from "react";
import type { MentionMeta } from "@/lib/mention-link";

/**
 * Where a mention's hover card comes from (MIN-879).
 *
 * The card reads `GET /api/mentions/preview`, which needs a session, and
 * renders the app's issue card: the signed-in app provides it
 * (app/(app)/app-providers.tsx) and every other surface, the marketing site
 * and public pages included, renders the trigger alone. Pills and cards that
 * offer a hover card import this module, never the card itself, so a public
 * bundle never loads it.
 */
export interface MentionHoverProps {
  type: string;
  id: string;
  meta?: MentionMeta;
  /** The project the mention is read in: a person's role there. */
  project?: string | null;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Keeps the card closed without changing what is rendered. */
  disabled?: boolean;
  /** What a click on the trigger does: a click on the card does the same. */
  onOpen?: () => void;
  /** One element that takes a ref. */
  children: ReactElement;
}

const Context = createContext<ComponentType<MentionHoverProps> | null>(null);

export function MentionHoverProvider({
  card,
  children,
}: {
  card: ComponentType<MentionHoverProps>;
  children: ReactNode;
}) {
  return <Context.Provider value={card}>{children}</Context.Provider>;
}

/** The hover card of a mention where the app provides one, else its trigger. */
export function MentionHover(props: MentionHoverProps) {
  const Card = useContext(Context);
  return Card ? <Card {...props} /> : props.children;
}

/** Whether this surface shows hover cards: the signed-in app only. */
export function useMentionHoverAvailable(): boolean {
  return useContext(Context) !== null;
}
