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
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Public board identity gate (MIN-37): email verification by OTP code
 * in two steps. Never anonymous — but contributions remain
 * pseudonyms on the public side. After verification, onAuthed() replays the action that
 * the user had engaged (vote, post).
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
  const { appUrl } = useRuntimeConfig();
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
            <>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                autoComplete="email"
                autoFocus
                required
              />
              {/* Mention of information at the point of collection (GDPR art. 13,
 MIN-119). The URL is absolute: a board can be served from
 its publisher's custom domain, where `/privacy` leads
 nowhere. */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t.rich("authLegalNotice", {
                  privacy: (chunks) => (
                    <a
                      href={`${appUrl}/privacy`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </>
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

          {/* The error code comes from the server response: key assembled at
 execution. */}
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
