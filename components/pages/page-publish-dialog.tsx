"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
 * PUBLIER une page en lecture (MIN-283).
 *
 * Même grammaire que le partage d'une vue (components/share-view-dialog) — trois
 * niveaux, un lien, un mot de passe optionnel — parce que c'est la même
 * machinerie dessous et que deux dialogues qui font la même chose de deux
 * façons se lisent comme deux features.
 *
 * Ce que ce dialogue-ci ajoute, et qui n'a de sens que sur un document :
 *
 *  - les SOUS-PAGES. La case dit le NOMBRE de pages qui partiraient, parce
 *    qu'une case à cocher muette ferait publier une branche entière à quelqu'un
 *    qui croit publier une page. Une branche de dix-sept pages qu'on envoie à un
 *    client, ce n'est pas une option cochée : c'est une fuite ;
 *  - RIEN sur l'indexation, et c'est le point : une page publiée est toujours
 *    `noindex`. Le lien est le secret, comme pour une vue partagée, et une case
 *    « autoriser Google » cochée une fois « pour voir » ne se décoche pas d'un
 *    index.
 */
export function PagePublishDialog({
  projectId,
  pageId,
  title,
  /** Le nombre de descendants vivants de la page — dit par la case à cocher. */
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

  // Re-synchronisé à l'ouverture, et quand la réponse arrive.
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
    // « password » attend le mot de passe ci-dessous : le serveur en exige un
    // avant de créer le partage.
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = password.trim();
    if (!trimmed) return;
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
              <form onSubmit={submitPassword} className="flex items-center gap-2">
                <Input
                  type="password"
                  autoComplete="new-password"
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
                  disabled={update.isPending || !password.trim()}
                >
                  {update.isPending && <Spinner />}
                  {tc("save")}
                </Button>
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
                      {/* Un COMPTE, jamais une case muette : c'est la seule
                          façon de savoir ce qu'on envoie vraiment. */}
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

/** La clé de cache de l'état de publication. */
export function pageShareKey(pageId: string): [string, string] {
  return ["page-share", pageId];
}
