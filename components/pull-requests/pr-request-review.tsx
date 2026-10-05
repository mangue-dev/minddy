"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  toast,
} from "mangue-ui";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { usePrMembersQuery } from "@/lib/use-pr-members-query";
import { prEndpoint, requestPullRequestReviewerApi } from "@/lib/agent-api";

export function PrRequestReview({
  prId,
  author,
  requestedReviewers,
  open,
  onOpenChange,
  onRequested,
}: {
  prId: string;
  author: string | null;
  requestedReviewers: { login: string; avatar_url: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequested: () => unknown;
}) {
  const t = useTranslations("PullRequests");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const { members, loading } = usePrMembersQuery(prEndpoint(prId), open);
  const candidates = members.filter(
    (member) =>
      member.login.toLowerCase() !== author?.toLowerCase() &&
      !requestedReviewers.some(
        (pending) => pending.login.toLowerCase() === member.login.toLowerCase(),
      ) &&
      `${member.login} ${member.name ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const request = async (login: string) => {
    if (sending) return;
    setSending(login);
    try {
      await requestPullRequestReviewerApi(prId, login);
      toast.success(t("reviewerRequestSent", { reviewer: login }));
      onOpenChange(false);
      setSearch("");
      await onRequested();
    } catch {
      toast.error(t("reviewerRequestFailed"));
    } finally {
      setSending(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="pr-request-review-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("requestReviewer")}</DialogTitle>
          <DialogDescription>{t("requestReviewerHint")}</DialogDescription>
        </DialogHeader>
        <Input
          aria-label={t("searchReviewers")}
          placeholder={t("searchReviewers")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("noReviewersFound")}
            </p>
          ) : (
            candidates.map((member) => (
              <Button
                key={member.login}
                variant="ghost"
                className="w-full justify-start gap-2"
                disabled={!!sending}
                onClick={() => void request(member.login)}
              >
                <ForgeUserAvatar user={member} className="size-6" />
                <span>{member.login}</span>
                {member.name ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {member.name}
                  </span>
                ) : null}
                {sending === member.login ? (
                  <Spinner className="ml-auto" />
                ) : null}
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
