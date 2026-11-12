"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { installClipboardHaptics, resolveHaptics, setHapticsEnabled } from "@/lib/mobile/haptics";

/**
 * Mirrors the account's vibration switch into `lib/mobile/haptics.ts` and the
 * mobile shell, and makes every copy to the clipboard tick (MIN-959).
 * Renders nothing; outside the app it only sets a flag nothing reads.
 */
export function HapticsAccountSync() {
  const { user } = useAuth();
  const enabled = resolveHaptics(user?.user_metadata);
  useEffect(() => {
    setHapticsEnabled(enabled);
  }, [enabled]);
  useEffect(() => installClipboardHaptics(), []);
  return null;
}
