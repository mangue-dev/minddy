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
 * Réglages du compte → « Données personnelles » (MIN-119).
 *
 * Les deux droits que le RGPD veut exerçables sans écrire à personne : emporter
 * ses données (art. 15 et 20) et effacer son compte (art. 17).
 *
 * L'écran de suppression affiche d'abord ce qui va disparaître — projets
 * possédés, tickets, membres qui perdent leur accès — parce que la cascade est
 * plus large que ce que « supprimer mon compte » laisse imaginer, et qu'un
 * effacement irréversible ne se confirme à l'aveugle. La saisie de l'adresse est
 * le dernier cran d'arrêt.
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
  const [deleting, setDeleting] = useState(false);

  const email = user?.email ?? "";

  // L'aperçu est chargé au montage, pas à l'ouverture du dialogue : c'est ce
  // qu'on veut lire AVANT de cliquer, pas après.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account/deletion-preview");
        if (!response.ok) return;
        const data = (await response.json()) as DeletionPreview;
        if (!cancelled) setPreview(data);
      } catch {
        // Silencieux : l'aperçu enrichit l'écran, son absence ne le casse pas.
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
        body: JSON.stringify({ confirm: confirmEmail.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("genericError"));
      }
      // Le compte n'existe plus : la session pendante doit partir avec lui,
      // sinon la page suivante tourne sur un jeton qui ne désigne personne.
      await signOut();
      window.location.href = "/";
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  };

  const ownedCount = preview?.ownedProjects.length ?? 0;
  const canDelete = confirmEmail.trim().toLowerCase() === email.toLowerCase() && !!email;

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

      {/* La carte porte le ton : l'encart destructif qu'elle contenait dessinait
          une seconde bordure rouge à l'intérieur de la première. */}
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
