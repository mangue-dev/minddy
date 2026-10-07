"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Share01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MIN_SHARE_PASSWORD_LENGTH } from "@/lib/share-password";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  SegmentedControl,
  Spinner,
  toast,
} from "mangue-ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { View, ViewShareLevel } from "@/lib/types";
import {
  deleteViewShareApi,
  fetchViewShareApi,
  updateViewShareApi,
} from "@/lib/views-api";

/** Share a view as a read-only public link (MIN-26): private (default) /
    password / public, toggled per view from the pill's "more" menu. */
export function ShareViewDialog({
  view,
  open,
  onOpenChange,
}: {
  view: View | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ShareView");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const viewId = view?.id ?? null;

  const shareEnabled = open && viewId !== null;
  const { data: share, isPending } = useQuery({
    queryKey: ["view-share", viewId],
    queryFn: () => fetchViewShareApi(viewId as string),
    enabled: shareEnabled,
  });
  const serverLevel: ViewShareLevel = share?.level ?? "private";

  const [level, setLevel] = useState<ViewShareLevel>("private");
  const [password, setPassword] = useState("");

  // Re-sync the local selection when the dialog opens or the share resolves.
  useEffect(() => {
    if (open) {
      setLevel(serverLevel);
      setPassword("");
    }
  }, [open, serverLevel, viewId]);

  const update = useMutation({
    mutationFn: (input: { level: "password" | "public"; password?: string }) =>
      updateViewShareApi(viewId as string, input),
    onSuccess: (next) => {
      queryClient.setQueryData(["view-share", viewId], next);
      setPassword("");
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const revoke = useMutation({
    mutationFn: () => deleteViewShareApi(viewId as string),
    onSuccess: () => {
      setLevel("private");
      queryClient.setQueryData(["view-share", viewId], null);
      toast.success(t("sharingDisabled"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const changeLevel = (next: ViewShareLevel) => {
    if (update.isPending || revoke.isPending) return;
    if (next === "private" && share) {
      revoke.mutate();
      return;
    }
    setLevel(next);
    if (next === serverLevel) return;
    if (next === "public") {
      update.mutate({ level: "public" });
    }
    // "password" waits for the password submit below (the server needs one
    // before it can create/re-level the share).
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = password.trim();
    // The server refuses below (MIN-347): the form says so before.
    if (trimmed.length < MIN_SHARE_PASSWORD_LENGTH) return;
    update.mutate({ level: "password", password: trimmed });
  };

  const shareUrl = share
    ? `${window.location.origin}/share/${share.token}`
    : null;
  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success(t("linkCopied"));
  };

  const hint =
    level === "private"
      ? t("hintPrivate")
      : level === "password"
        ? t("hintPassword")
        : t("hintPublic");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={Share01Icon} className="size-4 text-brand" />
              {t("title")}
            </DialogTitle>
            <DialogDescription>
              {t("description", { name: view?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>

          {shareEnabled && isPending ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <SegmentedControl
                  options={[
                    { value: "private", label: t("levelPrivate") },
                    { value: "password", label: t("levelPassword") },
                    { value: "public", label: t("levelPublic") },
                  ]}
                  value={level}
                  onChange={changeLevel}
                  ariaLabel={t("title")}
                />
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>

              {level === "password" && (
                <form onSubmit={submitPassword} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      minLength={MIN_SHARE_PASSWORD_LENGTH}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        serverLevel === "password"
                          ? t("changePasswordPlaceholder")
                          : t("passwordPlaceholder")
                      }
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={
                        update.isPending ||
                        password.trim().length < MIN_SHARE_PASSWORD_LENGTH
                      }
                    >
                      {update.isPending && <Spinner />}
                      {tc("save")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("passwordMinHint")}</p>
                </form>
              )}

              {share && shareUrl && (
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={copyLink}
                  >
                    <HugeiconsIcon icon={Copy01Icon} />
                    {t("copyLink")}
                  </Button>
                </div>
              )}

            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
