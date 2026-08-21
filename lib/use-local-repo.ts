"use client";

import { useCallback, useEffect, useState } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import type { LocalRepoState } from "@/lib/desktop/local-repo";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";

/**
 * THE LOCAL FILE OF A PROJECT, SEEN FROM THE PAGE (MIN-359).
 *
 * A single hook for the two surfaces which talk about it: the settings map of the
 * project, which attaches it, and the environment selector of the conversation, which
 * decides if the "my machine" choice exists.
 *
 * **`null` anywhere other than in the desktop app**, and this is the normal case:
 * in a browser there is no bridge, therefore no attachment possible, therefore
 * no selector — not a grayed-out selector that would promise something.
 *
 * The deposit against which we validate comes from the link of the project
 * (`useProjectGitLinkQuery`). WITHOUT a linked deposit the attachment still
 * exists — the folder is then validated as a plain git repository, remote
 * optional: that is what makes a local-only project (no forge connected) work
 * in the desktop app.
 */
export function useLocalRepo(projectId: string | null) {
  const { link, loading: linkLoading } = useProjectGitLinkQuery(projectId);
  const fullName = link?.repo_full_name ?? null;
  const [state, setState] = useState<LocalRepoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);

  // The page is served remotely, the preload is not: a typo already
  // open can therefore precede this member. It remains local, simply without
  // new listing, rather than failing the entire attachment read.
  const readBranches = useCallback((bridge: NonNullable<ReturnType<typeof getDesktopBridge>>) => {
    if (!projectId || !bridge.localRepoBranches) return Promise.resolve([]);
    return bridge.localRepoBranches({ projectId, fullName });
  }, [projectId, fullName]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || !projectId) {
      setState(null);
      setBranches([]);
      return;
    }
    // The response from a project that has just left should not be displayed on
    // the next one: the next montage starts from `null`, this one goes silent.
    let alive = true;
    void bridge
      .localRepo({ projectId, fullName })
      .then((next) => {
        if (!alive) return;
        setState(next);
        if (next.status !== "ready") {
          setBranches([]);
          return;
        }
        void readBranches(bridge).then((names) => {
          if (alive) setBranches(names);
        }).catch(() => {
          if (alive) setBranches([]);
        });
      })
      .catch(() => {
        if (alive) {
          setState({ status: "none" });
          setBranches([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [projectId, fullName, readBranches]);

  /** Opens the system panel. Gives the verdict, for the appellant to say. */
  const attach = useCallback(async (): Promise<LocalRepoState | null> => {
    const bridge = getDesktopBridge();
    if (!bridge || !projectId || busy) return null;
    setBusy(true);
    try {
      const next = await bridge.chooseLocalRepo({ projectId, fullName });
      // A REFUSED folder is not stored on the app side: we therefore do not display it
      // like the current state, we return it to the caller who will make a message.
      if (next.status === "ready") {
        setState(next);
        setBranches(await readBranches(bridge).catch(() => []));
      }
      return next;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [projectId, fullName, busy, readBranches]);

  const detach = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge || !projectId || busy) return;
    setBusy(true);
    try {
      setState(await bridge.forgetLocalRepo({ projectId }));
    } catch {
      // Nothing to repair: the displayed state remains the one before, and the next one
      // mount will reread the disk.
    } finally {
      setBusy(false);
    }
  }, [projectId, busy]);

  return {
    /** Is the desktop app present in this window? */
    available: !!getDesktopBridge(),
    /** `null` outside of desktop app, or until first read responds. */
    state,
    /** The folder is attached AND still valid: local run is possible. */
    ready: state?.status === "ready",
    /** Branches already present in the checkout attached to this machine. */
    branches,
    /**
     * The project has a linked repository. Informational: a project WITHOUT a
     * link can still attach a folder and run locally — only the cloud needs
     * the link.
     */
    linked: !!fullName,
    /**
     * The git-link query has not answered yet: `linked` is `false` by default,
     * including for a project that HAS a link. A caller that refuses on
     * `!linked` must also wait on this, or it rejects too early.
     */
    linkLoading,
    busy,
    attach,
    detach,
  };
}
