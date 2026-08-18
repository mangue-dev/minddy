"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Checkbox,
  Spinner,
  toast,
} from "mangue-ui";
import { Check, Copy, Download, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SettingsGroup, SettingsEmpty } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { mfaStatusQueryKey, useMfaStatusQuery } from "@/lib/use-mfa-status";
import { mfaVerifyErrorKey } from "@/lib/mfa";
import { OtpInput } from "@/components/otp-input";

/**
 * Account settings → “Second factor” (MIN-132).
 *
 * Optional, and available to everyone — including Google and GitHub accounts:
 * “signed in with Google” is only a second factor if the person has enabled it
 * at Google, which we cannot know from here. A note says it, the choice remains
 * to her.
 *
 * Enrollment is played against GoTrue from the browser (it is the verification
 * of the first code which mounts the session in `aal2`, and only the SDK knows how to do it);
 * `/api/account/mfa` then only does what the client cannot do:
 * place the flag that the JWT carries, and enter the recovery codes.
 *
 * The codes are only shown once, and the screen does not close by itself:
 * you must check “I wrote them down.” This is the only way back if the
 * phone disappears — there is no human support behind it.
 *
 * ## Why an insert and not one more setting
 *
 * Rendered like the other settings lines, this choice also read anodine
 * than a time zone. It is not: this account opens the related Git repositories
 * WRITING, via the code agent. As long as 2FA is inactive, the
 * section therefore carries an insert which says what is really at stake — and the
 * settings page places a sticker on the tab, so that the recommendation exists
 * also when you have not come to get it. Once activated, the insert is silent:
 * it notes, it does not congratulate.
 */

type Stage = "idle" | "enrolling" | "codes";

