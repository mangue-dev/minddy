import "server-only";

import type { PrViewer } from "@/lib/pull-request-contract";
import type { PrScope } from "./pr-scope";

export async function resolveViewer(scope: PrScope): Promise<PrViewer> {
  const provider = scope.target.provider;
  const configured = scope.forge.identity.userAuthConfigured();
  const numoLogin = scope.forge.identity.botLogin();
  // `scope.actor()` never rejects: a resolution failure produces
  // `capability: "none"`.
  const actor = await scope.actor();
  if (actor.kind === "actor") {
    return {
      provider,
      configured,
      connected: true,
      expired: false,
      login: actor.login,
      avatarUrl: actor.avatarUrl,
      capability: actor.capability,
      numoLogin,
      projectReadOnly: !scope.canWrite,
    };
  }
  return {
    provider,
    configured,
    // "Not a repository member" implies a connected account: telling it
    // apart from "no account" is what the two UI states are for. An expired
    // token leads to the same reconnect button as "no account", so it counts
    // as not connected, with its own sentence.
    connected: actor.reason === "noRepoAccess",
    expired: actor.reason === "expired",
    login: actor.login ?? null,
    avatarUrl: null,
    capability: "none",
    numoLogin,
    projectReadOnly: !scope.canWrite,
  };
}
