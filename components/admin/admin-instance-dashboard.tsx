"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon, Clock01Icon, PencilEdit02Icon, Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import type { MessageKey } from "@/lib/i18n-keys";
import { INSTANCE_VARIABLE_THEMES, adminListIncludes, type InstanceVariableTheme } from "@/lib/instance-variables";
import { ADMIN_SECTIONS, adminSectionAnchor } from "@/lib/admin-sections";

/**
 * `/admin` → “Instance” (MIN-847): the instance variables an administrator
 * overrides from here, grouped by theme. A value set here WINS over the
 * environment file; removing it brings the file value back. Secrets are never
 * sent back to the browser — only their last characters.
 *
 * The tab exists only on a self-hosted instance whose environment file sets
 * `MINDDY_CONFIG_OVERRIDES=1` (lib/admin-tabs.ts); every request is checked
 * again on the server.
 */

type AdminKey = MessageKey<"Admin">;

/**
 * Whether this `ADMIN_EMAILS` value would lock the signed-in administrator
 * out. An administrator by role keeps access whatever the list says, as on
 * the server (lib/server/instance-variables.ts); everyone else must stay in
 * it. Checked before saving so a typo in one's own address never reaches the
 * server.
 */
function useLocksSelfOut(): (list: string | null) => boolean {
  const { user } = useAuth();
  return useCallback((list) => {
    if ((user?.app_metadata as { role?: string } | undefined)?.role === "admin") return false;
    return !adminListIncludes(list, user?.email);
  }, [user]);
}

/** Case- and accent-insensitive, so « adresse » finds « Adresses ». */
function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

interface VariableView {
  key: string;
  theme: InstanceVariableTheme;
  kind: "secret" | "text" | "url" | "email" | "emailList" | "choice" | "boolean";
  applies: "live" | "restart";
  choices?: string[];
  multiline?: boolean;
  sensitive?: boolean;
  source: "database" | "file" | "both" | "unset";
  value: string | null;
  fileValue: string | null;
  history: Array<{ index: number; action: "set" | "clear" | "rollback"; actorName: string | null; at: string; value: string | null }>;
}

class SaveError extends Error {
  constructor(readonly code: string | null, message: string) {
    super(message);
  }
}

async function call(method: "PATCH" | "DELETE" | "POST", body: Record<string, unknown>): Promise<void> {
  const url = method === "DELETE"
    ? `/api/admin/instance-variables?key=${encodeURIComponent(String(body.key))}`
    : "/api/admin/instance-variables";
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
    throw new SaveError(data?.code ?? null, data?.error ?? `HTTP ${res.status}`);
  }
}

const ERROR_KEYS: Record<string, AdminKey> = {
  invalid: "instance.errors.invalid",
  invalid_email: "instance.errors.invalid_email",
  invalid_url: "instance.errors.invalid_url",
  invalid_choice: "instance.errors.invalid_choice",
  empty: "instance.errors.empty",
  not_overridable: "instance.errors.not_overridable",
  disabled: "instance.errors.disabled",
  cannot_remove_self: "instance.errors.cannot_remove_self",
  no_such_version: "instance.errors.no_such_version",
};

/**
 * Runs a write; a refusal for a stale second factor asks for a code, then
 * the same write is replayed once the session carries a fresh one.
 */
function useGuardedWrite() {
  const t = useTranslations("Admin");
  const [reauth, setReauth] = useState<{ retry: () => Promise<void> } | null>(null);
  const run = useCallback(async (write: () => Promise<void>, success: string) => {
    try {
      await write();
      toast.success(success);
      return true;
    } catch (error) {
      if (error instanceof SaveError && error.code === "reauth_required") {
        setReauth({ retry: async () => { await write(); toast.success(success); } });
        return false;
      }
      const key = error instanceof SaveError && error.code ? ERROR_KEYS[error.code] : undefined;
      toast.error(key ? t(key) : (error as Error).message);
      return false;
    }
  }, [t]);
  return { run, reauth, closeReauth: () => setReauth(null) };
}

