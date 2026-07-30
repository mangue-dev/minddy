"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import { useAuth } from "@/lib/auth-context";

/**
 * L'étape de challenge de la connexion (MIN-132). Elle prend la place du
 * formulaire dès que la session existe mais qu'elle est restée en `aal1` — après
 * un mot de passe accepté, ou au retour de Google / GitHub, le proxy renvoyant
 * alors ici.
 *
 * Le deuxième chemin, « je n'ai plus mon téléphone », est le seul filet du
 * produit : pas d'équipe support derrière, donc un code de récupération DÉSACTIVE
 * la 2FA au lieu de la contourner le temps d'une session. L'écran le dit avant
 * qu'on s'en serve, pas après.
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

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(factorId, code.trim());
      onVerified();
    } catch (err) {
      setError((err as Error).message);
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
        <form onSubmit={submitCode} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mfa-code" className="text-sm font-medium">
              {t("mfaCodeLabel")}
            </label>
            <Input
              id="mfa-code"
              className="h-10 bg-card font-mono tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
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
              maxLength={9}
              placeholder="XXXX-XXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            variant="destructive"
            disabled={busy || recoveryCode.trim().length < 8}
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
