/** Portaled sidebar controls belong to the rail that opened them. */
export function isSidebarPointerTarget(rail: HTMLElement | null, target: EventTarget | null): boolean {
  if (!rail || !(target instanceof Node)) return false;
  if (rail.contains(target)) return true;
  const element = target instanceof Element ? target : target.parentElement;
  return !!rail.id && element?.closest("[data-sidebar-owner]")?.getAttribute("data-sidebar-owner") === rail.id;
}
