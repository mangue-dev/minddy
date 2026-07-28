"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "mangue-ui";
import { MailCheck } from "lucide-react";
import { requestOtpAction, verifyOtpAction } from "./actions";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Porte d'identité du board public (MIN-37) : vérification email par code OTP
 * en deux étapes. Jamais d'anonyme — mais les contributions restent
 * pseudonymes côté public. Après vérification, onAuthed() rejoue l'action que
 * l'utilisateur avait engagée (vote, post).
 */
export function FeedbackAuthDialog({
  token,
  open,
  onOpenChange,
  onAuthed,
}: {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthed?: () => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = (next: boolean) => {
    if (!next) {
      setStep("email");
      setCode("");
      setError(null);
    }
    onOpenChange(next);
  };

  const sendCode = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestOtpAction(token, email);
        if (!result?.ok) {
          setError(result ? result.error : "sendFailed");
          return;
        }
        setEmail(result.email);
        setStep("code");
      } catch {
        setError("sendFailed");
      }
    });
  };

  const verify = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await verifyOtpAction(token, email, code);
        if (!result?.ok) {
          setError(result ? result.error : "invalidCode");
          return;
        }
        close(false);
        onAuthed?.();
        router.refresh();
      } catch {
        setError("failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "email") sendCode();
            else verify();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailCheck className="size-4 text-brand" />
              {t("authTitle")}
            </DialogTitle>
            <DialogDescription>
              {step === "email" ? t("authIntro") : t("authCodeIntro", { email })}
            </DialogDescription>
          </DialogHeader>

          {step === "email" ? (
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
              autoFocus
              required
            />
          ) : (
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("codePlaceholder")}
              autoComplete="one-time-code"
              autoFocus
              required
            />
          )}

          {/* Le code d'erreur vient de la réponse serveur : clé assemblée à
              l'exécution. */}
          {error && (
            <p className="text-sm text-destructive">
              {t(`errors.${error}` as MessageKey<"PublicFeedback">)}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            {step === "code" ? (
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("changeEmail")}
              </button>
            ) : (
              <span />
            )}
            <Button
              type="submit"
              disabled={pending || (step === "email" ? !email.trim() : code.length !== 6)}
            >
              {pending && <Spinner />}
              {step === "email" ? t("sendCode") : t("verify")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
