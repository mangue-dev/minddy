import "server-only";

import type { InstallationToken } from "./github-app";
import { forgeProviderForConnection } from "./forge-provider";

/**
 * GitHub installation token for ONE linked repository (MIN-327). The token is
 * scoped to the repository's stable id, which survives renames and cannot
 * authorize another repository that later reuses the old owner/name.
 *
 * The connection's `source` picks the mint: a relayed connection mints through
 * the Cloud control plane (docs/managed-forge-relay-plan.md), because the local
 * App key does not exist there or belongs to another App.
 */
export async function mintLinkedRepositoryToken(link: {
  installationId: number | string;
  externalRepoId: string;
  connectionSource: string | null | undefined;
}): Promise<InstallationToken> {
  const repositoryId = Number(link.externalRepoId);
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
    throw new Error("GitHub link is missing a stable repository id");
  }
  return forgeProviderForConnection(link.connectionSource).getInstallationToken({
    installationId: link.installationId,
    scope: { repositoryIds: [repositoryId] },
  });
}
