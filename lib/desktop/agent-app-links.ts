/**
 * The only links to another app the desktop shell agrees to open (MIN-951).
 *
 * `navigationDecision` (nav-guard.ts) lets nothing but `http(s)` and `mailto`
 * leave the window, because handing an arbitrary scheme to the system is
 * execution. Sending a prompt to the user's coding agent needs three more
 * destinations, so they are named here one by one rather than by scheme: the
 * exact "new conversation with this prompt" link of each app, carrying its
 * prompt parameter and nothing else. A link to any other route of those apps
 * (settings, plugins, a folder to open) is refused.
 *
 * PURE module: `desktop/src/main.ts` asks it before `shell.openExternal`, and
 * the web page builds the same links in `lib/prompt-delivery.ts`.
 */

interface AgentAppRoute {
  protocol: string;
  host: string;
  pathname: string;
  /** The single query parameter the route may carry: the prompt. */
  param: string;
}

const AGENT_APP_ROUTES: readonly AgentAppRoute[] = [
  { protocol: "claude:", host: "code", pathname: "/new", param: "q" },
  { protocol: "codex:", host: "new", pathname: "", param: "prompt" },
  { protocol: "cursor:", host: "anysphere.cursor-deeplink", pathname: "/prompt", param: "text" },
];

/** Far above any prompt minddy builds; bounds what reaches the system. */
export const AGENT_APP_LINK_MAX_LENGTH = 64_000;

/** Whether `link` opens a new conversation, with a prompt, in a known agent app. */
export function isAgentAppLink(link: unknown): link is string {
  if (typeof link !== "string" || link.length > AGENT_APP_LINK_MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  if (url.username || url.password || url.port || url.hash) return false;
  const route = AGENT_APP_ROUTES.find(
    (candidate) =>
      candidate.protocol === url.protocol &&
      candidate.host === url.host &&
      candidate.pathname === url.pathname.replace(/\/$/, ""),
  );
  if (!route) return false;
  const params = [...url.searchParams.keys()];
  return params.length === 1 && params[0] === route.param && !!url.searchParams.get(route.param);
}
