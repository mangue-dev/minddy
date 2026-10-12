import type { ComponentType } from "react";
import { hashKey, type QueryClient } from "@tanstack/react-query";
import type { SupportedLanguages } from "@pierre/diffs";
import { prepareAppTabSurface } from "./app-tab-surfaces";
import { prActivityPreparationQueries } from "./pr-activity-query";

type Runtime = typeof import("@/components/pull-requests/pr-diff-workers");
export type PreparedPrDiffRuntime = { Surface: ComponentType<{ languages: SupportedLanguages[] }>; languages: SupportedLanguages[] };

/** Prepare public code and grammars only; protected patches never enter this owner. */
export function createPrDiffRuntimePreparation(
  client: QueryClient,
  ids: readonly string[],
  onReady: (runtime: PreparedPrDiffRuntime) => void,
  load: () => Promise<Runtime> = () => Promise.all([
    import("@/components/pull-requests/pr-diff-workers"), prepareAppTabSurface("/pull-requests"),
  ]).then(([runtime]) => runtime),
  schedule: (work: () => void, delay: number) => () => void = (work, delay) => {
    let idle: number | undefined;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(work, { timeout: 1_000 });
      else work();
    }, delay);
    return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
  },
) {
  let disposed = false, loading = false, retryAt = 0, signature = "";
  let runtime: Runtime | undefined, cancel: (() => void) | undefined;
  const recent = [...new Set(ids)].slice(0, 5);
  const auxiliaryKeys = new Set(recent.flatMap((id) => prActivityPreparationQueries(id).map((options) => hashKey(options.queryKey))));
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  // An unobserved auxiliary preparation must not starve its public code. A
  // foreground observer joining that exact read restores transport priority.
  const otherTransport = () => client.getQueryCache().getAll().some((query) => query.state.fetchStatus === "fetching" &&
    !(auxiliaryKeys.has(query.queryHash) && query.getObserversCount() === 0));
  const enqueue = (delay = 50) => {
    if (!disposed && !cancel && visible() && !otherTransport()) cancel = schedule(prepare, delay);
  };
  const prepare = () => {
    cancel = undefined;
    if (disposed || !visible() || otherTransport()) return;
    if (retryAt > Date.now()) { enqueue(retryAt - Date.now()); return; }
    const paths = recent.flatMap((id) => {
      const state = client.getQueryState<{ files?: { filename: string; patch?: string }[] }>(["pull-request", id]);
      return state?.status === "success" ? (state.data?.files ?? []).slice(0, 32)
        .filter((file) => file.patch).map((file) => file.filename) : [];
    });
    if (!paths.length) return;
    if (runtime) {
      const languages = runtime.preparedDiffLanguages(paths);
      const next = languages.join("|");
      if (signature !== next) { signature = next; onReady({ Surface: runtime.PrDiffRuntimePreparation, languages }); }
    } else if (!loading) {
      loading = true;
      void load().then((loaded) => {
        if (!disposed) { runtime = loaded; enqueue(); }
      }).catch(() => { if (!disposed) { retryAt = Date.now() + 60_000; enqueue(60_000); } })
        .finally(() => { loading = false; });
    }
  };
  const changed = () => { cancel?.(); cancel = undefined; enqueue(); };
  const unsubscribe = client.getQueryCache().subscribe(changed);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", changed);
  enqueue();
  return () => {
    disposed = true; cancel?.(); unsubscribe();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", changed);
  };
}
