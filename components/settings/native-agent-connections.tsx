"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "mangue-ui";

import { SettingsGroup, SettingsRow } from "./settings-ui";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { agentEngineDisplay } from "@/lib/agent-engine-display";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { disconnectNativeConnection, fetchNativeConnections, NativePrototypeRequestError } from "@/lib/native-agent-prototype-api";
import type { NativeRequestErrorCode } from "@/lib/native-agent-prototype-api";
import type { NativeConnectionMetadata } from "@/lib/native-agent-prototype";
import { NativeAgentLoginWizard } from "./native-agent-login-wizard";
import type { AccountAgentEngine } from "@/lib/agent-keys-api";

type NativeEngine = NativeConnectionMetadata["engine"];
type NativeErrorMessage = "error" | `error_${NativeRequestErrorCode}`;

function EngineLabel({ engine }: { engine: AccountAgentEngine }) {
  const identity = agentEngineDisplay(engine);
  const t = useTranslations("NativeAgentConnections");
  return <span className="inline-flex items-center gap-2">
    <McpAgentLogo agent={identity.logo} size={16} />
    <span>{identity.name}</span>
    {engine === "claude_code" && <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{t("experimental")}</span>}
  </span>;
}

/** Private native login state stays outside persisted queries and analytics. */
export function NativeAgentConnections({
  defaultEngine = "opencode",
  nativeAgentsEnabled,
  preferenceLoading = false,
  onEngineChange,
  openCodeProviderLabel,
  children,
}: {
  openCodeProviderLabel?: string;
  children?: ReactNode;
  defaultEngine?: AccountAgentEngine;
  nativeAgentsEnabled?: boolean;
  preferenceLoading?: boolean;
  onEngineChange?: (engine: AccountAgentEngine) => Promise<void>;
} = {}) {
  const t = useTranslations("NativeAgentConnections");
  const [enabled, setEnabled] = useState(false);
  const [connections, setConnections] = useState<NativeConnectionMetadata[]>([]);
  const [savingEngine, setSavingEngine] = useState(false);
  const [engineError, setEngineError] = useState<NativeErrorMessage | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const data = await fetchNativeConnections();
    if (mounted.current) {
      setEnabled(data.enabled);
      setConnections(data.enabled ? data.connections : []);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetchNativeConnections(controller.signal).then((data) => {
      if (!controller.signal.aborted) {
        setEnabled(data.enabled);
        setConnections(data.enabled ? data.connections : []);
      }
    }).catch(() => {});
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);

  const eligible = nativeAgentsEnabled ?? enabled;

  const selectEngine = async (value: string) => {
    if (!onEngineChange || savingEngine || !["opencode", "codex", "claude_code"].includes(value)) return;
    setSavingEngine(true);
    setEngineError(null);
    try {
      await onEngineChange(value as AccountAgentEngine);
    } catch (failure) {
      setEngineError(failure instanceof NativePrototypeRequestError && failure.code
        ? `error_${failure.code}` : "error");
    } finally {
      setSavingEngine(false);
    }
  };

  const ready = (engine: NativeEngine) => eligible && connections.some((item) =>
    item.engine === engine && (item.status === "connected" || item.status === "busy"));

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountAgent}
      title={t("title")}
      className="ph-no-capture ph-mask rr-block [&>header_h2]:text-base [&>header_h2]:font-semibold"
    >
      <p className="py-3 text-sm text-muted-foreground">{t("description")}</p>
      {onEngineChange && <SettingsRow
        label={t("engineTitle")}
        hint={t(defaultEngine === "opencode" ? "engineOpenCodeHint" : "engineNativeHint")}
        control={<Select value={defaultEngine} disabled={preferenceLoading || savingEngine}
          onValueChange={(value) => void selectEngine(value)}>
          <SelectTrigger className="w-72 max-w-full" aria-label={t("engineTitle")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="opencode"><span className="inline-flex items-center gap-2"><McpAgentLogo agent="opencode" size={16} /><span>{openCodeProviderLabel ? t("openCodeLabel", { provider: openCodeProviderLabel }) : "OpenCode"}</span></span></SelectItem>
            <SelectItem value="codex" disabled={!eligible}><EngineLabel engine="codex" /></SelectItem>
            <SelectItem value="claude_code" disabled={!eligible}><EngineLabel engine="claude_code" /></SelectItem>
          </SelectContent>
        </Select>}
      >
        {!eligible && defaultEngine !== "opencode" && <p className="py-2 text-sm text-muted-foreground" role="status">{t("engineUnavailable")}</p>}
        {eligible && defaultEngine !== "opencode" && !ready(defaultEngine)
          && <p className="py-2 text-sm text-muted-foreground" role="status">{t("engineReconnect")}</p>}
        {engineError && <p className="py-2 text-sm text-destructive" role="alert">{t(engineError)}</p>}
      </SettingsRow>}
      {defaultEngine === "claude_code" && <p className="py-2 text-sm text-muted-foreground" role="note">{t("claudeExperimentalHint")}</p>}
      {eligible && defaultEngine !== "opencode" && (
        <NativeConnectionRow
          key={defaultEngine}
          engine={defaultEngine}
          connection={connections.find((item) => item.engine === defaultEngine)}
          refresh={refresh}
        />
      )}
      {children}
    </SettingsGroup>
  );
}

function NativeConnectionRow({ engine, connection, refresh }: {
  engine: NativeEngine;
  connection?: NativeConnectionMetadata;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("NativeAgentConnections");
  const name = engine === "codex" ? "Codex" : "Claude Code";
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<NativeErrorMessage | null>(null);
  const status = connection?.status ?? "disconnected";
  const disconnect = async () => {
    if (pending) return;
    setPending(true); setError(null);
    try { await disconnectNativeConnection(engine); await refresh(); }
    catch (failure) { setError(failure instanceof NativePrototypeRequestError && failure.code ? `error_${failure.code}` : "error"); }
    finally { setPending(false); }
  };
  return <>
    <SettingsRow label={<EngineLabel engine={engine} />} hint={t(engine === "codex" ? "codexHint" : "claudeHint")}
      control={<div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground" role="status">{t(`status_${status}`)}</span>
        {status !== "connected" && status !== "busy"
          ? <Button size="sm" disabled={pending} onClick={() => setWizardOpen(true)}>{t(status === "connecting" ? "resume" : "connect", { agent: name })}</Button>
          : <Button size="sm" variant="ghost" disabled={pending} onClick={() => void disconnect()}>{t("disconnect")}</Button>}
      </div>}>
      {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
    </SettingsRow>
    {wizardOpen && <NativeAgentLoginWizard engine={engine} attemptId={status === "connecting" ? connection?.attemptId : undefined}
      refresh={refresh} onClose={() => { setWizardOpen(false); void refresh().catch(() => {}); }} />}
  </>;
}
