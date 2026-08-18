"use client";

import { useTranslations } from "next-intl";
import { Button, Spinner } from "mangue-ui";
import { useAnalytics } from "@/lib/use-analytics";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";

/**
 * “Your API key” step of onboarding (MIN-149): the settings panel
 * of the account, as is — provider selector then key field — no longer the only one
 * thing that the step adds, its output.
 *
 * It is here because it is the central argument of the price: the subscription buys
 * minddy, the agent's inference can stay at home. A dev who codes with
 * agents all day already have a key; ask him later, in a
 * settings tab, it's never asking him.
 *
 * Passing and putting down your key take the same step — like the MCP step,
 * onboarding doesn't block anything. The step is also checked ONLY as soon as a
 * key exists (`resolveOnboardingState`): explicit acknowledgment is only used to
 * the one that passes.
 */
export function OnboardingKeyStep({
  onDone,
  onSkip,
  busy,
}: {
  onDone: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const t = useTranslations("Onboarding");
  const { track } = useAnalytics();

  return (
    <div className="flex w-full flex-col gap-3">
      <ByokConnectPanel
        className="max-w-none"
        onConnected={() => {
          // How many accounts arrive with their key — the data that says if the
          // BYOK is indeed the argument we believe (MIN-149).
          track("onboarding_ai_key_added");
          onDone();
        }}
      />

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={busy}
          className="h-auto bg-transparent px-0 py-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
        >
          {busy && <Spinner />}
          {t("keySkipCta")}
        </Button>
      </div>
    </div>
  );
}
