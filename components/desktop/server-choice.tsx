"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  ComputerIcon,
  Download04Icon,
  Folder01Icon,
  LinkSquare02Icon,
  ServerStack01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MinddyLogo } from "@/components/minddy-logo";
import { CARD_TONES } from "@/components/marketing/card-tones";
import type { Locale } from "@/i18n/config";
import type { DesktopServerChoiceBridge } from "@/lib/desktop/bridge";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import {
  LOCAL_INSTALL_STEPS,
  LOCAL_PREREQUISITES,
  LOCAL_PREREQUISITE_INFO,
  type InstallMessage,
  type LocalInstallProgress,
  type LocalInstallStep,
  type LocalPrerequisiteResult,
} from "@/lib/desktop/local-installer";
import { TOOLCHAIN_ACTIONS, type ToolchainAction } from "@/lib/desktop/local-toolchain";
import { serverGuideUrl, type DesktopServerChoiceState } from "@/lib/desktop/server-choice";
import { ENV_LOGO_TINT, type AppEnv } from "@/lib/env";
import type { MessageKey } from "@/lib/i18n-keys";
import { cn } from "@/lib/utils";

type Step = "selfhost" | "existing" | "install" | "progress";
type T = ReturnType<typeof useTranslations<"DesktopWelcome">>;

const STEP_LABEL: Record<LocalInstallStep, MessageKey<"DesktopWelcome">> = {
  git: "stepGit",
  node: "stepNode",
  pnpm: "stepPnpm",
  supabase: "stepSupabase",
  docker: "stepDocker",
  "docker-start": "stepDockerStart",
  clone: "stepClone",
  dependencies: "stepDependencies",
  configure: "stepConfigure",
  prepare: "stepPrepare",
  start: "stepStart",
  account: "stepAccount",
};

/** Where an "Install manually" link sends a failed tool step. */
const TOOL_DOWNLOAD: Record<ToolchainAction, (typeof LOCAL_PREREQUISITES)[number]> = {
  git: "git",
  node: "node",
  pnpm: "pnpm",
  supabase: "supabase",
  docker: "docker",
  "docker-start": "docker",
};

function say(t: T, message: InstallMessage | undefined): string {
  if (!message) return "";
  if ("text" in message) return message.text;
  return t(message.code, message.values);
}

/** One staggered entrance, the landing's blur and fade (`hero-reveal`). */
function Enter({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn("hero-reveal", className)} style={{ "--hero-d": index * 0.07 } as CSSProperties}>
      {children}
    </div>
  );
}

/**
 * A choice in the pastel of its landing card (`CARD_TONES`): the same soft
 * tints the public site and the sign-in showcase give minddy's features, so
 * the first screen of the app already looks like the rest of it.
 */
function Choice({
  icon,
  title,
  body,
  onClick,
  large,
  tone,
  external,
}: {
  icon: IconSvgElement;
  title: string;
  body: string;
  onClick: () => void;
  large?: boolean;
  tone: keyof typeof CARD_TONES;
  /** Opens a page in the browser rather than a next step. */
  external?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-4 rounded-lg p-4 text-left transition-[filter,transform] hover:brightness-[0.97] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-110",
        CARD_TONES[tone],
        large && "h-full flex-col items-start gap-0 p-6",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-background/70">
        <HugeiconsIcon icon={icon} className="size-5" />
      </span>
      <span className={cn("min-w-0 flex-1", large && "mt-10")}>
        <span className={cn("block font-semibold tracking-tight", large ? "text-lg" : "text-sm")}>{title}</span>
        <span className="mt-1 block text-sm leading-relaxed opacity-70">{body}</span>
      </span>
      <HugeiconsIcon
        icon={external ? LinkSquare02Icon : ArrowRight01Icon}
        className={cn(
          "size-4 shrink-0 opacity-60 transition-[transform,opacity] group-hover:translate-x-0.5 group-hover:opacity-100",
          large && "absolute top-6 right-6",
        )}
      />
    </button>
  );
}

function StateDot({ state }: { state: string }) {
  if (state === "running" || state === "checking") return <Spinner className="size-[18px]" />;
  const tone =
    state === "ready" || state === "done" || state === "skipped"
      ? "bg-success text-success-foreground"
      : state === "failed"
        ? "bg-destructive-button text-destructive-button-foreground"
        : state === "pending"
          ? "border border-border"
          : "bg-brand text-brand-foreground";
  const icon =
    state === "ready" || state === "done" || state === "skipped"
      ? Tick02Icon
      : state === "failed"
        ? Cancel01Icon
        : state === "pending"
          ? null
          : Download04Icon;
  return (
    <span aria-hidden className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full", tone)}>
      {icon && <HugeiconsIcon icon={icon} className="size-3" strokeWidth={2.5} />}
    </span>
  );
}

