"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Spinner, Switch, toast } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";
import { useMembersQuery } from "@/lib/use-members-query";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { SettingsSection } from "@/components/settings-shell";
import { AutoTextarea } from "@/components/auto-textarea";
import type { Project } from "@/lib/types";

/** Project-level Smart Assign preferences (MIN-31): the opt-in switch and, on
    multi-member projects, one free-text assignment rule per member (owner
    included — the AI matches new issues against these rules). Owner-only;
    members see a disabled, read-only state. */
export function SmartAssignSection({
  project,
  isOwner,
}: {
  project: Project;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const tm = useTranslations("Members");
  const { updateProject } = useProjects();
  const { members, loading } = useMembersQuery(project.id, true);

  // Mirror the toggle locally so it flips instantly, then reconcile from the
  // project (Realtime / refetch) — the account-preferences pattern.
  const [enabled, setEnabled] = useState(project.smart_assign_enabled === true);
  const [savingToggle, setSavingToggle] = useState(false);
  useEffect(() => {
    setEnabled(project.smart_assign_enabled === true);
  }, [project.smart_assign_enabled]);

  const toggle = async (next: boolean) => {
    if (!isOwner || savingToggle) return;
    setEnabled(next); // optimistic — revert on failure below
    setSavingToggle(true);
    try {
      await updateProject(project.id, { smart_assign_enabled: next });
      toast.success(
        t(next ? "smartAssignEnabledToast" : "smartAssignDisabledToast")
      );
    } catch (e) {
      setEnabled(!next);
      toast.error((e as Error).message);
    } finally {
      setSavingToggle(false);
    }
  };

  // Rules draft keyed by user_id; dirty compares against the saved map.
  const savedRules = project.smart_assign_rules ?? {};
  const [rules, setRules] = useState<Record<string, string>>(savedRules);
  const [savingRules, setSavingRules] = useState(false);
  useEffect(() => {
    setRules(project.smart_assign_rules ?? {});
  }, [project.smart_assign_rules]);

  const dirty = members.some(
    (m) => (rules[m.user_id] ?? "").trim() !== (savedRules[m.user_id] ?? "")
  );

  const saveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRules(true);
    try {
      // Only non-empty texts travel — the server whitelists keys anyway.
      const cleaned: Record<string, string> = {};
      for (const m of members) {
        const text = (rules[m.user_id] ?? "").trim();
        if (text) cleaned[m.user_id] = text;
      }
      await updateProject(project.id, { smart_assign_rules: cleaned });
      toast.success(t("smartAssignRulesSaved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingRules(false);
    }
  };

  return (
    <SettingsSection title={t("smartAssignTab")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <Switch
              id="smart-assign-enabled"
              checked={enabled}
              onCheckedChange={(v) => void toggle(v)}
              disabled={savingToggle || !isOwner}
            />
            <label
              htmlFor="smart-assign-enabled"
              className="cursor-pointer text-sm text-foreground"
            >
              {t("smartAssignToggleLabel")}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {isOwner ? t("smartAssignToggleHint") : t("smartAssignOwnerOnlyHint")}
          </p>
        </div>

        {enabled && !loading && members.length <= 1 && (
          <p className="text-sm text-muted-foreground">
            {t("smartAssignSoloHint")}
          </p>
        )}

        {enabled && members.length > 1 && (
          <form onSubmit={saveRules} className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium">{t("smartAssignRulesTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("smartAssignRulesDesc")}
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {members.map((m) => (
                <li key={m.user_id} className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`smart-assign-rule-${m.user_id}`}
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <UserAvatar
                      seed={m.avatar_seed}
                      className="size-6"
                    />
                    <span className="truncate">{displayName(m)}</span>
                    {m.is_owner && (
                      <Badge variant="secondary">{tm("owner")}</Badge>
                    )}
                  </label>
                  <AutoTextarea
                    id={`smart-assign-rule-${m.user_id}`}
                    value={rules[m.user_id] ?? ""}
                    onChange={(e) =>
                      setRules((r) => ({ ...r, [m.user_id]: e.target.value }))
                    }
                    placeholder={t("smartAssignRulePlaceholder")}
                    maxLength={500}
                    disabled={!isOwner}
                    className="min-h-9 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-60"
                  />
                </li>
              ))}
            </ul>
            {isOwner && (
              <div>
                <Button type="submit" disabled={savingRules || !dirty}>
                  {savingRules && <Spinner />}
                  {tc("save")}
                </Button>
              </div>
            )}
          </form>
        )}
      </div>
    </SettingsSection>
  );
}
