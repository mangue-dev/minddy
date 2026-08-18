"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Spinner,
  toast,
} from "mangue-ui";
import { Download, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * Account settings → “Personal data” (MIN-119).
 *
 * The two rights that the GDPR wants to be exercised without writing to anyone: take away
 * your data (art. 15 and 20) and delete your account (art. 17) the blind man. Entering the address is
 * the last detent.
 */

interface DeletionPreview {
  ownedProjects: Array<{ id: string; name: string; memberCount: number }>;
  issueCount: number;
  affectedMemberCount: number;
  commentCount: number;
  hasActiveSubscription: boolean;
}

export function AccountDataSection() {
  const t = useTranslations("AccountData");
  const tc = useTranslations("Common");
  const { user, signOut } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const email = user?.email ?? "";
  /**
 * Can the account produce a password? (MIN-345) The server asks again for
 * proof before deleting: the password when there is one, a
 * recent connection otherwise. The screen should ask the same thing, otherwise it
 * sends an incomplete body and gets a 403 that no one understands.
 */
  const providers = user?.app_metadata?.providers;
  const hasPassword = Array.isArray(providers)
    ? providers.includes("email")
    : user?.app_metadata?.provider === "email";

  // The preview is loaded during editing, not when opening the dialog: that's what
  // that we want to read BEFORE clicking, not after.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account/deletion-preview");
        if (!response.ok) return;
        const data = (await response.json()) as DeletionPreview;
        if (!cancelled) setPreview(data);
      } catch {
        // Silent: the preview enriches the screen, its absence does not break it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/account/export");
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("genericError"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `minddy-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(t("exportDoneToast"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: confirmEmail.trim(),
          ...(hasPassword ? { password: confirmPassword } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("genericError"));
      }
      // The account no longer exists: the pending session must leave with it,
      // otherwise the next page turns to a token which does not designate anyone.
      await signOut();
      window.location.href = "/";
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  };

  const ownedCount = preview?.ownedProjects.length ?? 0;
  const canDelete =
    confirmEmail.trim().toLowerCase() === email.toLowerCase() &&
    !!email &&
    (!hasPassword || confirmPassword.length > 0);

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountDataExport}
        icon={Download}
        title={t("exportTitle")}
        description={t("exportDesc")}
      >
        <SettingsRow
          label={t("exportButton")}
          hint={t("exportHint")}
          control={
            <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
              {exporting ? <Spinner /> : <Download className="size-4" />}
              {t("exportButton")}
            </Button>
          }
        />
      </SettingsGroup>

      {/* The card bears the tone: the destructive insert it contained drew
 a second red border inside the first. */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountDataDelete}
        icon={Trash2}
        tone="destructive"
        title={t("deleteTitle")}
        description={t("deleteDesc")}
      >
        <SettingsRow
          label={t("deleteWhatTitle")}
          control={
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmEmail("");
                setConfirmPassword("");
                setConfirmOpen(true);
              }}
            >
              {t("deleteButton")}
            </Button>
          }
        >
          {preview ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>{t("deleteWhatAccount")}</li>
              {ownedCount > 0 && (
                <li>
                  {t("deleteWhatProjects", {
                    count: ownedCount,
                    issues: preview.issueCount,
                  })}
                </li>
              )}
              {preview.affectedMemberCount > 0 && (
                <li>{t("deleteWhatMembers", { count: preview.affectedMemberCount })}</li>
              )}
              {preview.commentCount > 0 && (
                <li>{t("deleteWhatComments", { count: preview.commentCount })}</li>
              )}
              {preview.hasActiveSubscription && <li>{t("deleteWhatSubscription")}</li>}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{tc("loading")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("deleteExportFirst")}</p>
        </SettingsRow>
      </SettingsGroup>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {ownedCount > 0
                ? t("confirmDescriptionWithProjects", { count: ownedCount })
                : t("confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="delete-confirm-email" className="text-sm font-medium">
              {t("confirmLabel", { email })}
            </label>
            <Input
              id="delete-confirm-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={email}
            />
          </div>

          {hasPassword ? (
            <div className="space-y-1.5">
              <label htmlFor="delete-confirm-password" className="text-sm font-medium">
                {t("confirmPasswordLabel")}
              </label>
              <Input
                id="delete-confirm-password"
                type="password"
                autoComplete="current-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("confirmPasswordPlaceholder")}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("confirmRecentSignInHint")}</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!canDelete || deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting && <Spinner />}
              {t("confirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
