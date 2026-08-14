"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { RECOVERY_CODE_LENGTH, mfaVerifyErrorKey } from "@/lib/mfa";
import { OtpInput } from "@/components/otp-input";

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

  const submitCode = async (submitted: string) => {
    if (!factorId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(factorId, submitted.trim());
      onVerified();
    } catch (err) {
      // Jamais le message de GoTrue : il est en anglais et en jargon.
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
              // Six chiffres saisis (ou collés, ou remplis par le gestionnaire
              // de mots de passe) = intention de valider. Attendre un clic de
              // plus n'apporte rien : il n'y a pas d'autre champ à remplir.
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
