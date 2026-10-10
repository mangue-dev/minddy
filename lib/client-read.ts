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

/** Bounded JSON/data reads only. Writes must never be automatically replayed. */
export function fetchClientRead(path: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith("/api/") || (init?.method ?? "GET").toUpperCase() !== "GET") {
    throw new Error("Client reads require a relative API path and GET method");
  }
  return withClientRequestDeadline(async (signal) => {
    const owner = await prepareClientSession();
    signal.throwIfAborted();
    const response = await fetch(path, { ...init, signal });
    // Include body consumption in the deadline: headers alone do not finish a read.
    const body = await response.arrayBuffer();
    signal.throwIfAborted();
    if (await prepareClientSession() !== owner) throw new Error("Local account changed");
    signal.throwIfAborted();
    return new Response(response.status === 204 || response.status === 304 ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  }, CLIENT_READ_TIMEOUT_MS, init?.signal);
}
