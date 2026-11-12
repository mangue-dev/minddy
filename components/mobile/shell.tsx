"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MinddyLogo } from "@/components/minddy-logo";
import { normalizeDesktopServerOrigin } from "@/lib/desktop/server-origin";
import { getMobileBridge, type MobileShellPlugin, type MobileShellState } from "@/lib/mobile/bridge";
import { keyboardFrameStyle, useKeyboardFrame } from "@/lib/mobile/use-keyboard-frame";
import { cn } from "@/lib/utils";

/**
 * The pages bundled in the mobile app (MIN-907): the server choice and the
 * screen shown when the selected server cannot be reached. Built with the
 * product's components and catalogs by `scripts/build-mobile.mjs` and served
 * by the shell from the app itself, so both work without a network. Every
 * action goes through the shell's `MinddyShell` plugin. No Next.js API here:
 * these pages run without the Next runtime.
 */

export type MobileShellScreen = "server" | "offline";

/** One staggered entrance, the landing's blur and fade (`hero-reveal`). */
function Enter({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn("hero-reveal", className)} style={{ "--hero-d": index * 0.07 } as CSSProperties}>
      {children}
    </div>
  );
}

function Frame({ centered = false, children }: { centered?: boolean; children: ReactNode }) {
  // The column fits the part of the screen the keyboard leaves, so the field
  // and its buttons rise above the keyboard together.
  const keyboard = useKeyboardFrame();
  return (
    <main
      style={keyboardFrameStyle(keyboard)}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      {!centered && <MinddyLogo className="h-7 self-start" />}
      <div className={cn("flex flex-1 flex-col justify-center py-10", centered && "items-center text-center")}>
        {centered && (
          <Enter index={0}>
            <MinddyLogo className="mb-6 h-9" />
          </Enter>
        )}
        {children}
      </div>
    </main>
  );
}

function Heading({ title, lead }: { title: string; lead?: string }) {
  return (
    <>
      <Enter index={0}>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      </Enter>
      {lead ? (
        <Enter index={1}>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{lead}</p>
        </Enter>
      ) : null}
    </>
  );
}

function ServerChoice({ shell, state }: { shell: MobileShellPlugin; state: MobileShellState | null }) {
  const t = useTranslations("MobileShell");
  const td = useTranslations("DesktopWelcome");
  const [address, setAddress] = useState("");
  const [invalid, setInvalid] = useState(false);
  // One request at a time; the ref answers before React commits the state.
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (state?.isCustomServer) setAddress(state.origin);
  }, [state]);

  const run = async (action: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const connect = () =>
    run(async () => {
      setInvalid(false);
      let origin: string;
      try {
        // An address typed without a scheme means HTTPS.
        origin = normalizeDesktopServerOrigin(/^[a-z][a-z0-9+.-]*:\/\//i.test(address.trim()) ? address : `https://${address.trim()}`);
      } catch {
        setInvalid(true);
        return;
      }
      // The shell validates again before it stores anything.
      const result = await shell.connect({ origin }).catch(() => ({ error: "serverInvalid" as const }));
      if (result.error) setInvalid(true);
    });

  return (
    <Frame centered>
      <Heading title={t("serverHeading")} />
      <Enter index={1} className="w-full">
        <form
          className="mt-8 flex w-full flex-col gap-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <label htmlFor="server-address" className="sr-only">
            {td("serverLabel")}
          </label>
          <Input
            id="server-address"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder={td("serverLabel")}
            className="h-12 bg-control text-base"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-invalid={invalid}
            aria-describedby="server-message"
          />
          {invalid ? (
            <p id="server-message" role="alert" className="text-xs text-destructive">
              {td("serverInvalid")}
            </p>
          ) : null}
          {/* The three ways out, stacked: connect, minddy Cloud, back. */}
          <Button type="submit" disabled={pending} className="h-12 w-full rounded-full">
            {td("connect")}
          </Button>
          {state?.isCustomServer ? (
            <Button type="button" variant="outline" className="h-12 w-full rounded-full" disabled={pending} onClick={() => void run(() => shell.useCloud())}>
              {td("useCloud")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="h-12 w-full rounded-full" disabled={pending} onClick={() => void run(() => shell.reload())}>
            {td("back")}
          </Button>
        </form>
      </Enter>
    </Frame>
  );
}

function Offline({ shell, state }: { shell: MobileShellPlugin; state: MobileShellState | null }) {
  const t = useTranslations("MobileShell");
  const tu = useTranslations("ServerUnavailable");
  // A device without a network says so; otherwise the server is the one that
  // does not answer.
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    // Coming back online is the retry the reader was waiting for.
    const reconnect = () => {
      update();
      void shell.reload();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", update);
    };
  }, [shell]);

  return (
    <Frame>
      <Heading
        title={online ? tu("title") : t("offlineTitle")}
        lead={online ? tu("description") : t("offlineBody")}
      />
      {online && state ? (
        <Enter index={2}>
          <p className="mt-4 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">{state.origin}</p>
        </Enter>
      ) : null}
      <Enter index={3}>
        <div className="mt-8 flex flex-col gap-1">
          <Button className="h-11 rounded-full" onClick={() => void shell.reload()}>
            {tu("retry")}
          </Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={() => void shell.openServerPicker()}>
            {t("changeServer")}
          </Button>
        </div>
      </Enter>
    </Frame>
  );
}

export function MobileShell({ screen }: { screen: MobileShellScreen }) {
  const [shell, setShell] = useState<MobileShellPlugin | null>(null);
  const [state, setState] = useState<MobileShellState | null>(null);

  useEffect(() => {
    const plugin = getMobileBridge()?.shell ?? null;
    setShell(plugin);
    void plugin?.state().then(setState, () => {});
  }, []);

  // Served only inside the mobile app, whose shell always brings the plugin.
  if (!shell) return null;
  return screen === "offline" ? <Offline shell={shell} state={state} /> : <ServerChoice shell={shell} state={state} />;
}
