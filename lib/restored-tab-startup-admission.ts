import type { QueryClient } from "@tanstack/react-query";
import { navigationPreparationPriority } from "@/lib/navigation-preparation-priority";
import { openStartupReads } from "@/lib/startup-read-admission";

/**
 * Hold optional work while this exact account/session resolves its existing
 * canonical list and window selection. This starts no queries and grants no
 * cache authority. Construct once per owner, session and QueryClient.
 */
export function createRestoredTabStartupAdmission(client: QueryClient) {
  const priority = navigationPreparationPriority(client);
  let mounted = false, generation = 0, finished = false;
  return {
    mount() {
      const current = ++generation;
      mounted = true;
      if (!finished) priority.acquire();
      return () => {
        if (current !== generation) return;
        mounted = false;
        // Strict Mode reattaches synchronously. A real retirement releases
        // this exact token on the next microtask, never another owner's token.
        queueMicrotask(() => {
          if (mounted || current !== generation) return;
          priority.release();
        });
      };
    },
    handoff(prepare: () => void) {
      if (!mounted) return;
      // The finite worker acquires its own priority before optional listeners
      // can observe release. Later visits still run after startup is finished.
      try { prepare(); }
      finally { finished = true; priority.release(); openStartupReads(client); }
    },
    fail() {
      if (!mounted || finished) return;
      finished = true;
      priority.release();
      openStartupReads(client);
    },
  };
}
