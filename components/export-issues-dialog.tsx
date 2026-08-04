"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  toast,
} from "mangue-ui";
import { Download } from "lucide-react";
import { exportIssuesApi } from "@/lib/export-api";
import { ALL_STATUSES, CLOSED_STATUSES, type IssueStatus } from "@/lib/issue-constants";
import { StatusIndicator } from "@/components/issue-indicators";
import { useProjects } from "@/lib/projects-context";

/**
 * L'export CSV de mes tickets, ouvert depuis ⌘K — deux questions, pas une de
 * plus : QUOI (un projet ou tous) et JUSQU'OÙ (quels statuts).
 *
 * Les statuts sont des cases à cocher et non un filtre libre parce que la seule
 * question qu'on se pose vraiment devant un export est « est-ce que j'emporte
 * les terminés et les annulés ? ». D'où le pré-cochage : tout SAUF les statuts
 * clos (`CLOSED_STATUSES`), c'est-à-dire le backlog vivant. Emporter le reste
 * est un geste, une case — pas une option enfouie.
 *
 * Le fichier obtenu est le format documenté (`lib/export/issues-csv.ts`), donc
 * relisible par l'import de minddy : c'est ce que dit la ligne d'aide, et c'est
 * ce qui fait de ce dialogue un déménagement possible et pas juste une sortie.
 */
export function ExportIssuesDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projet de la page à l'ouverture — le plus probable, donc le pré-sélectionné. */
  defaultProjectId?: string | null;
}) {
  const t = useTranslations("Export");
  const tc = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const { projects } = useProjects();

  const [scope, setScope] = useState<string>(defaultProjectId ?? ALL_SCOPE);
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(defaultStatuses);
  const [exporting, setExporting] = useState(false);

  // Chaque ouverture repart du projet de la page : entre deux exports on a
  // changé de projet, et garder l'ancien ferait exporter le mauvais.
  useEffect(() => {
    if (!open) return;
    setScope(defaultProjectId ?? ALL_SCOPE);
    setStatuses(defaultStatuses());
  }, [open, defaultProjectId]);

  const toggle = (status: IssueStatus, next: boolean) => {
    setStatuses((prev) => {
      const set = new Set(prev);
      if (next) set.add(status);
      else set.delete(status);
      return set;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportIssuesApi(
        scope === ALL_SCOPE ? null : scope,
        [...statuses]
      );
      if (result.truncated) toast.warning(t("truncatedToast", { count: result.count }));
      else toast.success(t("doneToast", { count: result.count }));
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !exporting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="export-scope" className="text-sm font-medium">
              {t("scopeLabel")}
            </label>
            <Select value={scope} onValueChange={setScope} disabled={exporting}>
              <SelectTrigger id="export-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SCOPE}>{t("scopeAll")}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("statusesLabel")}</span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {ALL_STATUSES.map((s) => (
                <label
                  key={s.value}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={statuses.has(s.value)}
                    disabled={exporting}
                    onCheckedChange={(next) => toggle(s.value, next === true)}
                  />
                  <StatusIndicator status={s.value} className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{tStatus(s.value)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleExport()}
            // Zéro statut coché, c'est un fichier vide : le bouton le dit en
            // restant éteint, plutôt qu'une erreur après le clic.
            disabled={exporting || statuses.size === 0}
          >
            {exporting ? <Spinner /> : <Download />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Valeur du sélecteur pour « tous mes projets » — pas un id, donc pas de
 *  collision possible avec un uuid de projet. */
const ALL_SCOPE = "all";

/** Le backlog vivant : tout sauf terminé, annulé et doublon. */
const defaultStatuses = (): Set<IssueStatus> =>
  new Set(
    ALL_STATUSES.map((s) => s.value).filter((v) => !CLOSED_STATUSES.includes(v))
  );
