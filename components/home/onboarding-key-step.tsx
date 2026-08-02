"use client";

import { useTranslations } from "next-intl";
import { Button, Spinner } from "mangue-ui";
import { useAnalytics } from "@/lib/use-analytics";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";

/**
 * Étape « votre clé d'API » de l'onboarding (MIN-149) : le panneau des réglages
 * du compte, tel quel — sélecteur de provider puis champ de clé — plus la seule
 * chose que l'étape ajoute, sa sortie.
 *
 * Elle est ici parce que c'est l'argument central du prix : l'abonnement achète
 * minddy, l'inférence de l'agent peut rester chez soi. Un dev qui code avec des
 * agents toute la journée a déjà une clé ; la lui demander plus tard, dans un
 * onglet de réglages, c'est la lui demander jamais.
 *
 * Passer et poser sa clé franchissent la même étape — comme l'étape MCP,
 * l'onboarding ne bloque sur rien. L'étape se coche d'ailleurs SEULE dès qu'une
 * clé existe (`resolveOnboardingState`) : l'acquittement explicite ne sert qu'à
 * celui qui passe.
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
          // Combien de comptes arrivent avec leur clé — la donnée qui dit si le
          // BYOK est bien l'argument qu'on croit (MIN-149).
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
