"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { Check } from "lucide-react";
import { AssigneePicker, DueDateField } from "@/components/issue-fields";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_MAP,
  type ObjectiveStatus,
} from "@/lib/objective-constants";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import type {
  CreateObjectiveInput,
  Member,
  Objective,
  ObjectiveUpdateInput,
} from "@/lib/types";

function StatusSelect({
  value,
  onChange,
}: {
  value: ObjectiveStatus;
  onChange: (v: ObjectiveStatus) => void;
}) {
  const tStatus = useTranslations("ObjectiveStatus");
  const meta = OBJECTIVE_STATUS_MAP[value];
  const Icon = meta.icon;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Icon className={meta.color} />
          {tStatus(meta.value)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {OBJECTIVE_STATUSES.map((s) => {
          const SIcon = s.icon;
          return (
            <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)}>
              <SIcon className={s.color} />
              {tStatus(s.value)}
              {s.value === value && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("Objectives");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label={t("noColor")}
        className={cn(
          "flex size-5 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground",
          value === null && "ring-2 ring-ring ring-offset-2 ring-offset-background"
        )}
      >
        ∅
      </button>
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={t("colorAria", { color: c })}
          className={cn(
            "size-5 rounded-full ring-offset-2 ring-offset-background",
            value === c && "ring-2 ring-ring"
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

const EMPTY = {
  name: "",
  description: "",
  status: "planned" as ObjectiveStatus,
  lead_user_id: null as string | null,
  target_date: null as string | null,
  color: null as string | null,
};

export function ObjectiveDialog({
  open,
  onOpenChange,
  members,
  objective,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  /** When set, the dialog edits this objective; otherwise it creates one. */
  objective?: Objective | null;
  onCreate: (input: CreateObjectiveInput) => Promise<unknown>;
  onUpdate: (id: string, updates: ObjectiveUpdateInput) => Promise<unknown>;
}) {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      objective
        ? {
            name: objective.name,
            description: objective.description ?? "",
            status: objective.status,
            lead_user_id: objective.lead_user_id,
            target_date: objective.target_date,
            color: objective.color,
          }
        : EMPTY
    );
  }, [open, objective]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setSubmitting(true);
    const payload = {
      name,
      description: form.description.trim() || null,
      status: form.status,
      lead_user_id: form.lead_user_id,
      target_date: form.target_date,
      color: form.color,
    };
    try {
      if (objective) await onUpdate(objective.id, payload);
      else await onCreate(payload);
      toast.success(objective ? t("updatedToast") : t("createdToast"));
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={keepOverlayOpenForPopper}
      >
        <DialogHeader>
          <DialogTitle>{objective ? t("editObjectiveTitle") : t("newObjective")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="objective-name" className="text-sm font-medium">
              {t("nameLabel")}
            </label>
            <Input
              id="objective-name"
              autoFocus
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("namePlaceholder")}
            />
          </div>

          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("descriptionPlaceholder")}
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />

          <div className="flex flex-wrap items-center gap-2">
            <StatusSelect
              value={form.status}
              onChange={(status) => setForm((f) => ({ ...f, status }))}
            />
            <AssigneePicker
              value={form.lead_user_id}
              onChange={(lead_user_id) => setForm((f) => ({ ...f, lead_user_id }))}
              members={members}
              emptyLabel={t("noLead")}
            />
            <DueDateField
              value={form.target_date}
              onChange={(target_date) => setForm((f) => ({ ...f, target_date }))}
              className="w-44"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("colorFieldLabel")}</span>
            <ColorPicker
              value={form.color}
              onChange={(color) => setForm((f) => ({ ...f, color }))}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !form.name.trim()}>
              {submitting && <Spinner />}
              {objective ? tCommon("save") : tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
