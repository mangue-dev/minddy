"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "mangue-ui";
import { LogOut, MessagesSquare } from "lucide-react";
import type { PublicIdentity } from "@/lib/feedback/types";
import { logoutAction } from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { IdentityAvatar } from "./feedback-bits";

/** Visitor identity in the header of the public site: “Authenticate”
 (OTP door) or the avatar alone — the actions (My feedback, disconnection)
 live in a dropdown, protected from accidental clicks. */
export function HeaderIdentity({
  token,
  basePath,
  identity,
}: {
  token: string;
  /** Public link prefix: /f/<token>, or "" on custom domain. */
  basePath: string;
  identity: PublicIdentity | null;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!identity) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setAuthOpen(true)}>
          {t("signIn")}
        </Button>
        <FeedbackAuthDialog token={token} open={authOpen} onOpenChange={setAuthOpen} />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={identity.pseudonym}
          className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IdentityAvatar identity={identity} className="size-7 text-xs" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => router.push(`${basePath}/me`)}>
          <MessagesSquare className="size-4" />
          {t("myFeedback")}
        </DropdownMenuItem>
        {/* Going to see your feedback and closing your session are two gestures of
 different nature, and the second does not catch up: the net separates them
 so that a click does not slip from one to the other. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={() =>
            startTransition(async () => {
              try {
                await logoutAction(token);
              } catch {
                // refresh re-synchronizes session state
              }
              router.refresh();
            })
          }
        >
          <LogOut className="size-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
