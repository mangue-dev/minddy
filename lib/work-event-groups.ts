export type WorkEvent<T> = {
  key: string;
  kind: "text" | "action";
  content: T;
  count?: number;
  active?: boolean;
  /** Changes when a new one-time credential needs to be shown. Contains call IDs only. */
  revealKey?: string;
};

export function workEventsRevealKey<T>(events: WorkEvent<T>[]): string | undefined {
  const keys = events.flatMap((event) => event.revealKey ? [event.revealKey] : []);
  return keys.length > 0 ? JSON.stringify(keys) : undefined;
}

/** Keep narration visible and combine every consecutive action, regardless of type. */
export function groupWorkEvents<T>(events: WorkEvent<T>[]) {
  const groups: { key: string; events: WorkEvent<T>[]; count: number; active: boolean }[] = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (event.kind === "action" && previous?.events[0].kind === "action") {
      previous.events.push(event);
      previous.count += event.count ?? 1;
      previous.active ||= event.active ?? false;
    } else {
      groups.push({
        key: event.key,
        events: [event],
        count: event.kind === "action" ? event.count ?? 1 : 0,
        active: event.active ?? false,
      });
    }
  }
  return groups;
}
