import type { DesktopIpcHandlers } from "@/lib/desktop/ipc-main";
import type { LocalAccountSession } from "@/lib/desktop/local-account";

interface LocalDependencies {
  /** The local clone this app runs, `null` when none is selected. */
  runtimeRoot: () => string | null;
  /** Whether the launcher this app started for `root` is still alive. */
  ownsRuntime: (root: string) => boolean;
  accountSession: (root: string) => Promise<LocalAccountSession | null>;
  stopRuntime: () => void;
  startRuntime: (root: string) => Promise<void>;
  reloadWindow: () => void;
}

type LocalChannel = "minddy:local-account:session" | "minddy:local-runtime:restart";

/**
 * The local instance this app installed: its channels' `local` policy admits
 * only that instance's pages while it is the selected server.
 */
export function localHandlers<E>(deps: LocalDependencies): Pick<DesktopIpcHandlers<E>, LocalChannel> {
  /** Whatever else answers on the local port is not the instance this app started. */
  const ownedRoot = () => {
    const root = deps.runtimeRoot();
    return root && deps.ownsRuntime(root) ? root : null;
  };
  return {
    // The local instance's managed account (MIN-781): the password never
    // leaves this process.
    "minddy:local-account:session": () => {
      const root = ownedRoot();
      return root ? deps.accountSession(root) : null;
    },
    // Applies an instance variable changed in the admin dashboard that needs
    // a restart (MIN-847).
    "minddy:local-runtime:restart": async () => {
      const root = ownedRoot();
      if (!root) return false;
      deps.stopRuntime();
      await deps.startRuntime(root);
      deps.reloadWindow();
      return true;
    },
  };
}
