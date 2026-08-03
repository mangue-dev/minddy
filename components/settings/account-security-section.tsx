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
 * Réglages du compte → « Second facteur » (MIN-132).
 *
 * Facultatif, et proposé à tout le monde — comptes Google et GitHub compris :
 * « connecté avec Google » n'est un second facteur que si la personne l'a activé
 * chez Google, ce qu'on ne peut pas savoir d'ici. Une note le dit, le choix reste
 * à elle.
 *
 * L'enrôlement se joue contre GoTrue depuis le navigateur (c'est la vérification
 * du premier code qui monte la session en `aal2`, et seul le SDK sait la faire) ;
 * `/api/account/mfa` ne fait ensuite que ce que le client ne peut pas faire :
 * poser le drapeau que le JWT transporte, et frapper les codes de récupération.
 *
 * Les codes ne sont montrés qu'une fois, et l'écran ne se referme pas tout seul :
 * il faut cocher « je les ai notés ». C'est le seul chemin de retour si le
 * téléphone disparaît — il n'y a pas de support humain derrière.
 *
 * ## Pourquoi un encart et pas un réglage de plus
 *
 * Rendu comme les autres lignes de réglages, ce choix-là se lisait aussi anodin
 * qu'un fuseau horaire. Il ne l'est pas : ce compte ouvre les dépôts Git reliés
 * EN ÉCRITURE, via l'agent de code. Tant que la 2FA est inactive, la section
 * porte donc un encart qui dit ce qui est réellement en jeu — et la page de
 * réglages pose une pastille sur l'onglet, pour que la recommandation existe
 * aussi quand on n'est pas venu la chercher. Une fois activée, l'encart se tait :
 * il constate, il ne félicite pas.
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

  // Enrôlement en cours
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  // Codes de récupération fraîchement émis (clair, une seule fois)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const provider = (user?.app_metadata?.provider as string | undefined) ?? "email";
  const providerLabel = provider === "google" ? "Google" : provider === "github" ? "GitHub" : null;

  // La pastille de l'onglet lit le même cache : l'invalider met les deux à jour.
  const reloadStatus = () =>
    void queryClient.invalidateQueries({ queryKey: mfaStatusQueryKey });

  const startEnrollment = async () => {
    setBusy(true);
    setCodeError(null);
    try {
      // Un nom daté distingue les facteurs si un jour on en autorise plusieurs,
      // et rend l'écran de GoTrue lisible en cas de support.
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
    // Un facteur non vérifié ne compte pour rien, mais le laisser traîner
    // encombrerait la liste au prochain essai.
    if (pending) await unenrollTotp(pending).catch(() => {});
  };

  const confirmEnrollment = async (submitted: string) => {
    if (!factorId || busy) return;
    setBusy(true);
    setCodeError(null);
    try {
      // Vérifie le facteur ET monte la session en aal2 — sans quoi l'appel
      // suivant se ferait refuser par le garde-fou qu'on vient d'activer.
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

      // Le JWT courant ne porte pas encore le drapeau : le rafraîchir maintenant
      // évite qu'une navigation intercalée reparte vers l'écran de challenge.
      await refreshUser();
      // Et couper les autres sessions, sinon un jeton déjà volé resterait bon
      // jusqu'à son propre rafraîchissement — soit exactement ce qu'on ferme.
      await signOutOtherSessions().catch(() => {});
      reloadStatus();
    } catch (e) {
      // Le message brut de GoTrue est anglais et technique — on ne garde que la
      // distinction utile (code refusé / trop d'essais / le reste).
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
      {/* `variant="block"` : les trois états (recommandation, enrôlement, codes)
          sont un ASSISTANT en pile, pas des rangées clé/valeur. Les encarts
          bordés d'avant ont perdu leur cadre — ils sont DANS la carte, et la
          double bordure faisait partie du bruit. */}
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
                // Le QR est un SVG inline renvoyé par GoTrue (data-uri) : rien à
                // charger, et le fond blanc est nécessaire en thème sombre.
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
          /* Activée : le même bloc, mais qui se tait. Il constate l'état et
             donne les deux gestes d'entretien — il ne félicite personne. */
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
          /* Inactive : la recommandation. Le titre nomme ce qui est en jeu —
             pas la fonctionnalité, qui est déjà écrite juste au-dessus. */
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
