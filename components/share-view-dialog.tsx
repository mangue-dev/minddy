"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Share01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MIN_SHARE_PASSWORD_LENGTH } from "@/lib/share-password";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { View, ViewShare, ViewShareLevel } from "@/lib/types";
import {
  deleteViewShareApi,
  fetchViewShareApi,
  updateViewShareApi,
} from "@/lib/views-api";

const viewShareKey = (viewId: string | null) => ["view-share", viewId] as const;

/** Loads a view's share state ahead of the dialog, from the menu that offers
    it, so the dialog opens on it rather than on a spinner. */
export function prefetchViewShare(queryClient: QueryClient, viewId: string) {
  void queryClient.prefetchQuery({
    queryKey: viewShareKey(viewId),
    queryFn: () => fetchViewShareApi(viewId),
    staleTime: 30_000,
  });
}

/** Share a view as a read-only public link (MIN-26): private (default) /
    password / public, chosen per view from the pill's "more" menu. The dialog
    shows its controls at once and applies each change on screen before the
    server confirms it, rolling it back if the server refuses. */
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
    queryKey: viewShareKey(viewId),
    queryFn: () => fetchViewShareApi(viewId as string),
    enabled: shareEnabled,
    staleTime: 30_000,
  });
  // First read only: the level is unknown, so it cannot be changed yet.
  const loading = shareEnabled && isPending;
  const serverLevel: ViewShareLevel = share?.level ?? "private";

  const [level, setLevel] = useState<ViewShareLevel>("private");
  const [password, setPassword] = useState("");
  // Turning a live link off kills it for whoever has it: ask first (MIN-743).
  const [confirmRevoke, setConfirmRevoke] = useState(false);

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
    // An existing link changes level on screen at once; a new one shows
    // its address when the server has made it.
    onMutate: (input) => {
      const previous = queryClient.getQueryData<ViewShare | null>(viewShareKey(viewId));
      if (previous) queryClient.setQueryData(viewShareKey(viewId), { ...previous, level: input.level });
      setPassword("");
      return { previous };
    },
    onSuccess: (next) => {
      queryClient.setQueryData(viewShareKey(viewId), next);
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(viewShareKey(viewId), context?.previous ?? null);
      setLevel(context?.previous?.level ?? "private");
      toast.error((err as Error).message);
    },
  });
  const revoke = useMutation({
    mutationFn: () => deleteViewShareApi(viewId as string),
    onMutate: () => {
      const previous = queryClient.getQueryData<ViewShare | null>(viewShareKey(viewId));
      setLevel("private");
      queryClient.setQueryData(viewShareKey(viewId), null);
      return { previous };
    },
    onSuccess: () => {
      toast.success(t("sharingDisabled"));
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(viewShareKey(viewId), context?.previous ?? null);
      setLevel(context?.previous?.level ?? "private");
      toast.error((err as Error).message);
    },
  });

  const changeLevel = (next: ViewShareLevel) => {
    if (loading || revoke.isPending) return;
    if (next === "private" && share) {
      setConfirmRevoke(true);
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

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Select value={level} onValueChange={(next) => changeLevel(next as ViewShareLevel)} disabled={loading}>
                <SelectTrigger className="w-full" aria-label={t("title")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">{t("levelPrivate")}</SelectItem>
                  <SelectItem value="password">{t("levelPassword")}</SelectItem>
                  <SelectItem value="public">{t("levelPublic")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{loading ? "\u00a0" : hint}</p>
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
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={t("stopSharingTitle", { name: view?.name ?? "" })}
        description={t("stopSharingDescription")}
        confirmLabel={t("stopSharingConfirm")}
        cancelLabel={tc("cancel")}
        onConfirm={() => revoke.mutateAsync().catch(() => undefined)}
      />
    </>
  );
}