/**
 * Self-hosting from the desktop app (MIN-781): install minddy on this
 * computer, install it on a server, or use an existing installation (a local
 * folder or a server address). The app itself starts on minddy Cloud. Shipped inside the desktop app and served from
 * `minddy-app://welcome/` (`server-choice-entry.tsx`), so it works offline and
 * before any server; every action goes through the closed `serverChoice`
 * bridge. No Next.js API here: this page runs without the Next runtime.
 */
export function DesktopServerChoice({ env }: { env: AppEnv }) {
  const t = useTranslations("DesktopWelcome");
  const locale = useLocale() as Locale;
  const [bridge, setBridge] = useState<DesktopServerChoiceBridge | null | undefined>(undefined);
  const [choice, setChoice] = useState<DesktopServerChoiceState | null>(null);
  const [step, setStep] = useState<Step>("selfhost");

  const [serverAddress, setServerAddress] = useState("");
  const [serverMessage, setServerMessage] = useState("");
  const [serverMessageIsError, setServerMessageIsError] = useState(true);
  const [requirements, setRequirements] = useState<LocalPrerequisiteResult[] | null>(null);
  const [folder, setFolder] = useState("");
  const [folderMessage, setFolderMessage] = useState("");
  const [progress, setProgress] = useState<Partial<Record<LocalInstallStep, LocalInstallProgress>>>({});
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<InstallMessage | null>(null);

  useEffect(() => {
    const serverChoice = getDesktopBridge()?.serverChoice ?? null;
    setBridge(serverChoice);
    if (!serverChoice) return;
    void serverChoice.state().then((state) => {
      if (!state) return;
      setChoice(state);
      setFolder(state.installFolder);
      if (state.isCustomServer) setServerAddress(state.origin);
      // A reload during an installation shows its progress again, with Cancel.
      if (state.installRunning) {
        setStep("progress");
        setInstalling(true);
      }
    });
    return serverChoice.onInstallProgress((update) => {
      setProgress((previous) => ({ ...previous, [update.step]: update }));
      // Also ends an installation this page did not start (after a reload).
      if (update.state === "failed") {
        setInstalling(false);
        setInstallError(update.detail ?? { code: "localStartFailed" });
      }
    });
  }, []);

  const checkRequirements = useCallback(async () => {
    if (!bridge) return;
    setRequirements(null);
    try {
      setRequirements(await bridge.prerequisites());
    } catch {
      // Unknown states: Install still offers to install what is missing.
      setRequirements([]);
    }
  }, [bridge]);

  useEffect(() => {
    if (step === "install") void checkRequirements();
  }, [step, checkRequirements]);

  const install = async () => {
    if (!bridge) return;
    setProgress({});
    setInstallError(null);
    setStep("progress");
    setInstalling(true);
    try {
      const result = await bridge.install();
      if (result.error) setInstallError(result.error);
    } catch {
      setInstallError({ code: "localStartFailed" });
    } finally {
      setInstalling(false);
    }
  };

  // Served only inside the desktop app, whose preload always brings it.
  if (!bridge) return null;

  const openGuide = () => {
    if (choice) getDesktopBridge()?.openExternal(serverGuideUrl(choice.cloudOrigin, locale));
  };
  const toolSteps = TOOLCHAIN_ACTIONS.filter((action) => progress[action]);
  const steps: LocalInstallStep[] = [...toolSteps, ...LOCAL_INSTALL_STEPS];

  return (
    <Frame
      env={env}
      onHome={installing ? undefined : () => bridge.close()}
      crumbs={[
        { label: t("selfHostHeading"), onSelect: step === "selfhost" || installing ? undefined : () => setStep("selfhost") },
        ...(step === "existing" ? [{ label: t("existingTitle") }] : []),
        ...(step === "install" || step === "progress" ? [{ label: t("installTitle") }] : []),
      ]}
    >
      {step === "selfhost" && (
        <div key="selfhost">
          <StepHeader index={0} title={t("selfHostHeading")} lead={t("selfHostLead")} />
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Enter index={3}>
              <Choice large tone="mint" icon={ComputerIcon} title={t("installTitle")} body={t("installBody")} onClick={() => setStep("install")} />
            </Enter>
            <Enter index={4}>
              <Choice large external tone="peach" icon={ServerStack01Icon} title={t("serverInstallTitle")} body={t("serverInstallBody")} onClick={openGuide} />
            </Enter>
            <Enter index={5}>
              <Choice large tone="lavender" icon={Folder01Icon} title={t("existingTitle")} body={t("existingBody")} onClick={() => setStep("existing")} />
            </Enter>
          </div>
        </div>
      )}

      {/* Every way to reach an installation that already exists, local or
          remote, in one place. */}
      {step === "existing" && (
        <div key="existing">
          <StepHeader index={0} title={t("existingHeading")} lead={t("existingLead")} />
          <Enter index={3}>
            <div className="mt-6">
              <Choice
                tone="lavender"
                icon={Folder01Icon}
                title={t("localFolderTitle")}
                body={t("localFolderBody")}
                onClick={async () => {
                  setServerMessageIsError(false);
                  setServerMessage(t("startingLocal"));
                  const result = await bridge.useExistingInstallation();
                  setServerMessageIsError(true);
                  setServerMessage(say(t, result.error));
                }}
              />
            </div>
          </Enter>
          <Enter index={4}>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              {t("serverDivider")}
              <div className="h-px flex-1 bg-border" />
            </div>
          </Enter>
          <Enter index={5}>
            <form
              className={cn("rounded-lg p-5", CARD_TONES.sky)}
              onSubmit={async (event) => {
                event.preventDefault();
                setServerMessageIsError(true);
                setServerMessage("");
                const result = await bridge.connect(serverAddress);
                if (result.error) setServerMessage(say(t, result.error));
              }}
            >
              <label htmlFor="server-address" className="text-sm font-semibold">
                {t("serverLabel")}
              </label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="server-address"
                  type="url"
                  required
                  spellCheck={false}
                  className="h-10 bg-background/80 text-foreground"
                  placeholder={t("serverPlaceholder")}
                  value={serverAddress}
                  onChange={(event) => setServerAddress(event.target.value)}
                  aria-describedby="server-help server-message"
                />
                <Button type="submit" className="h-10 rounded-full px-4">
                  {t("connect")}
                </Button>
              </div>
              <p id="server-help" className="mt-2 text-xs opacity-70">
                {t("serverHelp")}
              </p>
            </form>
          </Enter>
          <p id="server-message" role="alert" className={cn("mt-2 min-h-4 text-xs", serverMessageIsError ? "text-destructive" : "text-muted-foreground")}>
            {serverMessage}
          </p>
          {choice?.isCustomServer && (
            <Enter index={6}>
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void bridge.useCloud()}>
                  {t("useCloud")}
                </Button>
              </div>
            </Enter>
          )}
        </div>
      )}

      {step === "install" && (
        <div key="install">
          <StepHeader index={0} title={t("installHeading")} lead={t("installLead")} />
          <Enter index={3}>
            <div className={cn("mt-6 rounded-lg", CARD_TONES.mint)}>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-sm font-semibold">{t("requirementsTitle")}</span>
                <Button variant="outline" size="sm" className="rounded-full" disabled={requirements === null} onClick={() => void checkRequirements()}>
                  {t("recheck")}
                </Button>
              </div>
              <ul aria-live="polite">
                {LOCAL_PREREQUISITES.map((id) => {
                  const result = requirements?.find((entry) => entry.id === id);
                  const state = result?.state ?? "checking";
                  const label = !result
                    ? t("checking")
                    : result.state === "ready"
                      ? [t("requirementReady"), result.version].filter(Boolean).join(" · ")
                      : result.state === "outdated"
                        ? t("requirementWillReplace", { version: result.version ?? "?" })
                        : result.state === "stopped"
                          ? t("requirementWillStart")
                          : t("requirementWillInstall");
                  return (
                    <li key={id} className="flex min-h-10 items-center gap-2.5 border-t border-current/10 px-4 py-1.5 text-sm first:border-t-0">
                      <StateDot state={state} />
                      <span className="flex-1 font-medium">{LOCAL_PREREQUISITE_INFO[id].name}</span>
                      <span className="text-right text-xs opacity-70">{label}</span>
                    </li>
                  );
                })}
              </ul>
              {requirements?.some((entry) => entry.state !== "ready") && (
                <p className="px-4 pt-1 pb-3 text-xs leading-relaxed opacity-70">{t("requirementsAutomatic")}</p>
              )}
            </div>
          </Enter>
          <Enter index={4}>
            <div className="mt-5 grid gap-4">
              <div>
                <span className="text-sm font-medium" id="install-folder-label">
                  {t("folderLabel")}
                </span>
                <div className="mt-1.5 flex gap-2">
                  <div
                    aria-labelledby="install-folder-label"
                    className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md bg-muted px-3 text-sm text-muted-foreground select-text"
                  >
                    <HugeiconsIcon icon={Folder01Icon} className="size-4 shrink-0" />
                    <span className="truncate">{folder}</span>
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full px-4"
                    onClick={async () => {
                      const result = await bridge.chooseInstallFolder();
                      if (result.folder) setFolder(result.folder);
                      setFolderMessage(say(t, result.error));
                    }}
                  >
                    {t("chooseFolder")}
                  </Button>
                </div>
                {folderMessage && <p className="mt-1.5 text-xs text-destructive">{folderMessage}</p>}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("accountNote")}</p>
            </div>
          </Enter>
          <Enter index={5}>
            <div className="mt-6 flex justify-end">
              <Button
                className="h-10 rounded-full px-5"
                disabled={requirements === null || installing}
                onClick={() => void install()}
              >
                {t("install")}
              </Button>
            </div>
          </Enter>
        </div>
      )}

      {step === "progress" && (
        <div key="progress">
          <Enter index={0}>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{t("progressHeading")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("progressLead")}</p>
          </Enter>
          <Enter index={1}>
            <ol className="mt-6 grid gap-1" aria-live="polite">
              {steps.map((id) => {
                const entry = progress[id];
                const state = entry?.state ?? "pending";
                const tool = (TOOLCHAIN_ACTIONS as readonly string[]).includes(id) ? TOOL_DOWNLOAD[id as ToolchainAction] : null;
                return (
                  <li key={id} className="grid grid-cols-[18px_1fr] items-center gap-x-3 py-2.5 text-sm">
                    <StateDot state={state} />
                    <span className={cn(state === "pending" && "text-muted-foreground")}>
                      {t(STEP_LABEL[id], { version: choice?.release ?? "" })}
                    </span>
                    {entry?.detail && (
                      <span className={cn("col-start-2 mt-1 text-xs leading-relaxed break-words select-text", state === "failed" ? "text-destructive" : "text-muted-foreground")}>
                        {say(t, entry.detail)}
                      </span>
                    )}
                    {state === "failed" && tool && (
                      <button
                        type="button"
                        onClick={() => bridge.openToolDownload(tool)}
                        className="col-start-2 mt-1.5 justify-self-start text-xs font-medium underline-offset-4 hover:underline"
                      >
                        {t("installManually")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </Enter>
          {installError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t("installFailed")}
              {/* A failed step already shows its own line; an install refused
                  before any step (folder, already running) says why here. */}
              {!Object.values(progress).some((entry) => entry?.state === "failed") && ` — ${say(t, installError)}`}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            {installing ? (
              <Button variant="outline" className="rounded-full" onClick={() => bridge.cancelInstall()}>
                {t("cancel")}
              </Button>
            ) : (
              <>
                <Button variant="outline" className="rounded-full" onClick={() => setStep("install")}>
                  {t("back")}
                </Button>
                {installError && (
                  <Button className="rounded-full" onClick={() => void install()}>
                    {t("retry")}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Frame>
  );
}

function StepHeader({ index, title, lead }: { index: number; title: string; lead: string }) {
  return (
    <>
      <Enter index={index}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      </Enter>
      <Enter index={index + 1}>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{lead}</p>
      </Enter>
    </>
  );
}

interface Crumb {
  label: string;
  /** Absent on the current step, and while an installation runs. */
  onSelect?: () => void;
}

/**
 * The page around the steps. The brand sits where the sign-in screen puts it
 * (`.auth-logo-row`: top left, after the macOS window buttons), in the
 * environment's colour, so moving between the two never moves the mark. The
 * breadcrumb grows from it: the mark leads back to the app, each crumb to its
 * step. The colour of the page is in the choices, in minddy's pastels.
 */
function Frame({ env, crumbs, onHome, children }: { env: AppEnv; crumbs: Crumb[]; onHome?: () => void; children: ReactNode }) {
  const t = useTranslations("DesktopWelcome");
  const crumbClass = "rounded-full px-2 py-1 text-sm transition-colors [-webkit-app-region:no-drag]";
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background p-8">
      {/* Also the window's drag strip: this page has no app chrome around it. */}
      <nav aria-label={t("breadcrumbLabel")} className="auth-logo-row flex min-w-0 items-center gap-1 [-webkit-app-region:drag]">
        <button
          type="button"
          onClick={onHome}
          disabled={!onHome}
          aria-label={t("backToApp")}
          className="inline-flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100 [-webkit-app-region:no-drag]"
        >
          <MinddyLogo className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[env])} />
        </button>
        <ol className="flex min-w-0 items-center gap-1">
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1;
            return (
              <li key={crumb.label} className="flex min-w-0 items-center gap-1">
                <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground/60", index === 0 && "ml-2")} />
                {crumb.onSelect && !current ? (
                  <button type="button" onClick={crumb.onSelect} className={cn(crumbClass, "text-muted-foreground hover:bg-control-hover hover:text-foreground")}>
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    aria-current={current ? "page" : undefined}
                    className={cn(crumbClass, "truncate", current ? "font-medium text-foreground" : "text-muted-foreground")}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <main className="relative mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center py-10">{children}</main>
    </div>
  );
}