export function AccountSecuritySection() {
  const t = useTranslations("AccountSecurity");
  const tc = useTranslations("Common");
  const { user, enrollTotp, verifyTotp, unenrollTotp, refreshUser, signOutOtherSessions } =
    useAuth();
  const queryClient = useQueryClient();

  const { status } = useMfaStatusQuery();
  const [stage, setStage] = useState<Stage>("idle");
  const [busy, setBusy] = useState(false);

  // Enrollment in progress
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  // Freshly issued recovery codes (clear, only once)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const provider = (user?.app_metadata?.provider as string | undefined) ?? "email";
  const providerLabel = provider === "google" ? "Google" : provider === "github" ? "GitHub" : null;

  // The tab's pad reads the same cache: invalidating it updates both.
  const reloadStatus = () =>
    void queryClient.invalidateQueries({ queryKey: mfaStatusQueryKey });

  const startEnrollment = async () => {
    setBusy(true);
    setCodeError(null);
    try {
      // A dated name distinguishes the factors if one day several are authorized,
      // and makes the GoTrue screen readable in case of support.
      const enrolled = await enrollTotp(`minddy ${new Date().toISOString().slice(0, 10)}`);
      setFactorId(enrolled.factorId);
      setQrCode(enrolled.qrCode);
      setSecret(enrolled.secret);
      setCode("");
      setStage("enrolling");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrollment = async () => {
    const pending = factorId;
    setStage("idle");
    setFactorId(null);
    setQrCode("");
    setSecret("");
    setCode("");
    setCodeError(null);
    // An unverified factor counts for nothing, but leaving it lying around
    // would clutter the list on the next try.
    if (pending) await unenrollTotp(pending).catch(() => {});
  };

  const confirmEnrollment = async (submitted: string) => {
    if (!factorId || busy) return;
    setBusy(true);
    setCodeError(null);
    try {
      // Check the factor AND mount the session in aal2 — otherwise the call
      // following would be refused by the guardrail that we have just activated.
      await verifyTotp(factorId, submitted.trim());

      const response = await fetch("/api/account/mfa", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("genericError"));
      }
      const { recoveryCodes: codes } = (await response.json()) as { recoveryCodes: string[] };

      setRecoveryCodes(codes);
      setAcknowledged(false);
      setCopied(false);
      setStage("codes");
      setFactorId(null);
      setQrCode("");
      setSecret("");
      setCode("");

      // The current JWT does not yet carry the flag: refresh it now
      // prevents interspersed navigation from going back to the challenge screen.
      await refreshUser();
      // And cut off the other sessions, otherwise an already stolen token would remain good
      // until its own refreshment — which is exactly what we close.
      await signOutOtherSessions().catch(() => {});
      reloadStatus();
    } catch (e) {
      // GoTrue's raw message is English and technical — we only keep the
      // useful distinction (code refused / too many tries / the rest).
      setCodeError(t(mfaVerifyErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/account/mfa/recovery-codes", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("genericError"));
      }
      const { recoveryCodes: codes } = (await response.json()) as { recoveryCodes: string[] };
      setRecoveryCodes(codes);
      setAcknowledged(false);
      setCopied(false);
      setStage("codes");
      reloadStatus();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/account/mfa", { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("genericError"));
      }
      await refreshUser();
      setStage("idle");
      toast.success(t("disabledToast"));
      reloadStatus();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
      toast.success(t("codesCopiedToast"));
    } catch {
      toast.error(t("codesCopyFailed"));
    }
  };

  const downloadCodes = () => {
    const blob = new Blob([`${t("codesFileHeader")}\n\n${recoveryCodes.join("\n")}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "minddy-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCopied(true);
  };

  return (
    <>
      {/* `variant="block"`: The three states (recommendation, enrollment, codes)
 are a stack WIZARD, not key/value rows. The front-bordered
 inserts have lost their frame — they are IN the card, and the double-bordered
 was part of the noise. */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountSecurity}
        icon={Lock}
        title={t("title")}
        description={t("description")}
        variant="block"
      >
        {status === null ? (
          <SettingsEmpty className="py-0">{tc("loading")}</SettingsEmpty>
        ) : stage === "codes" ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("codesTitle")}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("codesDescription")}
              </p>
            </div>

            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-sm sm:grid-cols-2">
              {recoveryCodes.map((c) => (
                <li key={c} className="tabular-nums">
                  {c}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void copyCodes()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {t("copyCodes")}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadCodes}>
                <Download className="size-4" />
                {t("downloadCodes")}
              </Button>
            </div>

            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={acknowledged}
                onCheckedChange={(next) => setAcknowledged(next === true)}
              />
              <span>{t("codesAcknowledge")}</span>
            </label>

            <Button
              size="sm"
              disabled={!acknowledged}
              onClick={() => {
                setRecoveryCodes([]);
                setStage("idle");
              }}
            >
              {t("codesDone")}
            </Button>
          </div>
        ) : stage === "enrolling" ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("enrollScanTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("enrollScanHint")}</p>
              {qrCode && (
                // The QR is an inline SVG returned by GoTrue (data-uri): nothing to
                // load, and the white background is necessary in dark theme.
                <img
                  src={qrCode}
                  alt={t("enrollQrAlt")}
                  className="size-44 rounded-md bg-white p-2"
                />
              )}
              <p className="text-xs text-muted-foreground">
                {t("enrollManualKey")}{" "}
                <code className="select-all font-mono text-foreground">{secret}</code>
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="mfa-enroll-code" className="block text-sm font-medium">
                {t("enrollCodeLabel")}
              </label>
              <OtpInput
                id="mfa-enroll-code"
                value={code}
                onChange={setCode}
                disabled={busy}
                aria-label={t("enrollCodeLabel")}
                onComplete={(value) => void confirmEnrollment(value)}
              />
              {codeError && <p className="text-sm text-destructive">{codeError}</p>}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  disabled={busy || code.length !== 6}
                  onClick={() => void confirmEnrollment(code)}
                >
                  {busy && <Spinner />}
                  {t("enrollConfirm")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void cancelEnrollment()}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          </div>
        ) : status.enabled ? (
          /* Enabled: the same block, but silent. He notes the state and
 gives the two maintenance gestures — he does not congratulate anyone. */
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("enabledCardTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("recoveryCodesLeft", { count: status.unusedRecoveryCodes })}
              </p>
              {status.unusedRecoveryCodes === 0 && (
                <p className="text-xs text-destructive">{t("noRecoveryCodesLeft")}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setRegenerateOpen(true)}
              >
                {t("regenerateCodes")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setDisableOpen(true)}
              >
                {t("disableButton")}
              </Button>
            </div>
          </div>
        ) : (
          /* Inactive: the recommendation. The title names what is at stake —
 not the functionality, which is already written just above. */
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{t("recommendTitle")}</p>
                <Badge variant="secondary" className="border-brand/30 text-brand">
                  {t("recommendedBadge")}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("recommendBody")}
              </p>
              {providerLabel && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("oauthNote", { provider: providerLabel })}
                </p>
              )}
            </div>
            <Button size="sm" disabled={busy} onClick={() => void startEnrollment()}>
              {busy && <Spinner />}
              {t("enableButton")}
            </Button>
          </div>
        )}
      </SettingsGroup>

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disableConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("disableConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                setDisableOpen(false);
                void disable();
              }}
            >
              {t("disableButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("regenerateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("regenerateConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                setRegenerateOpen(false);
                void regenerate();
              }}
            >
              {t("regenerateCodes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
