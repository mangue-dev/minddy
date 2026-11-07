import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { backendFetchWithTimeout } from "@/lib/backend-availability";

const routineCause = new AsyncLocalStorage<string[]>();

/** Attribute product writes to the routine that caused them across async tools. */
export function withRoutineCause<T>(routineId: string | null, work: () => Promise<T>, ancestors: string[] = []): Promise<T> {
  return routineCause.run(routineId ? [...ancestors, routineId].slice(0, 8) : [], work);
}

const eventSuppression = new AsyncLocalStorage<boolean>();

/** Restoring a backup does not create product arrivals or replay archived work. */
export function withRoutineEventsSuppressed<T>(work: () => Promise<T>): Promise<T> {
  return eventSuppression.run(true, work);
}

/**
 * Who the product writes of an async scope act for (MIN-926). The event
 * journal reads it so background Numo's batches know whose gesture an event
 * is:
 * - `numo`: a Numo turn's writes. Never batched, so Numo cannot wake itself
 *   or another member's Numo.
 * - `user`: a person's own gesture. Batched to everyone else.
 * - `system`: automated work that is real news for every member (Smart
 *   Assign, an issue opened on the forge). It never borrows a row's author.
 * - `maintenance`: derived or housekeeping writes (re-sealing, cycle
 *   rollover, recurrence). Journaled for routines, never batched.
 */
export type EventActor =
  | { kind: "numo" | "user"; userId: string }
  | { kind: "system" | "maintenance"; userId?: undefined };

const eventActor = new AsyncLocalStorage<EventActor>();

/**
 * Attribute the event journal rows of `work`'s writes. The innermost scope
 * wins, so automated follow-up work started from a turn or a request can name
 * itself. The database trusts the actor id only from service-role requests
 * and otherwise uses the session's user.
 */
export function withEventActor<T>(actor: EventActor, work: () => Promise<T>): Promise<T> {
  return eventActor.run(actor, work);
}

/**
 * The person an authenticated request acts for. API routes write through the
 * service-role client, where the database cannot see the session, so the
 * authentication boundary (lib/server/api-auth.ts) fills this slot and every
 * later write of the request carries it.
 */
interface RequestActorSlot { userId: string | null }
const requestActor = new AsyncLocalStorage<RequestActorSlot>();

/**
 * Open the slot in the CALLER's async context. It must run synchronously,
 * before the caller's first `await`, so the continuation that resumes the
 * route handler sees the same slot that authentication fills later. Only an
 * authentication helper calls this, at its very start.
 */
export function openRequestActorSlot(): void {
  requestActor.enterWith({ userId: null });
}

/** Record the authenticated user in the slot opened for this request. */
export function setRequestActor(userId: string): void {
  const slot = requestActor.getStore();
  if (slot) slot.userId = userId;
}

/** The actor whose headers the current write carries, if any. */
export function currentEventActor(): EventActor | null {
  const explicit = eventActor.getStore();
  if (explicit) return explicit;
  const userId = requestActor.getStore()?.userId;
  return userId ? { kind: "user", userId } : null;
}

const requestSignal = new AsyncLocalStorage<AbortSignal>();

/** Apply a maintenance deadline to its SDK calls without affecting other requests. */
export function withSupabaseAbortSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return requestSignal.run(signal, work);
}

const authorizationGate = new AsyncLocalStorage<Promise<boolean>>();

/**
 * Overlap request-scoped reads with a pending authorization decision. Inside
 * `work`, request clients send immediately but deliver no response before
 * `authorized` fulfills with true, and every other client, including the
 * service role, sends nothing before then. A false decision delivers and sends
 * nothing at all, so no status, body, log or follow-up read can depend on a
 * denied read; `signal` releases the requests already in flight.
 */
export function withSupabaseAuthorizationGate<T>(authorized: Promise<boolean>, signal: AbortSignal,
  work: () => T): T {
  return requestSignal.run(signal, () => authorizationGate.run(authorized, work));
}

// A denied request stays pending so nothing observes its outcome. A fresh
// promise per request becomes collectable once its caller is dropped.
const withheld = () => new Promise<never>(() => {});

function sendAfter(authorized: Promise<boolean>, send: () => Promise<Response>): Promise<Response> {
  return authorized.then((allowed) => allowed ? send() : withheld());
}

function deliverAfter(authorized: Promise<boolean>, send: () => Promise<Response>): Promise<Response> {
  // Capture the outcome now so an early transport failure is never unhandled.
  const outcome = new Promise<Response>((resolve) => resolve(send()))
    .then((value) => ({ value }), (error: unknown) => ({ error }));
  return authorized.then((allowed) => allowed
    ? outcome.then((result) => "error" in result ? Promise.reject(result.error) : result.value)
    : withheld());
}

function scopedOptions(input: Parameters<typeof fetch>[0], init?: RequestInit): RequestInit | undefined {
  const scoped = requestSignal.getStore();
  const cause = routineCause.getStore();
  const actor = currentEventActor();
  if (cause?.length || eventSuppression.getStore() || actor) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (cause?.length) {
      headers.set("x-minddy-routine-cause", cause.at(-1)!);
      headers.set("x-minddy-routine-ancestors", JSON.stringify(cause));
    }
    if (eventSuppression.getStore()) headers.set("x-minddy-routine-suppress", "true");
    if (actor) {
      headers.set("x-minddy-actor-kind", actor.kind);
      if (actor.userId) headers.set("x-minddy-actor-id", actor.userId);
    }
    init = { ...init, headers };
  }
  if (!scoped) return init;
  const signals = [scoped];
  if (input instanceof Request) signals.push(input.signal);
  if (init?.signal) signals.push(init.signal);
  return { ...init, signal: AbortSignal.any(signals) };
}

/** Route server requests internally while preserving public SDK URLs and cookie names. */
function routeSupabaseInput(input: Parameters<typeof fetch>[0]) {
  const internal = process.env.SUPABASE_INTERNAL_URL;
  const publicOrigin = process.env.MINDDY_PUBLIC_SUPABASE_URL;
  if (!internal || !publicOrigin) return input;
  const target = new URL(internal);
  if (!/^https?:$/.test(target.protocol) || target.username || target.password ||
      target.pathname !== "/" || target.search || target.hash) {
    throw new Error("SUPABASE_INTERNAL_URL must be an HTTP(S) origin without credentials.");
  }
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== new URL(publicOrigin).origin) return input;
  url.protocol = target.protocol;
  url.host = target.host;
  return input instanceof Request ? new Request(url, input) : url;
}

export const supabaseServerFetch: typeof fetch = (input, init) => {
  const authorized = authorizationGate.getStore();
  const send = () => fetch(routeSupabaseInput(input), scopedOptions(input, init));
  return authorized ? sendAfter(authorized, send) : send();
};

/**
 * Fetch public Supabase material shared by every request, such as the signing
 * key set, with the backend deadline but without any request's abort signal or
 * authorization gate, so one request's outcome never fails another's fetch.
 */
export const supabaseSharedFetch: typeof fetch = (input, init) =>
  backendFetchWithTimeout(routeSupabaseInput(input), init);

/** Keep the existing auth deadline without imposing it on file uploads or RPCs. */
export const supabaseServerFetchWithTimeout: typeof fetch = (input, init) => {
  const authorized = authorizationGate.getStore();
  const send = () => backendFetchWithTimeout(routeSupabaseInput(input), scopedOptions(input, init));
  return authorized ? deliverAfter(authorized, send) : send();
};
