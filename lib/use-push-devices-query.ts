"use client";

import { useQuery } from "@tanstack/react-query";
import { useStartupReadsAdmitted } from "./startup-read-admission";
import { fetchPushDevicesApi } from "./push-devices-api";

export const pushDevicesQueryKey = ["push-devices"] as const;

/** Devices subscribed to account push notifications (MIN-183). */
/** Chrome callers defer until startup restoration; page content reads at once. */
type StartupDeferral = { deferUntilStartup?: boolean };
export function usePushDevicesQuery({ deferUntilStartup = false }: StartupDeferral = {}) {
  const admitted = useStartupReadsAdmitted();
  const { data, isPending } = useQuery({
    queryKey: pushDevicesQueryKey,
    queryFn: fetchPushDevicesApi,
    enabled: !deferUntilStartup || admitted,
  });
  return {
    devices: data?.devices ?? [],
    capabilities: data?.capabilities ?? null,
    loading: isPending,
  };
}
