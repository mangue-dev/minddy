"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "mangue-ui";

import { SettingsGroup, SettingsRow } from "./settings-ui";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { agentEngineDisplay } from "@/lib/agent-engine-display";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import {
  cancelNativeLogin,
  disconnectNativeConnection,
  fetchNativeConnections,
  NativePrototypeRequestError,
  readNativeLogin,
  startNativeLogin,
  safeNativeErrorCode,
  submitNativeLoginCode,
} from "@/lib/native-agent-prototype-api";
import type { NativeRequestErrorCode } from "@/lib/native-agent-prototype-api";
import type {
  NativeConnectionMetadata,
  NativeLoginStatus,
} from "@/lib/native-agent-prototype";
import type { AccountAgentEngine } from "@/lib/agent-keys-api";

type NativeEngine = NativeConnectionMetadata["engine"];
type NativeErrorMessage = "error" | `error_${NativeRequestErrorCode}`;

function EngineLabel({ engine }: { engine: AccountAgentEngine }) {
  const identity = agentEngineDisplay(engine);
  return <span className="inline-flex items-center gap-2">
    <McpAgentLogo agent={identity.logo} size={16} />
    <span>{identity.name}</span>
  </span>;
}

function nativeErrorMessage(value: unknown): NativeErrorMessage {
  const code = safeNativeErrorCode(value);
  return code ? `error_${code}` : "error";
}

function approvalUrl(engine: NativeEngine, value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hosts = engine === "codex"
      ? ["auth.openai.com"]
      : ["claude.ai", "console.anthropic.com", "platform.claude.com"];
    return url.protocol === "https:" && !url.username && !url.password && !url.port && url.href.length <= 8192
      && hosts.includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
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
  const [login, setLogin] = useState<NativeLoginStatus | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<NativeErrorMessage | null>(null);
  const generation = useRef(0);
  const activeAttempt = useRef<string | null>(null);
  const mounted = useRef(false);
  const status = connection?.status ?? "disconnected";
  const waiting = login?.status === "waiting";
  const url = approvalUrl(engine, login?.verificationUrl);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      if (activeAttempt.current) {
        void cancelNativeLogin(engine, activeAttempt.current).catch(() => {});
        activeAttempt.current = null;
      }
    };
  }, [engine]);

  const acceptLogin = useCallback((next: NativeLoginStatus) => {
    setLogin(next);
    activeAttempt.current = next.status === "waiting" ? next.attemptId : null;
    if (next.status !== "waiting") {
      setCode("");
      void refresh().catch(() => {
        if (mounted.current) setError("error");
      });
    }
  }, [refresh]);

  useEffect(() => {
    if (!login || login.status !== "waiting" || pending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const attemptId = login.attemptId;
    const version = generation.current;
    const poll = async () => {
      try {
        const next = await readNativeLogin(engine, attemptId, controller.signal);
        if (controller.signal.aborted || generation.current !== version) return;
        acceptLogin(next);
        setError(null);
        if (next.status === "waiting") timer = setTimeout(poll, 2000);
      } catch {
        if (controller.signal.aborted || generation.current !== version) return;
        setError("error");
        timer = setTimeout(poll, 5000);
      }
    };
    timer = setTimeout(poll, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [engine, login?.attemptId, login?.status, acceptLogin, pending]);

  const action = async (operation: () => Promise<void>) => {
    if (pending) return;
    const version = ++generation.current;
    setPending(true);
    setError(null);
    try {
      await operation();
    } catch (failure) {
      if (mounted.current && version === generation.current) {
        setError(failure instanceof NativePrototypeRequestError && failure.code
          ? `error_${failure.code}` : "error");
      }
    } finally {
      if (mounted.current && version === generation.current) setPending(false);
    }
  };

  const connect = () => action(async () => {
    const next = status === "connecting" && connection?.attemptId
      ? await readNativeLogin(engine, connection.attemptId)
      : await startNativeLogin(engine);
    if (!mounted.current) {
      if (next.status === "waiting") await cancelNativeLogin(engine, next.attemptId);
      return;
    }
    acceptLogin(next);
  });

  const cancel = () => action(async () => {
    const attemptId = activeAttempt.current ?? connection?.attemptId;
    // Clear the displayed approval capability before cancelling on the server.
    setLogin(null);
    setCode("");
    if (attemptId) await cancelNativeLogin(engine, attemptId);
    activeAttempt.current = null;
    await refresh();
  });

  const submit = () => action(async () => {
    if (!login || !code.trim()) return;
    const submitted = code.trim();
    setCode("");
    const next = await submitNativeLoginCode(engine, login.attemptId, submitted);
    if (mounted.current) acceptLogin(next);
  });

  const disconnect = () => action(async () => {
    await disconnectNativeConnection(engine);
    if (!mounted.current) return;
    activeAttempt.current = null;
    setLogin(null);
    setCode("");
    await refresh();
  });


  return (
    <SettingsRow
      label={<EngineLabel engine={engine} />}
      hint={t(engine === "codex" ? "codexHint" : "claudeHint")}
      control={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" role="status">
            {t(`status_${waiting ? "connecting" : status}`)}
          </span>
          {!waiting && status !== "connected" && status !== "busy" && (
            <Button size="sm" disabled={pending} onClick={() => void connect()}>
              {t(status === "connecting" ? "resume" : "connect", { agent: name })}
            </Button>
          )}
          {(status === "connected" || status === "busy") && (
            <>
              <Button size="sm" variant="ghost" disabled={pending}
                onClick={() => void disconnect()}>{t("disconnect")}</Button>
            </>
          )}
        </div>
      }
    >
      {waiting && (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
          <p className="text-sm">{t("approvalHint", { agent: name })}</p>
          {login.userCode && (
            <p className="text-sm">{t("deviceCode")} <code>{login.userCode}</code></p>
          )}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
              className="w-fit text-sm underline underline-offset-4">
              {t("approve", { agent: name })}
            </a>
          )}
          {login.requiresCode && (
            <form autoComplete="off" onSubmit={(event) => { event.preventDefault(); void submit(); }}
              className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <label htmlFor={`native-login-code-${engine}`} className="text-sm">{t("approvalCode")}</label>
                <Input id={`native-login-code-${engine}`} type="password" autoComplete="off"
                  spellCheck={false} autoCapitalize="none" value={code} disabled={pending}
                  onChange={(event) => setCode(event.target.value)} maxLength={4096}
                  data-1p-ignore data-lpignore="true" aria-describedby={`native-login-hint-${engine}`} />
                <p id={`native-login-hint-${engine}`} className="text-xs text-muted-foreground">{t("codeHint")}</p>
              </div>
              <Button type="submit" size="sm" disabled={pending || !code.trim()}>{t("complete")}</Button>
            </form>
          )}
          <Button className="w-fit" size="sm" variant="ghost" disabled={pending}
            onClick={() => void cancel()}>{t("cancel")}</Button>
        </div>
      )}
      {pending && <p className="text-sm text-muted-foreground" role="status">{t("working")}</p>}
      {(error || login?.status === "failed" || login?.status === "expired") && (
        <p className="text-sm text-destructive" role="alert">
          {t(error ?? (login?.status === "expired" ? "expired" : nativeErrorMessage(login?.errorCode)))}
        </p>
      )}

    </SettingsRow>
  );
}
