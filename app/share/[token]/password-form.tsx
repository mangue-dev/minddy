"use client";

import { SharePasswordForm } from "@/components/share-password-form";
import { unlockShare } from "./actions";

/** Password gate of a password-protected shared view (MIN-26). The form
 itself is shared with the published page (components/share-password-form):
 what changes from route to route is the action, not the field. */
export function PasswordForm({ token }: { token: string }) {
  return <SharePasswordForm action={unlockShare.bind(null, token)} />;
}
