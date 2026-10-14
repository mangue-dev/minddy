"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useIsRestoring, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { localSnapshotGeneration } from "@/lib/local-snapshots";
import { createRestoredPageBootstrapIngestion } from "@/lib/restored-page-bootstrap-ingestion";
import type { RestoredPageBootstrapRecord } from "@/lib/restored-page-bootstrap-types";

// AppProviders imports this module before account/auth effects. A late streamed
// chunk cannot recapture a generation after logout, even after a provider remount.
const initialDocumentGeneration = localSnapshotGeneration();
type AccountClaim = { ownerId: string; clientId: number };
type AccountLease = AccountClaim & { active: boolean };
const clientIds = new WeakMap<QueryClient, number>();
let nextClientId = 1;
let initialAccountClaim: AccountClaim | null = null;
const NavigationContext = createContext<{ documentGeneration: number; startedAt: number; claim: AccountClaim | null } | null>(null);
const AccountContext = createContext<AccountLease | null>(null);

/** Mount above the account-keyed QueryProvider so retirement cannot reset this fence. */
export function RestoredPageBootstrapNavigation({ children }: { children: ReactNode }) {
  const [navigation] = useState(() => ({ documentGeneration: initialDocumentGeneration,
    startedAt: typeof window === "undefined" ? 0 : Math.floor(performance.timeOrigin), claim: null as AccountClaim | null }));
  return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
}

/** Always mount inside the initial account client, even before any record streams. */
export function RestoredPageBootstrapAccount({ children }: { children: ReactNode }) {
  const navigation = useContext(NavigationContext);
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const [lease, setLease] = useState<AccountLease | null>(null);
  useLayoutEffect(() => {
    if (!navigation || loading || !user || navigation.documentGeneration !== localSnapshotGeneration()) {
      setLease(null);
      return;
    }
    let clientId = clientIds.get(client);
    if (clientId === undefined) { clientId = nextClientId++; clientIds.set(client, clientId); }
    if (!initialAccountClaim) initialAccountClaim = { ownerId: user.id, clientId };
    if (!navigation.claim) navigation.claim = initialAccountClaim;
    const admitted = navigation.claim.ownerId === user.id && navigation.claim.clientId === clientId;
    const current = admitted ? { ownerId: user.id, clientId, active: true } : null;
    setLease(current);
    return () => { if (current) current.active = false; };
  }, [client, loading, navigation, user?.id]);
  return <AccountContext.Provider value={lease}>{children}</AccountContext.Provider>;
}

/** A streamed server record renders no interface and never performs a request. */
export function RestoredPageBootstrapRecordView({ record }: { record: RestoredPageBootstrapRecord }) {
  const navigation = useContext(NavigationContext);
  const account = useContext(AccountContext);
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const isRestoring = useIsRestoring();
  const owner = useRef(user?.id ?? null);
  const currentClient = useRef(client);
  owner.current = user?.id ?? null;
  currentClient.current = client;
  useLayoutEffect(() => {
    if (!navigation || !account?.active || account.ownerId !== record.ownerId ||
        clientIds.get(client) !== account.clientId || loading || owner.current !== record.ownerId) return;
    const ingestion = createRestoredPageBootstrapIngestion(client, { ...navigation, ownerId: record.ownerId,
      currentOwner: () => account.active ? owner.current : null, currentClient: () => currentClient.current });
    ingestion.ingest(record, { isRestoring });
    return () => ingestion.dispose();
  }, [account, client, isRestoring, loading, navigation, record, user?.id]);
  return null;
}
