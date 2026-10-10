import { HttpResponseError } from "./backend-availability";
import { withClientRequestDeadline } from "./client-request-deadline";
import { getSupabase } from "./supabase";

export const CLIENT_READ_TIMEOUT_MS = 30_000;

/**
 * Renew browser cookies before protected reads. API handlers cannot persist
 * rotated cookies, and foreground requests can race the auth refresh ticker.
 * The SDK shares concurrent renewals; getSession is not an authorization check.
 */
export async function prepareClientSession(): Promise<string> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new HttpResponseError("Unauthorized", 401);
  return data.session.user.id;
}

/** Protected reads only. Archive transfers may opt out of the read deadline. */
export function fetchClientRead(
  path: string,
  init?: RequestInit,
  { timeoutMs = CLIENT_READ_TIMEOUT_MS }: { timeoutMs?: number | null } = {},
): Promise<Response> {
  if (!path.startsWith("/api/") || (init?.method ?? "GET").toUpperCase() !== "GET") {
    throw new Error("Client reads require a relative API path and GET method");
  }
  return withClientRequestDeadline(async (signal) => {
    // Unbounded archive transfers still bound both session preparations.
    const prepare = () => timeoutMs === null
      ? withClientRequestDeadline(prepareClientSession, CLIENT_READ_TIMEOUT_MS, signal)
      : prepareClientSession();
    const owner = await prepare();
    signal.throwIfAborted();
    const response = await fetch(path, { ...init, signal });
    // Include body consumption in the deadline: headers alone do not finish a read.
    const body = await response.arrayBuffer();
    signal.throwIfAborted();
    if (await prepare() !== owner) throw new Error("Local account changed");
    signal.throwIfAborted();
    return new Response(response.status === 204 || response.status === 304 ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  }, timeoutMs, init?.signal);
}
