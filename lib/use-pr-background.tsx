"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPrActivityPreparation } from "./pr-activity-preparation";
import { createPrDiffRuntimePreparation, type PreparedPrDiffRuntime } from "./pr-diff-runtime-preparation";
import { useAllPullRequestsQuery } from "./use-agent-runs";
import { createPrBackgroundRefresh } from "./pr-background-refresh";
import { usePrLive } from "./use-pr-live";
import { firstDisplayedOpenPullRequestIds, PR_BACKGROUND_LIMIT } from "./pull-request-sections";

function LiveDetail({ prId }: { prId: string }) {
  usePrLive(prId);
  return null;
}

/** The account shell maintains the first five open PRs of the list while the window is visible. */
export function PrBackgroundSync() {
  const client = useQueryClient();
  const { pullRequests } = useAllPullRequestsQuery();
  const ids = firstDisplayedOpenPullRequestIds(pullRequests, PR_BACKGROUND_LIMIT);
  const identity = ids.join("|");
  const [diffRuntime, setDiffRuntime] = useState<PreparedPrDiffRuntime | null>(null);
  const refresh = useRef<ReturnType<typeof createPrBackgroundRefresh> | null>(null);
  useEffect(() => createPrDiffRuntimePreparation(client, identity ? identity.split("|") : [], setDiffRuntime), [client, identity]);
  useEffect(() => {
    const owner = createPrBackgroundRefresh(client);
    refresh.current = owner;
    return () => { owner.dispose(); if (refresh.current === owner) refresh.current = null; };
  }, [client]);
  useEffect(() => {
    refresh.current?.update(identity ? identity.split("|") : []);
  }, [client, identity]);
  useEffect(() => {
    const preparation = createPrActivityPreparation(client);
    preparation.update(identity ? identity.split("|") : []);
    return () => preparation.dispose();
  }, [client, identity]);
  const DiffRuntime = diffRuntime?.Surface;
  return <>
    {ids.map((prId) => <LiveDetail key={prId} prId={prId} />)}
    {ids.length > 0 && DiffRuntime && <DiffRuntime languages={diffRuntime.languages} />}
  </>;
}
