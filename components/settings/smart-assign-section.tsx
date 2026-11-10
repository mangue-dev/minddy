"use client";

import { projectPath } from "@/lib/app-urls";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import {useEffect, useRef, useState, type SVGProps} from "react";
import Link from "@/components/app-link";
import {useTranslations} from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchSmartAssignBackfillApi,
  smartAssignBackfillKey,
  startSmartAssignBackfillApi,
} from "@/lib/smart-assign-backfill-api";
import {useProjects} from "@/lib/projects-context";
import {useMembersQuery} from "@/lib/use-members-query";
import {UserAvatar} from "@/components/user-avatar";
import {displayName} from "@/lib/display-name";
import {userIdsWithoutRule} from "@/lib/smart-assign-config";
import {EmptyScene} from "@/components/empty-scene";
import {SettingsGroup, SettingsRow} from "@/components/settings/settings-ui";
import {SETTINGS_SECTIONS} from "@/lib/settings-sections";
import {AutoTextarea} from "@/components/auto-textarea";
import type { Project } from "@/lib/types";
import { TruncatedText } from "@/components/ui/truncated-text";

const UserCircleSceneIcon = ({
  className,
  style,
  strokeWidth,
  ref,
}: SVGProps<SVGSVGElement>) => (
  <HugeiconsIcon
    icon={UserCircleIcon}
    ref={ref}
    className={className}
    style={style}
    strokeWidth={strokeWidth as number | undefined}
  />
);

/** Project-level Smart Assign preferences (MIN-31): the opt-in switch and, on
 multi-member projects, one free-text assignment rule per member (owner
 included — the AI ​​matches new issues against these rules). Owner-only;
 members see a disabled, read-only state.

 Turning it on does not reach the issues that were already open with no
 assignee: the owner is asked once whether Smart Assign should assign them,
 and a row keeps the offer for later (MIN-903).

 The rules remain in VERTICAL rows: a free text of 500 characters
 does not fit at the end of a line. This is the assumed exception to key/value. */
/** How often the row re-reads a running backfill. */
const BACKFILL_POLL_MS = 3000;

