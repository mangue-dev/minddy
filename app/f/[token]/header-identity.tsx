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

/** Identité du visiteur dans le header du site public : « S'authentifier »
    (porte OTP) ou l'avatar seul — les actions (Mes feedbacks, déconnexion)
    vivent dans un dropdown, à l'abri des clics accidentels. */
export function HeaderIdentity({
  token,
  basePath,
  identity,
}: {
  token: string;
  /** Préfixe public des liens : /f/<token>, ou "" sur domaine personnalisé. */
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
        {/* Aller voir ses retours et fermer sa session sont deux gestes de
            nature différente, et le second ne se rattrape pas : le filet les
            sépare pour qu'un clic ne glisse pas de l'un à l'autre. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={() =>
            startTransition(async () => {
              try {
                await logoutAction(token);
              } catch {
                // le refresh re-synchronise l'état de session
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
