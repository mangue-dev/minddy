import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Pages légales (mentions, CGU, confidentialité, cookies) — accessibles sans
 * compte, d'où leur présence dans PUBLIC_ROUTES du proxy. Elles partagent le
 * chrome du site public depuis MIN-73 : même navigation, même pied de page (dont
 * la colonne « Légal » qui remplace l'ancienne navigation croisée). Seule la
 * colonne de texte leur est propre.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MarketingNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-10">{children}</main>
      <MarketingFooter />
    </div>
  );
}
