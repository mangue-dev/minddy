"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
  Textarea,
  toast,
} from "mangue-ui";
import { Sparkles } from "lucide-react";
import { BriefPreview } from "@/components/project-seed/brief-preview";
import { applyBriefApi, proposeBriefApi } from "@/lib/seed-api";
import {
  MAX_BRIEF_CHARS,
  MIN_BRIEF_CHARS,
  type SeedProposal,
} from "@/lib/seed/types";

/**
 * L'amorce d'un projet par un brief (MIN-172) — la surface que `?setup=brief`
 * ouvre sur le board vide.
 *
 * Le board vide est le bon endroit : c'est le trou qu'on est en train de
 * combler, et la passe met une bonne minute (mesuré : 30 à 80 s pour vingt à
 * trente tickets, la sortie s'écrivant token par token) pour rendre un lot à
 * relire — ça ne tiendrait pas dans une étape de wizard (MIN-170).
 *
 * Trois temps, un seul écran : le texte collé, la passe en cours, l'aperçu.
 * Un échec ne perd pas le brief — il se rejoue.
 */
export function ProjectSeedDialog({
  open,
  onOpenChange,
  projectId,
  onSeeded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSeeded?: () => void;
}) {
  const t = useTranslations("Seed");
  const queryClient = useQueryClient();

  const [brief, setBrief] = useState("");
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [proposal, setProposal] = useState<SeedProposal | null>(null);
  /** Les tickets décochés — l'exclusion se dit, la sélection se déduit. */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const reset = () => {
    setProposal(null);
    setExcluded(new Set());
    setPending(false);
    setCreating(false);
  };

  const runPass = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await proposeBriefApi(projectId, brief.trim());
      // La passe a répondu sans rien d'exploitable (drapeau coupé, appel raté).
      // On le dit et on garde le texte : c'est rejouable tel quel.
      if (!result) {
        toast.error(t("passFailed"));
        return;
      }
      setProposal(result);
      setExcluded(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const toggle = useCallback((keys: string[], next: boolean) => {
    setExcluded((prev) => {
      const set = new Set(prev);
      for (const key of keys) {
        if (next) set.delete(key);
        else set.add(key);
      }
      return set;
    });
  }, []);

  const rename = useCallback((key: string, title: string) => {
    setProposal((prev) =>
      prev
        ? {
            ...prev,
            issues: prev.issues.map((issue) =>
              issue.key === key ? { ...issue, title } : issue
            ),
          }
        : prev
    );
  }, []);

  const create = async () => {
    if (!proposal || creating) return;
    // Ce qui part est EXACTEMENT ce que l'aperçu montre : les tickets cochés,
    // et les objectifs qu'il reste au moins un ticket pour peupler.
    const issues = proposal.issues.filter((issue) => !excluded.has(issue.key));
    const keptKeys = new Set(issues.map((issue) => issue.objectiveKey));
    const payload: SeedProposal = {
      objectives: proposal.objectives.filter((o) => keptKeys.has(o.key)),
      issues,
    };

    setCreating(true);
    try {
      const result = await applyBriefApi(projectId, payload);
      toast.success(t("createdToast", { count: result.created }));
      void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["objectives", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["categories", projectId] });
      onSeeded?.();
      onOpenChange(false);
      setBrief("");
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const length = brief.trim().length;
  const tooLong = length > MAX_BRIEF_CHARS;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Fermer en cours d'écriture perdrait un lot à moitié créé : le seul
        // moment où la modale ne se ferme pas.
        if (creating) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {proposal ? t("previewDesc") : t("dialogDesc")}
          </DialogDescription>
        </DialogHeader>

        {proposal ? (
          <BriefPreview
            proposal={proposal}
            excluded={excluded}
            onToggle={toggle}
            onRename={rename}
            onCreate={() => void create()}
            creating={creating}
            className="min-h-0"
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={t("briefPlaceholder")}
              disabled={pending}
              rows={10}
              className="max-h-[45vh] min-h-48 overflow-y-auto"
              aria-label={t("briefLabel")}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => void runPass()}
                disabled={pending || length < MIN_BRIEF_CHARS || tooLong}
              >
                {pending ? <Spinner /> : <Sparkles />}
                {pending ? t("passPending") : t("passButton")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {tooLong
                  ? t("briefTooLong", { max: MAX_BRIEF_CHARS })
                  : pending
                    ? t("passPendingHint")
                    : t("briefHint")}
              </p>
            </div>
          </div>
        )}

        {proposal && !creating && (
          <button
            type="button"
            onClick={reset}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("backToBrief")}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
