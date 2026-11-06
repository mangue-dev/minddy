"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RowsSkeleton } from "@/components/loading-skeletons";
import { SettingsEmpty, SettingsGroup } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { isSendShortcut } from "@/lib/keyboard/send-shortcut";
import { useProjects } from "@/lib/projects-context";
import {
  NUMO_MEMORY_LIMIT,
  NUMO_MEMORY_MAX_LENGTH,
  NUMO_MEMORY_META_KEY,
  normalizeNumoMemoryContent,
  resolveNumoMemoryEnabled,
} from "@/lib/numo-memory";
import {
  deleteAllNumoMemoriesApi,
  deleteNumoMemoryApi,
  fetchNumoMemoriesApi,
  numoMemoriesQueryKey,
  updateNumoMemoryApi,
  type NumoMemoryItem,
} from "@/lib/numo-memory-api";

/** Quoted in a dialog title: long memories are cut. */
function excerpt(text: string): string {
  return text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text;
}

/**
 * Account → AI & Numo → Numo's memory (MIN-915): the switch, and every memory
 * Numo keeps, each one editable and deletable. Turning the memory off keeps
 * the memories; Numo just stops reading and writing them.
 */
export function AccountNumoMemorySection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  const [enabled, setEnabled, ready] = useAccountPreference(
    NUMO_MEMORY_META_KEY,
    resolveNumoMemoryEnabled,
  );
  const { data: memories = [], isPending } = useQuery({
    queryKey: numoMemoriesQueryKey,
    queryFn: fetchNumoMemoriesApi,
  });
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<NumoMemoryItem | null>(null);
  const [forgetAll, setForgetAll] = useState(false);

  const projectName = (id: string) =>
    projects.find((project) => project.id === id)?.name ?? t("numoMemoryOtherProject");

  const refresh = () => queryClient.invalidateQueries({ queryKey: numoMemoriesQueryKey });

  const save = async () => {
    if (!editing) return;
    const content = normalizeNumoMemoryContent(editing.draft);
    if (!content) return;
    setSaving(true);
    try {
      await updateNumoMemoryApi(editing.id, content);
      setEditing(null);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteNumoMemoryApi(toDelete.id);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  const removeAll = async () => {
    try {
      await deleteAllNumoMemoriesApi();
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountNumoMemory}
        title={t("numoMemoryTitle")}
        help={t("numoMemoryHelp")}
        action={
          <Switch
            aria-label={t("numoMemorySwitch")}
            checked={enabled}
            onCheckedChange={(next) => void setEnabled(next)}
            disabled={!ready}
          />
        }
        footer={memories.length > 0 ? (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {t("numoMemoryCount", { count: memories.length, limit: NUMO_MEMORY_LIMIT })}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setForgetAll(true)}>
              {t("numoMemoryForgetAll")}
            </Button>
          </div>
        ) : undefined}
      >
        {!enabled && ready && (
          <SettingsEmpty>{t("numoMemoryOff")}</SettingsEmpty>
        )}
        {isPending ? (
          <RowsSkeleton rows={2} />
        ) : memories.length === 0 ? (
          enabled ? <SettingsEmpty>{t("numoMemoryEmpty")}</SettingsEmpty> : null
        ) : (
          memories.map((memory) => editing?.id === memory.id ? (
            <div key={memory.id} className="flex flex-col gap-2 py-3">
              <Textarea
                aria-label={t("numoMemoryEdit")}
                value={editing.draft}
                maxLength={NUMO_MEMORY_MAX_LENGTH}
                autoFocus
                rows={3}
                onChange={(event) => setEditing({ id: memory.id, draft: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(null);
                  // A memory is one statement, so ⌘/Ctrl+Enter saves whatever
                  // the account's send shortcut is.
                  if (isSendShortcut(event)) {
                    event.preventDefault();
                    void save();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {editing.draft.length}/{NUMO_MEMORY_MAX_LENGTH}
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    {tc("cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || !normalizeNumoMemoryContent(editing.draft)}
                    onClick={() => void save()}
                  >
                    {tc("save")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div key={memory.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words text-sm">{memory.content}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {memory.project_id ? projectName(memory.project_id) : t("numoMemoryAllProjects")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <AppTooltip label={tc("edit")}>
                  <IconButton
                    size="sm"
                    aria-label={tc("edit")}
                    onClick={() => setEditing({ id: memory.id, draft: memory.content })}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
                  </IconButton>
                </AppTooltip>
                <AppTooltip label={tc("delete")}>
                  <IconButton
                    size="sm"
                    aria-label={tc("delete")}
                    onClick={() => setToDelete(memory)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </IconButton>
                </AppTooltip>
              </div>
            </div>
          ))
        )}
      </SettingsGroup>

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t("numoMemoryDeleteTitle", { content: toDelete ? excerpt(toDelete.content) : "" })}
        description={t("numoMemoryDeleteDescription")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        closeOnConfirm={false}
        onConfirm={async () => {
          await remove().then(() => setToDelete(null), () => undefined);
        }}
      />
      <ConfirmDeleteDialog
        open={forgetAll}
        onOpenChange={setForgetAll}
        title={t("numoMemoryForgetAllTitle", { count: memories.length })}
        description={t("numoMemoryForgetAllDescription")}
        confirmLabel={t("numoMemoryForgetAll")}
        cancelLabel={tc("cancel")}
        closeOnConfirm={false}
        onConfirm={async () => {
          await removeAll().then(() => setForgetAll(false), () => undefined);
        }}
      />
    </>
  );
}
