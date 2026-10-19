"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

type Metadata = Record<string, unknown> | null | undefined;

/**
 * One account preference stored in `user_metadata`, as every switch of the
 * Preferences, Issues and Smart Fill tabs reads and writes it.
 *
 * Optimistic and NOT locked: the control moves at once, the GoTrue write is
 * serialized by `updateUserMetadata` (merge-safe) and a failure puts the
 * previous value back with a toast. The resolved value is mirrored again
 * whenever the account changes (an update resolves, a Realtime refresh lands).
 */
export function useAccountPreference<T>(
  key: string,
  resolve: (meta: Metadata) => T,
): readonly [T, (next: T) => Promise<void>, boolean] {
  const { user, updateUserMetadata } = useAuth();
  const [value, setValue] = useState<T>(() => resolve(user?.user_metadata));

  useEffect(() => {
    setValue(resolve(user?.user_metadata));
    // `resolve` is a module-level resolver; only the account drives a resync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const change = async (next: T) => {
    if (!user || Object.is(next, value)) return;
    const previous = value;
    setValue(next);
    try {
      await updateUserMetadata({ [key]: next });
    } catch (e) {
      setValue(previous);
      toast.error((e as Error).message);
    }
  };

  return [value, change, !!user] as const;
}