export function AdminInstanceDashboard() {
  const t = useTranslations("Admin");
  const [variables, setVariables] = useState<VariableView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [query, setQuery] = useState("");
  const { run, reauth, closeReauth } = useGuardedWrite();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/instance-variables", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { variables: VariableView[] };
      setVariables(data.variables);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // A variable matches by its name, its label, its help or its theme.
  const byTheme = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    const map = new Map<InstanceVariableTheme, VariableView[]>();
    for (const variable of variables ?? []) {
      if (needle) {
        const haystack = normalizeSearch([
          variable.key,
          t(`instance.vars.${variable.key}.label` as AdminKey),
          t(`instance.vars.${variable.key}.desc` as AdminKey),
          t(`instance.themes.${variable.theme}.title`),
        ].join(" "));
        if (!haystack.includes(needle)) continue;
      }
      map.set(variable.theme, [...(map.get(variable.theme) ?? []), variable]);
    }
    return map;
  }, [query, t, variables]);

  const write = useCallback(async (variable: VariableView, perform: () => Promise<void>, success: string) => {
    const done = await run(async () => {
      await perform();
      await load();
      if (variable.applies === "restart") setRestartNeeded(true);
    }, success);
    return done;
  }, [load, run]);

  return (
    <div className="flex flex-col gap-6">
      <header id={adminSectionAnchor(ADMIN_SECTIONS.instanceVariables)} className="scroll-mt-20 rounded-lg">
        <h2 className="text-sm font-semibold">{t("instance.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("instance.subtitle")}</p>
      </header>

      <div className="relative max-w-sm">
        <HugeiconsIcon icon={Search01Icon} className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          placeholder={t("instance.searchPlaceholder")}
          aria-label={t("instance.searchPlaceholder")}
          autoComplete="off"
          className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <AppTooltip label={t("instance.clearSearch")}>
            <button type="button" onClick={() => setQuery("")} aria-label={t("instance.clearSearch")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          </AppTooltip>
        ) : null}
      </div>

      {restartNeeded ? <RestartNotice /> : null}

      {failed ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("instance.loadError")}
        </div>
      ) : variables === null ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : byTheme.size === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("instance.searchEmpty", { query: query.trim() })}
        </p>
      ) : (
        INSTANCE_VARIABLE_THEMES.filter((theme) => byTheme.has(theme)).map((theme) => (
          <SettingsGroup
            key={theme}
            title={t(`instance.themes.${theme}.title`)}
            help={t(`instance.themes.${theme}.desc`)}
          >
            {byTheme.get(theme)!.map((variable) => (
              <VariableRow key={variable.key} variable={variable} write={write} />
            ))}
          </SettingsGroup>
        ))
      )}

      <ReauthDialog request={reauth} onClose={closeReauth} />
    </div>
  );
}

/** Where the value comes from; the tooltip says what that means. */
function SourceBadge({ source }: { source: VariableView["source"] }) {
  const t = useTranslations("Admin");
  return (
    <AppTooltip label={<span className="block max-w-72">{t(`instance.sourceHelp.${source}`)}</span>}>
      <Badge
        tabIndex={0}
        variant={source === "unset" ? "outline" : "secondary"}
        className={cn(
          "h-5 shrink-0 cursor-help text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          (source === "database" || source === "both") && "bg-violet-500/12 text-violet-700 dark:text-violet-300",
        )}
      >
        {t(`instance.source.${source}`)}
      </Badge>
    </AppTooltip>
  );
}

