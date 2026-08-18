"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, CardContent, Spinner } from "mangue-ui";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { consumeDesktopAuthTurn } from "@/lib/desktop/auth-turn";
import type { DesktopAuthLink } from "@/lib/desktop/auth-link";

/**
 * The return of the authentication trick in the desktop app (MIN-291).
 *
 * Mounted in the shell of the auth screens, and there only: it is the only
 * where the app is when it is waiting for a deep link. One session already
 * open has nothing to exchange — a magic link clicked when we are already
 * connected therefore does nothing, which is the correct behavior.
 *
 * ## What decides whether to process a link or not (MIN-345)
 *
 * macOS delivers EVERYTHING that carries our schema to the app, wherever it comes from. A
 * `minddy://auth?code=…` received from the system is perfectly readable, and the
 * window exchanged it — that is to say, connected to the account of who had
 * sent the link. Three cases now:
 *
 * - **A code which reports the nonce of the turn** (`turn`): this is the response to a
 * ask to leave here, we move on without asking anything. The normal case.
 * - **A code without a nonce, or with the wrong one**: ignored, silently. There is no
 * nothing true to say to someone who has done nothing, and the exchange would fail
 * anyway — the PKCE checker of this storage is wrong with this code.
 * - **An email link token**: it will NEVER carry a nonce (the template
 * GoTrue composes the URL, and the email often opens on another device).
 * This one is confirmed by hand, here, before any session is born.
 *
 * ## Why a full reload rather than client navigation
 *
 * The link can arrive BEFORE React is mounted (macOS launches the app with its
 * `open-url` in pocket; the bridge replays it upon subscription). A reload resets
 * the entire app — including the server components, and the proxy with them — on the
 * session which has just been born, without us having to reason about what had already
 * been returned with the old one. It's a connection: one more load is no more
 * costs nothing, and it removes a whole class of intermediate states.
 *
 * The failure returns to `/login?error=…` with the codes already in place: the same
 * sentences as the web for the same refusals, no more translation.
 */
export function DesktopAuthBridge() {
  const t = useTranslations("Auth");
  const { completeDesktopSignIn } = useAuth();
  const [exchanging, setExchanging] = useState(false);
  /** The email link waiting for a gesture. */
  const [pending, setPending] = useState<DesktopAuthLink | null>(null);

  const exchange = useCallback(
    (link: DesktopAuthLink) => {
      setPending(null);
      setExchanging(true);
      void (async () => {
        try {
          const next = await completeDesktopSignIn(link);
          window.location.replace(next);
        } catch (err) {
          console.error("[desktop] connexion par deep link échouée:", err);
          const code = link.kind === "error" ? link.error : "auth_callback_failed";
          const reason = link.kind === "error" ? link.reason : "exchange_failed";
          window.location.replace(
            `/login?error=${encodeURIComponent(code)}&reason=${encodeURIComponent(reason)}`
          );
        }
      })();
    },
    [completeDesktopSignIn]
  );

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    return bridge.onAuthLink((link) => {
      if (link.kind === "otp") {
        setPending(link);
        return;
      }
      if (link.kind === "code" && !consumeDesktopAuthTurn(link.turn)) {
        console.warn("[desktop] deep link ignoré : aucun tour d'authentification en cours");
        return;
      }
      exchange(link);
    });
  }, [exchange]);

  if (exchanging) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-2xl">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <ShieldCheck
            className="size-10 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {t("confirmSignInTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("confirmSignInBody")}</p>
          </div>
          <Button
            className="h-10 w-full justify-center"
            onClick={() => exchange(pending)}
          >
            {t("confirmSignInCta")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
