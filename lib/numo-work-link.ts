export interface NumoWorkLink {
  id: string;
  conversation_id: string;
  work_conversation_id: string;
  detail_href: string;
}

/** Delegated work opens inside its parent Numo conversation; standalone work keeps its own surface. */
export function numoWorkDetailPath(work: NumoWorkLink): string {
  if (work.work_conversation_id && work.conversation_id !== work.work_conversation_id) {
    const conversation = encodeURIComponent(work.conversation_id);
    const run = encodeURIComponent(work.id);
    return `/numo?conversation=${conversation}&work=${run}`;
  }
  return work.detail_href;
}
