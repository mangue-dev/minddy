import "server-only";

import { backendFetchWithTimeout } from "@/lib/backend-availability";

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

export const supabaseServerFetch: typeof fetch = (input, init) => fetch(routeSupabaseInput(input), init);

/** Keep the existing auth deadline without imposing it on file uploads or RPCs. */
export const supabaseServerFetchWithTimeout: typeof fetch = (input, init) =>
  backendFetchWithTimeout(routeSupabaseInput(input), init);
