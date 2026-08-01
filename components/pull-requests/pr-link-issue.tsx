"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  toast,
} from "mangue-ui";
import { Link2 } from "lucide-react";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { StatusIndicator } from "@/components/issue-indicators";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import { issueStatusForPrState } from "@/lib/pr-issue-status";
import { linkPullRequestIssueApi } from "@/lib/agent-api";
import type { PullRequestListItem } from "@/lib/agent-api";
import type { GlobalBoardResponse } from "@/lib/types";

/**
 * Rattacher un ticket à une PR qui n'en a pas (MIN-163), depuis le header.
 *
 * Le rattachement se fait normalement TOUT SEUL, par convention (clé de projet
 * dans la branche, le titre, ou une ligne `Fixes:`). Quand la convention n'a pas
 * été suivie, la PR restait orpheline pour toujours : ce sélecteur est le
 * rattrapage, et il prend la place exacte du « aucun ticket » qu'il remplace.
 *
 * Le geste est en DEUX temps, parce qu'il est définitif : on choisit dans le
 * même picker que le bouton « Nouveau » de /agents (board global chargé
 * paresseusement, à l'ouverture), puis on confirme dans un dialog qui nomme le
 * ticket ET annonce le statut qu'il va prendre — la conséquence se dit avant le
 * geste, pas après.
 *
 * Ne sont proposés que les tickets du projet de CE dépôt : c'est le périmètre
 * que le serveur accepte (celui de la voie conventionnelle), et proposer plus
 * large ne servirait qu'à faire échouer la confirmation.
 */
export function PrLinkIssue({
  prId,
  prState,
  projectId,
  projectKey,
  onLinked,
}: {
  prId: string;
  prState: PullRequestListItem["pr_state"];
  projectId: string;
  projectKey: string;
  /** Le lien est posé : la liste et le détail doivent repartir du serveur. */
  onLinked: () => void;
}) {
  const t = useTranslations("PullRequests");
  const tStatus = useTranslations("Status");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ id: string; identifier: string } | null>(null);
  const [linking, setLinking] = useState(false);

  // Même cache que le board « Tous les tickets » et que le picker de /agents :
  // rien n'est chargé tant que le menu n'est pas ouvert.
  const { data, isLoading } = useQuery({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: globalBoardQueryFn,
    enabled: open,
    staleTime: 30_000,
  });

  const issues = (data?.issues ?? []) as GlobalBoardResponse["issues"];
  const options = useMemo<PickerOption[]>(() => {
    return issues
      .filter((i) => i.project_id === projectId)
      // Ouvertes d'abord : une PR qu'on rattache après coup vise presque
      // toujours un ticket encore vivant. Les closes restent atteignables.
      .sort((a, b) => (isClosedStatus(a.status) ? 1 : 0) - (isClosedStatus(b.status) ? 1 : 0))
      .map((i) => {
        const identifier = issueIdentifier(projectKey, i.number);
        return {
          value: i.id,
          label: `${identifier}  ${i.title}`,
          keywords: [identifier, i.title],
          icon: <StatusIndicator status={i.status} className="size-4" />,
        };
      });
  }, [issues, projectId, projectKey]);

  const nextStatus = issueStatusForPrState(prState);

  const confirm = async () => {
    if (!pending || linking) return;
    setLinking(true);
    try {
      await linkPullRequestIssueApi(prId, pending.id, prState);
      toast.success(t("linkIssueDone", { identifier: pending.identifier }));
      setPending(null);
      onLinked();
    } catch (err) {
      // Message déjà traduit par le serveur (PR déjà rattachée, ticket qui porte
      // déjà une PR vivante) : on le montre tel quel.
      toast.error((err as Error).message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <SearchSelect
        value={null}
        onChange={(issueId) => {
          if (!issueId) return;
          const issue = issues.find((i) => i.id === issueId);
          if (!issue) return;
          setPending({ id: issue.id, identifier: issueIdentifier(projectKey, issue.number) });
        }}
        options={options}
        open={open}
        onOpenChange={setOpen}
        align="start"
        searchPlaceholder={t("linkIssueSearchPlaceholder")}
        emptyText={isLoading ? t("linkIssueLoading") : t("linkIssueEmpty")}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 font-sans text-xs font-normal text-muted-foreground"
          >
            <Link2 className="size-3.5" />
            {t("linkIssue")}
          </Button>
        }
      />

      {/* Confirmation — le rattachement ne s'annule pas, il se confirme. */}
      <Dialog
        open={!!pending}
        onOpenChange={(next) => {
          if (!next && !linking) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("linkIssueTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("linkIssueDescription", { identifier: pending?.identifier ?? "" })}
          </p>
          {nextStatus ? (
            <p className="text-sm text-muted-foreground">
              {t("linkIssueStatusNote", { status: tStatus(nextStatus) })}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={linking} onClick={() => setPending(null)}>
              {t("cancel")}
            </Button>
            <Button disabled={linking} onClick={() => void confirm()}>
              {linking ? <Spinner /> : null}
              {t("linkIssueConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
