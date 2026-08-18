"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { RECOVERY_CODE_LENGTH, mfaVerifyErrorKey } from "@/lib/mfa";
import { OtpInput } from "@/components/otp-input";

/**
 * The connection challenge stage (MIN-132). She takes the place of
 * form as soon as the session exists but remains in `aal1` — after
 * an accepted password, or upon return from Google / GitHub, the proxy returning
 * so here.
 *
 * The second path, "I no longer have my phone", is the only net of
 * product: no support team behind it, so a DISABLED recovery code
 * 2FA instead of bypassing it for the duration of a session. The screen says it before
 * let's use it, not afterwards.
 */
export function MfaChallenge({
  onVerified,
  onRecovered,
}: {
  onVerified: () => void;
  onRecovered: () => void;
}) {
  const t = useTranslations("Auth");
  const { firstTotpFactorId, verifyTotp, signOut } = useAuth();

  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = await firstTotpFactorId();
        if (!cancelled) setFactorId(id);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstTotpFactorId]);

  const submitCode = async (submitted: string) => {
    if (!factorId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(factorId, submitted.trim());
      onVerified();
    } catch (err) {
      // Never the GoTrue message: it is in English and in jargon.
      setError(t(mfaVerifyErrorKey(err)));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const submitRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/mfa/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: recoveryCode.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("mfaGenericError"));
      }
      onRecovered();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[380px] space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {mode === "totp" ? t("mfaTitle") : t("mfaRecoveryTitle")}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {mode === "totp" ? t("mfaSubtitle") : t("mfaRecoverySubtitle")}
        </p>
      </div>

      {mode === "totp" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode(code);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="mfa-code" className="block text-sm font-medium">
              {t("mfaCodeLabel")}
            </label>
            <OtpInput
              id="mfa-code"
              value={code}
              onChange={setCode}
              disabled={busy}
              autoFocus
              aria-label={t("mfaCodeLabel")}
              // Six digits entered (or pasted, or filled in by the manager
              // password entry) = intent to validate. Wait for a click from
              // more adds nothing: there is no other field to fill in.
              onComplete={(value) => void submitCode(value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={busy || code.length !== 6 || !factorId}
            className="h-10 w-full justify-center gap-2"
          >
            {busy && <Spinner />}
            {t("mfaVerify")}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitRecovery} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mfa-recovery-code" className="text-sm font-medium">
              {t("mfaRecoveryLabel")}
            </label>
            <Input
              id="mfa-recovery-code"
              className="h-10 bg-card font-mono uppercase tracking-widest"
              autoComplete="off"
              autoFocus
              maxLength={14}
              placeholder="XXXX-XXXX-XXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            variant="destructive"
            disabled={busy || recoveryCode.trim().length < RECOVERY_CODE_LENGTH}
            className="h-10 w-full justify-center gap-2"
          >
            {busy && <Spinner />}
            {t("mfaRecoverySubmit")}
          </Button>
        </form>
      )}

      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(mode === "totp" ? "recovery" : "totp");
              setError(null);
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
          >
            {mode === "totp" ? t("mfaLostDevice") : t("mfaBackToCode")}
          </button>
        </p>
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            className="underline-offset-4 hover:underline disabled:opacity-60"
          >
            {t("mfaUseAnotherAccount")}
          </button>
        </p>
      </div>
    </div>
  );
}