function VariableRow({
  variable,
  write,
}: {
  variable: VariableView;
  write: (variable: VariableView, perform: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  const t = useTranslations("Admin");
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const overridden = variable.source === "database" || variable.source === "both";
  const locksSelfOut = useLocksSelfOut();
  // Removing the override brings the file list back: it must still name you.
  const removalLocksOut = variable.key === "ADMIN_EMAILS" && locksSelfOut(variable.fileValue);
  const label = t(`instance.vars.${variable.key}.label` as AdminKey);
  const shown = variable.kind === "boolean" && variable.value
    ? t(variable.value === "1" ? "instance.on" : "instance.off")
    : variable.value;

  return (
    <SettingsRow
      label={
        <span className="flex flex-wrap items-center gap-2">
          {label}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{variable.key}</code>
          <SourceBadge source={variable.source} />
        </span>
      }
      hint={t(`instance.vars.${variable.key}.desc` as AdminKey)}
      control={
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
            {t("instance.edit")}
          </Button>
          {overridden ? (
            removalLocksOut ? (
              <AppTooltip label={<span className="block max-w-72">{t("instance.keepOwnAddressRemove")}</span>}>
                {/* A disabled button gets no pointer events: the span carries the tooltip. */}
                <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  <Button variant="ghost" size="sm" disabled>
                    {t("instance.remove")}
                  </Button>
                </span>
              </AppTooltip>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>
                {t("instance.remove")}
              </Button>
            )
          ) : null}
        </div>
      }
      orientation="responsive"
    >
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        {shown ? <span className="break-all font-mono text-foreground/80">{shown}</span> : null}
        {variable.source === "both" ? (
          <span>{t("instance.fileValue", { value: variable.fileValue ?? "" })}</span>
        ) : null}
        {/* Most changes apply within a minute: only the exception is said here. */}
        {variable.applies === "restart" ? <span>{t("instance.applies.restart")}</span> : null}
        {variable.history.length > 0 ? <History variable={variable} write={write} /> : null}
      </div>

      <EditDialog
        open={editing}
        onOpenChange={setEditing}
        variable={variable}
        label={label}
        onSave={async (value) => {
          const done = await write(variable, () => call("PATCH", { key: variable.key, value }), t("instance.saved"));
          if (done) setEditing(false);
        }}
      />
      <ConfirmDeleteDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("instance.removeTitle", { name: label })}
        description={variable.source === "both" ? t("instance.removeDescriptionFile") : t("instance.removeDescriptionUnset")}
        confirmLabel={t("instance.removeConfirm")}
        cancelLabel={t("instance.cancel")}
        onConfirm={async () => {
          await write(variable, () => call("DELETE", { key: variable.key }), t("instance.removed"));
        }}
      />
    </SettingsRow>
  );
}

function History({
  variable,
  write,
}: {
  variable: VariableView;
  write: (variable: VariableView, perform: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const locksSelfOut = useLocksSelfOut();
  // Restoring a removal brings the file value back.
  const restoreLocksOut = (entry: VariableView["history"][number]) =>
    variable.key === "ADMIN_EMAILS" && locksSelfOut(entry.value ?? variable.fileValue);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 rounded text-xs font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
        {t("instance.history", { count: variable.history.length })}
        <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 flex flex-col gap-1.5">
          {variable.history.map((entry) => (
            <li key={entry.index} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                {t("instance.historyEntry", {
                  action: t(`instance.action.${entry.action}`),
                  actor: entry.actorName ?? t("instance.someone"),
                  date: format.dateTime(new Date(entry.at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                })}
                {entry.value ? <span className="ml-1.5 font-mono text-foreground/70">{entry.value}</span> : null}
              </span>
              {entry.index > 0 && restoreLocksOut(entry) ? (
                <AppTooltip label={<span className="block max-w-72">{t("instance.keepOwnAddressRestore")}</span>}>
                  <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                    <Button variant="ghost" size="sm" className="h-6 px-2" disabled>
                      {t("instance.restore")}
                    </Button>
                  </span>
                </AppTooltip>
              ) : entry.index > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => void write(variable, () => call("POST", { key: variable.key, index: entry.index }), t("instance.restored"))}
                >
                  {t("instance.restore")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EditDialog({
  open,
  onOpenChange,
  variable,
  label,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variable: VariableView;
  label: string;
  onSave: (value: string) => Promise<void>;
}) {
  const t = useTranslations("Admin");
  // A secret never comes back to the browser: its field always starts empty.
  const initial = variable.kind === "secret" ? "" : variable.value ?? "";
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setDraft(initial);
  }, [initial, open]);
  const { user } = useAuth();
  const locksSelfOut = useLocksSelfOut();
  const selfOut = variable.key === "ADMIN_EMAILS" && draft.trim() !== "" && locksSelfOut(draft);
  const blocked = busy || !draft.trim() || selfOut;

  const save = async () => {
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  };

  const field = variable.kind === "choice" || variable.kind === "boolean" ? (
    <Select value={draft} onValueChange={setDraft}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={t("instance.choose")} />
      </SelectTrigger>
      <SelectContent>
        {(variable.kind === "boolean" ? ["1", "0"] : variable.choices ?? []).map((choice) => (
          <SelectItem key={choice} value={choice}>
            {variable.kind === "boolean"
              ? t(choice === "1" ? "instance.on" : "instance.off")
              : t(`instance.choices.${variable.key}.${choice}` as AdminKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : variable.multiline ? (
    <Textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      rows={6}
      spellCheck={false}
      className="font-mono text-xs"
      placeholder={t("instance.secretPlaceholder")}
      aria-label={label}
    />
  ) : (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      type={variable.kind === "secret" ? "password" : "text"}
      autoComplete="off"
      spellCheck={false}
      placeholder={variable.kind === "secret" ? t("instance.secretPlaceholder") : variable.kind === "emailList" ? "ops@example.com, lead@example.com" : undefined}
      aria-label={label}
      aria-invalid={selfOut || undefined}
      aria-describedby={selfOut ? "instance-variable-error" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !blocked) void save();
      }}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{t(`instance.vars.${variable.key}.desc` as AdminKey)}</DialogDescription>
        </DialogHeader>
        {field}
        {selfOut ? (
          <p id="instance-variable-error" role="alert" className="text-sm text-destructive">
            {t("instance.keepOwnAddress", { email: user?.email ?? "" })}
          </p>
        ) : null}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {variable.source === "file" || variable.source === "both" ? <span>{t("instance.overridesFile")}</span> : null}
          <span>{t(`instance.applies.${variable.applies}`)}</span>
          {variable.sensitive ? <span>{t("instance.sensitiveNote")}</span> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("instance.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={blocked}>
            {busy ? <Spinner /> : null}
            {t("instance.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A second factor presented again, then the write that needed it, replayed. */
function ReauthDialog({ request, onClose }: { request: { retry: () => Promise<void> } | null; onClose: () => void }) {
  const t = useTranslations("Admin");
  const { firstTotpFactorId, verifyTotp } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (request) {
      setCode("");
      setError(null);
    }
  }, [request]);

  const confirm = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const factorId = await firstTotpFactorId();
      if (!factorId) throw new Error(t("instance.reauthNoFactor"));
      await verifyTotp(factorId, code.trim());
      await request.retry();
      onClose();
    } catch (e) {
      setError(e instanceof SaveError && e.code && ERROR_KEYS[e.code] ? t(ERROR_KEYS[e.code]) : t("instance.reauthFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("instance.reauthTitle")}</DialogTitle>
          <DialogDescription>{t("instance.reauthDescription")}</DialogDescription>
        </DialogHeader>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label={t("instance.reauthCode")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.trim().length === 6) void confirm();
          }}
        />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("instance.cancel")}
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || code.trim().length !== 6}>
            {busy ? <Spinner /> : null}
            {t("instance.reauthConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A change that applies after a restart. In the desktop app running the
 * local instance, one click restarts it; elsewhere, the operator does.
 */
function RestartNotice() {
  const t = useTranslations("Admin");
  const [restarting, setRestarting] = useState(false);
  const bridge = typeof window === "undefined" ? null : getDesktopBridge();
  const canRestart = typeof bridge?.restartLocalInstance === "function";

  const restart = async () => {
    if (!bridge?.restartLocalInstance) return;
    setRestarting(true);
    try {
      if (!(await bridge.restartLocalInstance())) toast.error(t("instance.restartFailed"));
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
      <span>{canRestart ? t("instance.restartNeededDesktop") : t("instance.restartNeeded")}</span>
      {canRestart ? (
        <Button size="sm" variant="outline" onClick={() => void restart()} disabled={restarting}>
          {restarting ? <Spinner /> : <HugeiconsIcon icon={Refresh01Icon} className="size-3.5" />}
          {t("instance.restartNow")}
        </Button>
      ) : null}
    </div>
  );
}
