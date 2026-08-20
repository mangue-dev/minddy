import { getTranslations } from "next-intl/server";
import { KeyRound, Layers, Lock } from "lucide-react";
import { AGENT_PROVIDERS } from "@/lib/agent-providers";

/**
 * “Your key, your inference” — the central argument of the pricing page
 * (MIN-149).
 *
 * It was buried in the last question of the FAQ, formulated as a concession
 * (“yes, you can use your own key”). For the target — a dev who codes
 * with agents all day and who ALREADY has a key — it's the title:
 * subscription buys minddy, the agent's inference can stay at home. Said
 * here, he also removes from the page the conversation "so many euros for so many
 * usage dollars included", and decouples the margin from the price of the models.
 *
 * WHAT NOT TO MAKE HIM SAY. The BYOK only covers the loop of
 * the code agent — `resolveAgentApiKey` (lib/server/agent/model.ts) is
 * only called by `execute.ts`. Numo in the app, the PR review, the dictation and the
 * feedback run on the platform key and are deducted from the usage included.
 * The key removes the agent's plan and model limits. These reservations fit in
 * the footnote of the section and remain there as long as the code does not change.
 *
 * The providers come from the registry (`AGENT_PROVIDERS`), like the wizard des
 * settings: adding one makes it appear here. The generic is left out of the
 * list (`requiresBaseUrl`) — it's not a brand, it's said in prose.
 *
 * No logos: `ProviderLogo` is a client component that pulls
 * `@lobehub/icons`, and this page is public.
 */

const POINTS = [
  { key: "uncapped", icon: KeyRound },
  { key: "catalog", icon: Layers },
  { key: "safe", icon: Lock },
] as const;

export async function SectionByok() {
  const t = await getTranslations("Pricing");
  const providers = AGENT_PROVIDERS.filter((provider) => !provider.requiresBaseUrl);

  return (
    <section id="byok" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <header className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("byokTitle")}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {t("byokSubtitle")}
          </p>
        </header>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <ul className="flex flex-wrap justify-center gap-2">
            {providers.map((provider) => (
              <li
                key={provider.id}
                className="rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-sm font-medium text-foreground/90"
              >
                {provider.label}
              </li>
            ))}
            <li className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted-foreground">
              {t("byokGeneric")}
            </li>
          </ul>

          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.key} className="flex flex-col gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <h3 className="font-medium">{t(`byok_${point.key}_title`)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`byok_${point.key}_body`)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The two reservations, under the frame and not inside: they limit
 the argument, they do not carry it. */}
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          {t("byokNote")}
        </p>
      </div>
    </section>
  );
}
