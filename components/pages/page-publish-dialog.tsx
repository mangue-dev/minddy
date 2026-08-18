"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MIN_SHARE_PASSWORD_LENGTH } from "@/lib/share-password";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  SegmentedControl,
  Spinner,
  toast,
} from "mangue-ui";
import { Copy, Globe } from "lucide-react";

import {
  deletePageShareApi,
  fetchPageShareApi,
  updatePageShareApi,
} from "@/lib/pages-api";
import type { ViewShareLevel } from "@/lib/types";

/**
 * PUBLISH a page for reading (MIN-283).
 *
 * Same grammar as sharing a view (components/share-view-dialog) — three
 * levels, a link, an optional password — because it's the same
 * machinery below and that two dialogs which do the same thing in two
 * ways read like two features.
 *
 * What this dialog adds, and which only makes sense on a document:
 *
 * - the SUBPAGES. The box says the NUMBER of pages that would leave, because a blank checkbox would cause someone to publish an entire branch who thinks they are publishing a page. A branch of seventeen pages that we send to a
 * client, this is not a checked option: it's a leak;
 * - NOTHING about indexing, and that's the point: a published page is always
 * `noindex`. The link is the secret, as for a shared view, and a checkbox
 * "allow Google" checked once "to view" does not uncheck a
 * index.
 */
export function PagePublishDialog({
  projectId,
  pageId,
  title,
  /** The number of living descendants of the page — told by the checkbox. */
  descendantCount,
  open,
  onOpenChange,
}: {
  projectId: string;
  pageId: string;
  title: string;
  descendantCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("PublishPage");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();

  const { data: share, isPending } = useQuery({
    queryKey: pageShareKey(pageId),
    queryFn: () => fetchPageShareApi(projectId, pageId),
    enabled: open,
  });
  const serverLevel: ViewShareLevel = share?.level ?? "private";

  const [level, setLevel] = useState<ViewShareLevel>("private");
  const [password, setPassword] = useState("");

  // Re-synchronized on opening, and when the response arrives.
  useEffect(() => {
    if (open) {
      setLevel(serverLevel);
      setPassword("");
    }
  }, [open, serverLevel]);

  const update = useMutation({
    mutationFn: (input: {
      level: "password" | "public";
      password?: string;
      include_children?: boolean;
    }) => updatePageShareApi(projectId, pageId, input),
    onSuccess: (next) => {
      queryClient.setQueryData(pageShareKey(pageId), next);
      setPassword("");
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const revoke = useMutation({
    mutationFn: () => deletePageShareApi(projectId, pageId),
    onSuccess: () => {
      queryClient.setQueryData(pageShareKey(pageId), null);
      toast.success(t("unpublished"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const changeLevel = (next: ViewShareLevel) => {
    setLevel(next);
    if (next === serverLevel) return;
    if (next === "private") {
      if (share) revoke.mutate();
    } else if (next === "public") {
      update.mutate({ level: "public" });
    }
    // “password” expects the password below: the server requires one
    // before creating the share.
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = password.trim();
    // The server refuses below (MIN-347): the form says so before.
    if (trimmed.length < MIN_SHARE_PASSWORD_LENGTH) return;
    update.mutate({ level: "password", password: trimmed });
  };

  const shareUrl = share ? `${window.location.origin}/p/${share.token}` : null;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-4 text-brand" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description", { name: title })}</DialogDescription>
        </DialogHeader>

        {open && isPending ? (
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
              <>
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
                    <Copy />
                    {t("copyLink")}
                  </Button>
                </div>

                <div className="flex flex-col gap-3 border-t pt-3">
                  <label className="flex items-start gap-2.5">
                    <Checkbox
                      checked={share.include_children}
                      disabled={descendantCount === 0 || update.isPending}
                      onCheckedChange={(checked) =>
                        update.mutate({
                          level: share.level,
                          include_children: checked === true,
                        })
                      }
                      className="mt-0.5"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm">{t("includeChildren")}</span>
                      {/* An ACCOUNT, never a blank box: this is the only
 way to know what we are really sending. */}
                      <span className="text-xs text-muted-foreground">
                        {descendantCount === 0
                          ? t("noChildren")
                          : share.include_children
                            ? t("childrenIncluded", { count: descendantCount })
                            : t("childrenExcluded", { count: descendantCount })}
                      </span>
                    </span>
                  </label>

                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The publish state cache key. */
export function pageShareKey(pageId: string): [string, string] {
  return ["page-share", pageId];
}
