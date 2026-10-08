"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Spinner,
} from "mangue-ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUnlinkPullRequestIssue } from "@/lib/use-unlink-pull-request-issue";

type UnlinkTarget = { prId: string; issueId: string; identifier: string };
const UnlinkContext = createContext<{
  requestUnlink: (target: UnlinkTarget) => void;
  isPending: boolean;
  variables?: UnlinkTarget;
} | null>(null);

/** All PR unlink entry points share one confirmation and mutation. */
export function PrUnlinkConfirmationProvider({ children }: {
  children: React.ReactNode;
}) {
  const t = useTranslations("PullRequests");
  const [target, setTarget] = useState<UnlinkTarget | null>(null);
  const mutation = useUnlinkPullRequestIssue();
  const requestUnlink = useCallback((next: UnlinkTarget) => setTarget(next), []);
  const value = useMemo(
    () => ({ requestUnlink, isPending: mutation.isPending, variables: mutation.variables }),
    [requestUnlink, mutation.isPending, mutation.variables],
  );
  const confirm = async () => {
    if (!target || mutation.isPending) return;
    try {
      await mutation.mutateAsync(target);
      setTarget(null);
    } catch {
      // The mutation reports the error and leaves the confirmation available.
    }
  };
  return (
    <UnlinkContext.Provider value={value}>
      {children}
      <Dialog open={!!target} onOpenChange={(open) => {
        if (!open && !mutation.isPending) setTarget(null);
      }}>
        <DialogContent data-testid="pr-unlink-confirmation">
          <DialogHeader>
            <DialogTitle>{t("unlinkIssueConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("unlinkIssueConfirmDescription", { identifier: target?.identifier ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => setTarget(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" disabled={mutation.isPending} onClick={() => void confirm()}>
              {mutation.isPending ? <Spinner /> : null}
              {t("unlinkIssue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnlinkContext.Provider>
  );
}

export function usePrUnlinkConfirmation() {
  const context = useContext(UnlinkContext);
  if (!context) throw new Error("PR unlink confirmation requires PrUnlinkConfirmationProvider");
  return context;
}
