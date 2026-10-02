import type { SupabaseClient } from "@supabase/supabase-js";

/** Bind each query to this tool's signal without changing the shared client. */
export function abortableReadClient(client: SupabaseClient, signal: AbortSignal): SupabaseClient {
  return new Proxy(client, {
    get(target, key) {
      if (key === "from") {
        return (relation: string) => new Proxy(target.from(relation), {
          get(query, method) {
            if (method === "select") {
              return (...args: Parameters<typeof query.select>) => query.select(...args).abortSignal(signal);
            }
            const value = query[method as keyof typeof query];
            return typeof value === "function" ? value.bind(query) : value;
          },
        });
      }
      if (key === "rpc") {
        return (...args: Parameters<typeof target.rpc>) => target.rpc(...args).abortSignal(signal);
      }
      const value = target[key as keyof SupabaseClient];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
