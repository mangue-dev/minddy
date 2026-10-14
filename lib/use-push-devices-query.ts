"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPushDevicesApi } from "./push-devices-api";

export const pushDevicesQueryKey = ["push-devices"] as const;

/** Devices subscribed to account push notifications (MIN-183). */
export function usePushDevicesQuery() {
  const { data, isPending } = useQuery({
    queryKey: pushDevicesQueryKey,
    queryFn: fetchPushDevicesApi,
  });
  return {
    devices: data?.devices ?? [],
    capabilities: data?.capabilities ?? null,
    loading: isPending,
  };
}