/** Two rule maps say the same thing once blank texts and edge spaces are ignored. */
function sameRules(a: Record<string, string>, b: Record<string, string>): boolean {
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if ((a[id] ?? "").trim() !== (b[id] ?? "").trim()) return false;
  }
  return true;
}

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
  const { updateProject, refetch: refetchProjects } = useProjects();
  const queryClient = useQueryClient();
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
      if (next) void offerBackfill();
    } catch (e) {
      setEnabled(!next);
      toast.error((e as Error).message);
    } finally {
      setSavingToggle(false);
    }
  };

  // The backlog (MIN-903). Read for the owner only: the count describes every
  // open issue of the project, and the backfill runs on the owner's budget.
  // While a backfill runs the read repeats, so the row follows it to its end.
  const backfillKey = smartAssignBackfillKey(project.id);
  const { data: backfill } = useQuery({
    queryKey: backfillKey,
    queryFn: ({ signal }) => fetchSmartAssignBackfillApi(project.id, signal),
    enabled: isOwner && enabled,
    refetchInterval: (query) => (query.state.data?.running ? BACKFILL_POLL_MS : false),
  });
  const [offeredCount, setOfferedCount] = useState<number | null>(null);
  const [startingBackfill, setStartingBackfill] = useState(false);

  const offerBackfill = async () => {
    try {
      const state = await queryClient.fetchQuery({
        queryKey: backfillKey,
        queryFn: () => fetchSmartAssignBackfillApi(project.id),
        staleTime: 0,
      });
      // No offer while a member has no rule: the row says what is missing.
      if (state.count > 0 && !state.running && !state.rulesMissing) {
        setOfferedCount(state.count);
      }
    } catch {
      // The offer is optional: the row below makes it again once the read works.
    }
  };

  const startBackfill = async () => {
    if (startingBackfill) return;
    setStartingBackfill(true);
    try {
      queryClient.setQueryData(backfillKey, await startSmartAssignBackfillApi(project.id));
      setOfferedCount(null);
      // The project now carries the request: empty assignees read "Smart Assign".
      void refetchProjects();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStartingBackfill(false);
    }
  };

  // Says how the backfill ended, once, when it stops running.
  const backfillRunning = backfill?.running === true;
  const backfillLeft = backfill?.count ?? 0;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !backfillRunning) {
      if (backfillLeft > 0) {
        toast.info(t("smartAssignBackfillLeftToast", { count: backfillLeft }));
      } else {
        toast.success(t("smartAssignBackfillDoneToast"));
      }
      void refetchProjects();
    }
    wasRunning.current = backfillRunning;
  }, [backfillRunning, backfillLeft, refetchProjects, t]);
  const showBackfill = isOwner && enabled && (backfillRunning || backfillLeft > 0);
  const backfillBlocked = backfill?.rulesMissing === true && !backfillRunning;

  // Rules draft keyed by user_id; dirty compares against the saved map.
  const savedRules = project.smart_assign_rules ?? {};
  const [rules, setRules] = useState<Record<string, string>>(savedRules);
  const [savingRules, setSavingRules] = useState(false);
  // A refetch (Realtime, focus) brings a new saved map: adopt it only when
  // the draft holds no unsaved edit, so typing in progress is never wiped.
  const syncedRules = useRef(savedRules);
  useEffect(() => {
    const next = project.smart_assign_rules ?? {};
    const previous = syncedRules.current;
    syncedRules.current = next;
    setRules((draft) =>
      sameRules(draft, previous) || sameRules(draft, next) ? next : draft
    );
  }, [project.smart_assign_rules]);

  const dirty = members.some(
    (m) => (rules[m.user_id] ?? "").trim() !== (savedRules[m.user_id] ?? "")
  );

  // What is missing, read on the SAVED rules and not on the draft: it is
  // the state that Smart Assign uses, and this is the one that the dashboard
  // signal. A text typed but not yet saved therefore does not
  // disappear the mark — the registration, yes.
  const missingRuleIds = new Set(
    userIdsWithoutRule(
      members.map((m) => m.user_id),
      savedRules
    )
  );
  const incomplete = enabled && members.length > 1 && missingRuleIds.size > 0;

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
      // The backfill opens once every member has a rule.
      void queryClient.invalidateQueries({ queryKey: backfillKey });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingRules(false);
    }
  };

  const showRules = enabled && members.length > 1;

  return (
    <form onSubmit={saveRules}>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectSmartAssign}
        title={t("smartAssignTab")}
        action={
          <Switch
            id="smart-assign-enabled"
            checked={enabled}
            onCheckedChange={(v) => void toggle(v)}
            disabled={savingToggle || !isOwner}
            aria-label={t("smartAssignToggleLabel")}
          />
        }
        footer={
          showRules && isOwner ? (
            <Button type="submit" disabled={savingRules || !dirty}>
              {savingRules && <Spinner />}
              {tc("save")}
            </Button>
          ) : undefined
        }
      >
        {/* Alone in the project: Smart Assign is armed but has no one between
 who can decide. The scene says so, and offers the gesture that fulfills it —
 inviting someone, which only the owner can do. */}
        {enabled && !loading && members.length <= 1 && (
          <EmptyScene
            size="compact"
            icon={UserCircleSceneIcon}
            title={t("smartAssignSoloHint")}
          >
            {isOwner && (
              <Button asChild size="sm">
                <Link href={`${projectPath(project.id)}/settings?tab=members`}>
                  {tm("inviteByEmail")}
                </Link>
              </Button>
            )}
          </EmptyScene>
        )}

        {showBackfill && (
          <SettingsRow
            label={t("smartAssignBackfillRowLabel")}
            hint={t(
              backfillBlocked ? "smartAssignBackfillNeedsRules" : "smartAssignBackfillRowHint"
            )}
            control={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={backfillRunning || startingBackfill || backfillBlocked}
                onClick={() => void startBackfill()}
              >
                {(backfillRunning || startingBackfill) && <Spinner />}
                {backfillRunning
                  ? t("smartAssignBackfillRunning")
                  : t("smartAssignBackfillAction", { count: backfillLeft })}
              </Button>
            }
          />
        )}

        {showRules && (
          <SettingsRow
            label={t("smartAssignRulesTitle")}
            hint={t("smartAssignRulesDesc")}
          >
            {/* What's missing, said in plain English: otherwise an empty field looks like
 an optional field, and Smart Assign looks like it sorts while it
 returns everything to the owner. */}
            {incomplete && (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-warning-strong">
                <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("smartAssignIncompleteWarning", {
                  count: missingRuleIds.size,
                  total: members.length,
                })}
              </p>
            )}
          </SettingsRow>
        )}

        {showRules &&
          members.map((m) => (
            <SettingsRow
              key={m.user_id}
              orientation="vertical"
              htmlFor={`smart-assign-rule-${m.user_id}`}
              label={
                <>
                  <UserAvatar seed={m.avatar_seed} className="size-6" />
                  <TruncatedText text={displayName(m)} className="truncate" />
                  {m.is_owner && <Badge variant="secondary">{tm("owner")}</Badge>}
                  {missingRuleIds.has(m.user_id) && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-warning-strong">
                      <HugeiconsIcon icon={Alert01Icon} className="size-3" aria-hidden />
                      {t("smartAssignNoRule")}
                    </span>
                  )}
                </>
              }
              control={
                <AutoTextarea
                  id={`smart-assign-rule-${m.user_id}`}
                  value={rules[m.user_id] ?? ""}
                  onChange={(e) =>
                    setRules((r) => ({ ...r, [m.user_id]: e.target.value }))
                  }
                  placeholder={t("smartAssignRulePlaceholder", {
                    name: displayName(m),
                  })}
                  maxLength={500}
                  disabled={!isOwner}
                  className="min-h-9 w-full rounded-lg bg-control px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-control-hover disabled:opacity-60"
                />
              }
            />
          ))}
      </SettingsGroup>

      <Dialog
        open={offeredCount !== null}
        onOpenChange={(open) => {
          if (!open) setOfferedCount(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("smartAssignBackfillTitle")}</DialogTitle>
            <DialogDescription>
              {t("smartAssignBackfillDesc", { count: offeredCount ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOfferedCount(null)}>
              {t("smartAssignBackfillLater")}
            </Button>
            <Button
              type="button"
              disabled={startingBackfill}
              onClick={() => void startBackfill()}
            >
              {startingBackfill && <Spinner />}
              {t("smartAssignBackfillConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
