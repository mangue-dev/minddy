"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon, Copy01Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { Button, Input, Spinner } from "mangue-ui";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { WizardDialog, type WizardStep } from "@/components/wizard/wizard-dialog";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import {
  cancelNativeLogin, NativePrototypeRequestError, readNativeLogin,
  safeNativeErrorCode, startNativeLogin, submitNativeLoginCode,
} from "@/lib/native-agent-prototype-api";
import type { NativeHarness, NativeLoginStatus } from "@/lib/native-agent-prototype";

const transport = { startNativeLogin, readNativeLogin, cancelNativeLogin, submitNativeLoginCode };
type StepId = "prepare" | "authorize" | "code" | "done";

function approvalUrl(engine: NativeHarness, value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hosts = engine === "codex" ? ["auth.openai.com"]
      : ["claude.ai", "console.anthropic.com", "platform.claude.com"];
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && !url.hash && url.href.length <= 8192 && hosts.includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

/** Display a provider-issued code without editable fields or autocomplete. */
function DeviceCode({ code, label }: { code: string; label: string }) {
  return <div className="space-y-3">
    <p className="text-sm font-medium">{label}</p>
    <div role="group" aria-label={label} className="flex items-center justify-center gap-1 sm:gap-1.5">
      <span className="sr-only">{code}</span>
      {[...code].map((char, index) => char === "-" || char === " "
        ? <span key={index} aria-hidden className="shrink-0 text-muted-foreground">–</span>
        : <span key={index} aria-hidden className="flex h-9 min-w-0 max-w-8 flex-1 items-center justify-center rounded-md border border-input bg-card font-mono text-base font-medium sm:h-12 sm:max-w-10 sm:text-lg">{char}</span>)}
    </div>
  </div>;
}

/** Native login lives only for this wizard; closing cancels outstanding approval. */
export function NativeAgentLoginWizard({ engine, attemptId, onClose, refresh, api = transport }: {
  engine: NativeHarness;
  attemptId?: string;
  onClose: () => void;
  refresh: () => Promise<void>;
  api?: typeof transport;
}) {
  const t = useTranslations("NativeAgentConnections");
  const name = engine === "codex" ? "Codex" : "Claude Code";
  const [stepIndex, setStepIndex] = useState(0);
  const [login, setLogin] = useState<NativeLoginStatus | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const activeAttempt = useRef<string | null>(null);
  const doneIndex = engine === "claude_code" ? 3 : 2;
  const url = approvalUrl(engine, login?.verificationUrl);
  const failed = login?.status === "failed" || login?.status === "expired";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      if (activeAttempt.current) {
        void api.cancelNativeLogin(engine, activeAttempt.current).then(refresh).catch(() => {});
        activeAttempt.current = null;
      }
    };
  }, [engine, api, refresh]);

  const acceptLogin = useCallback((next: NativeLoginStatus) => {
    setLogin(next);
    activeAttempt.current = next.status === "waiting" ? next.attemptId : null;
    if (next.status === "connected") {
      setCode("");
      setError(null);
      setStepIndex(doneIndex);
      void refresh().catch(() => { if (mounted.current) setError(t("error")); });
    } else if (next.status === "failed" || next.status === "expired") {
      setCode("");
      const safe = safeNativeErrorCode(next.errorCode);
      setError(t(next.status === "expired" ? "expired" : safe ? `error_${safe}` : "error"));
    }
  }, [doneIndex, refresh, t]);

  useEffect(() => {
    if (login?.status !== "waiting" || pending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const version = generation.current;
    const poll = async () => {
      try {
        const next = await api.readNativeLogin(engine, login.attemptId, controller.signal);
        if (controller.signal.aborted || generation.current !== version) return;
        acceptLogin(next);
        if (next.status === "waiting") { setError(null); timer = setTimeout(poll, 2000); }
      } catch {
        if (controller.signal.aborted || generation.current !== version) return;
        setError(t("wizardPollError"));
        timer = setTimeout(poll, 5000);
      }
    };
    timer = setTimeout(poll, 2000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [engine, login?.attemptId, login?.status, pending, api, acceptLogin, t]);

  const action = async (operation: () => Promise<NativeLoginStatus>, waitingStep?: number) => {
    if (pending) return;
    const version = ++generation.current;
    setPending(true); setError(null); setCopied(false); setCopyError(false);
    try {
      const next = await operation();
      if (!mounted.current || version !== generation.current) {
        if (next.status === "waiting") { await api.cancelNativeLogin(engine, next.attemptId); await refresh(); }
        return;
      }
      acceptLogin(next);
      if (next.status === "waiting") setStepIndex(current => waitingStep ?? Math.max(1, current));
    } catch (failure) {
      if (mounted.current && version === generation.current) {
        setError(t(failure instanceof NativePrototypeRequestError && failure.code ? `error_${failure.code}` : "error"));
      }
    } finally { if (mounted.current && version === generation.current) setPending(false); }
  };

  const connect = () => action(() => attemptId && !login
    ? api.readNativeLogin(engine, attemptId) : api.startNativeLogin(engine), 1);
  const copy = async () => {
    if (!login?.userCode) return;
    try { await navigator.clipboard.writeText(login.userCode); if (mounted.current) { setCopied(true); setCopyError(false); } }
    catch { if (mounted.current) { setCopied(false); setCopyError(true); } }
  };
  const openBrowser = (event: MouseEvent<HTMLAnchorElement>) => {
    const desktop = getDesktopBridge();
    if (desktop && url) { event.preventDefault(); desktop.openExternal(url); }
  };
  const identity = <div className="flex items-center gap-4 rounded-xl border bg-card p-5">
    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted"><McpAgentLogo agent={engine === "codex" ? "codex" : "claude"} size={32} /></span>
    <div className="space-y-1"><p className="font-semibold">{name}</p><p className="text-sm text-muted-foreground">{t("wizardSubscription")}</p></div>
  </div>;
  const protect = (content: ReactNode) => <div className="ph-no-capture ph-mask rr-block flex flex-col gap-5">{content}</div>;
  const steps: WizardStep<StepId>[] = [
    { id: "prepare", title: t("wizardPrepareTitle", { agent: name }), subtitle: t("wizardPrepareDescription"),
      submitLabel: t(attemptId ? "wizardResume" : "wizardStart"), content: protect(<>
        {identity}
        <div className="space-y-3 text-sm text-muted-foreground"><p>{t("wizardScope")}</p><p>{t("wizardPersistence")}</p></div>
        {engine === "claude_code" && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("claudeExperimentalHint")}</p>}
      </>) },
    { id: "authorize", title: t("wizardAuthorizeTitle"), subtitle: t("wizardAuthorizeDescription", { agent: name }), lockBack: true,
      hideSubmit: engine === "codex" && !failed, submitLabel: t(failed ? "wizardRetry" : "wizardHaveCode"), submitDisabled: !failed && !url,
      content: protect(<>
        {login?.status === "waiting" && <>
          {login.userCode && <div className="space-y-4 rounded-xl border bg-muted/30 p-4 sm:p-5">
            <DeviceCode code={login.userCode} label={t("deviceCode")} />
            <Button type="button" variant="outline" className="w-full" onClick={() => void copy()}>
              <HugeiconsIcon icon={copied ? CheckIcon : Copy01Icon} className="size-4" />{t(copied ? "wizardCopied" : "wizardCopy")}
            </Button>
            {copyError && <p role="alert" className="text-sm text-destructive">{t("wizardCopyError")}</p>}
          </div>}
          {url && <Button asChild className="h-10 w-full"><a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={openBrowser}>
            <HugeiconsIcon icon={LinkSquare01Icon} className="size-4" />{t("wizardOpenBrowser")}
          </a></Button>}
          <p className="text-sm text-muted-foreground">{t(engine === "codex" ? "wizardCodexInstructions" : "wizardClaudeInstructions")}</p>
          <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground"><Spinner />{t("wizardWaiting")}</div>
          <Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button>
        </>}
      </>) },
    ...(engine === "claude_code" ? [{ id: "code" as const, title: t("wizardCodeTitle"), subtitle: t("codeHint"), lockBack: true,
      submitLabel: t(failed ? "wizardRetry" : "complete"), submitDisabled: !failed && !code.trim(), content: protect(<>
        <div className="space-y-2"><label htmlFor="native-login-code" className="text-sm font-medium">{t("approvalCode")}</label>
          <Input id="native-login-code" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" value={code} disabled={pending}
            onChange={event => setCode(event.target.value)} maxLength={2048} data-1p-ignore data-lpignore="true" />
        </div><Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button>
      </>) }] : []),
    { id: "done", title: t("wizardDoneTitle", { agent: name }), subtitle: t("wizardDoneDescription"), lockBack: true,
      submitLabel: t("wizardFinish"), content: protect(<>
        {identity}<div role="status" className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4"><HugeiconsIcon icon={CheckIcon} className="mt-0.5 size-5 shrink-0" /><p className="text-sm">{t("wizardReady", { agent: name })}</p></div>
      </>) },
  ];

  return <WizardDialog open label={t("wizardLabel", { agent: name })} steps={steps} stepIndex={stepIndex}
    onStepIndexChange={setStepIndex} onOpenChange={next => { if (!next) onClose(); }} submitting={pending} error={error}
    onSubmit={step => {
      if (step === "done") onClose();
      else if (step === "prepare" || failed) void connect();
      else if (step === "authorize" && engine === "claude_code") setStepIndex(2);
      else if (step === "code" && login && code.trim()) { const submitted = code.trim(); setCode(""); void action(() => api.submitNativeLoginCode(engine, login.attemptId, submitted)); }
    }} />;
}
