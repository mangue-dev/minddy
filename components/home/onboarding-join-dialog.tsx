"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
} from "mangue-ui";
import { Copy, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * “Join a project”, from step 1 of onboarding and from step
 * “name” of the creation wizard (“existing project” path) — this is where we
 * realizes that we were about to create a duplicate of what the team already has.
 *
 * You don't join a project on your own in minddy: it's your
 * owner who invites, by email address. The dialog therefore says two things,
 * in this order: the address to transmit — the only thing to DO here, hence
 * the insert at the head and the two buttons — then the procedure to follow on the host side,
 * so that we can dictate it to him.
 */
export function OnboardingJoinDialog({
  open,
  onOpenChange,
  outro = "home",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Where the invitation will wait, said from the place where we open: the welcome
   * the door at the top of the page, but the wizard opens from anywhere — there, the
   * only true place is the inbox.
   */
  outro?: "home" | "inbox";
}) {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Common");
  const { user } = useAuth();
  const email = user?.email ?? "";

  // `navigator.share` does not exist on most desktop browsers:
  // the button only appears where a share sheet will actually open.
  // Resolved after mounting — the server has no `navigator`, and a rendering that
  // would depend on it would not be able to hydrate.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(email);
    toast.success(tc("copied"));
  };

  const share = async () => {
    try {
      await navigator.share({ title: t("joinShareTitle"), text: email });
    } catch {
      // Sharing canceled from the native sheet: this is not an error.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("joinTitle")}</DialogTitle>
          <DialogDescription>{t("joinDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              {t("joinEmailLabel")}
            </p>
            <AppTooltip label={email}>
              <p className="truncate font-mono text-sm text-foreground">{email}</p>
            </AppTooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void copy()} disabled={!email}>
              <Copy />
              {tc("copy")}
            </Button>
            {canShare && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void share()}
                disabled={!email}
              >
                <Share2 />
                {t("joinShareCta")}
              </Button>
            )}
          </div>
        </div>

        <ol className="ml-4 flex list-decimal flex-col gap-1.5 text-sm text-muted-foreground marker:text-muted-foreground/70">
          <li>{t("joinStep1")}</li>
          <li>{t("joinStep2")}</li>
          <li>{t("joinStep3")}</li>
        </ol>

        <p className="text-xs text-muted-foreground">
          {t(outro === "home" ? "joinOutro" : "joinOutroInbox")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
