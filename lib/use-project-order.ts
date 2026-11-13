"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "./auth-context";
import { PROJECT_ORDER_META_KEY, resolveProjectOrder } from "./project-order";

/**
 * My saved project order (MIN-968) and the way to change it. The change is
 * optimistic: the sidebar moves at once, the account write goes through the
 * merge-safe `updateUserMetadata`, and a failure puts the previous order back
 * with an error toast.
 */
export function useProjectOrder(): {
  order: string[];
  setOrder: (next: string[]) => Promise<void>;
} {
  const t = useTranslations("Projects");
  const { user, updateUserMetadata } = useAuth();
  const [order, setLocalOrder] = useState(() => resolveProjectOrder(user?.user_metadata));
  const orderRef = useRef(order);

  // A write that resolves, or a refresh from another device, brings the
  // account's order back in.
  useEffect(() => {
    const next = resolveProjectOrder(user?.user_metadata);
    orderRef.current = next;
    setLocalOrder(next);
  }, [user]);

  const setOrder = useCallback(async (next: string[]) => {
    if (!user) return;
    const previous = orderRef.current;
    orderRef.current = next;
    setLocalOrder(next);
    try {
      await updateUserMetadata({ [PROJECT_ORDER_META_KEY]: next });
    } catch {
      // Only when no later move has replaced this one.
      if (orderRef.current === next) {
        orderRef.current = previous;
        setLocalOrder(previous);
      }
      toast.error(t("reorderFailed"));
    }
  }, [user, updateUserMetadata, t]);

  return { order, setOrder };
}
