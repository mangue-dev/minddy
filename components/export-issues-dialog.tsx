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
 * The CSV export of my tickets, opened from ⌘K — two questions, not one of
 * plus: WHAT (one project or all) and UNTIL WHERE (what statuses).
 *
 * The statuses are check boxes and not a free filter because the only
 * The question we really ask ourselves when faced with an export is “do I take
 * the completed and the canceled? ". Hence the pre-checking: everything EXCEPT the statuses
 * closed (`CLOSED_STATUSES`), i.e. the living backlog. Take away the rest
 * is a gesture, a box — not a buried option.
 *
 * The resulting file is the documented format (`lib/export/issues-csv.ts`), so
 * rereadable by importing minddy: that's what the help line says, and it's
 * which makes this dialogue a possible move and not just an exit.
 */
export function ExportIssuesDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project of the page when opened — the most likely, therefore the pre-selected. */
  defaultProjectId?: string | null;
}) {
  const t = useTranslations("Export");
  const tc = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const { projects } = useProjects();

  const [scope, setScope] = useState<string>(defaultProjectId ?? ALL_SCOPE);
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(defaultStatuses);
  const [exporting, setExporting] = useState(false);

  // Each opening starts from the project of the page: between two exports we have
  // changed project, and keeping the old one would export the wrong one.
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
            // Zero status checked, it is an empty file: the button says so in
            // remaining off, rather than an error after the click.
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

/** Selector value for “all my projects” — not an id, so no
 * possible collision with a project uuid. */
const ALL_SCOPE = "all";

/** The Living Backlog: Everything but Completed, Canceled and Duplicate. */
const defaultStatuses = (): Set<IssueStatus> =>
  new Set(
    ALL_STATUSES.map((s) => s.value).filter((v) => !CLOSED_STATUSES.includes(v))
  );
