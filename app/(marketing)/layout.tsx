import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { DesktopMarketingRedirect } from "@/components/desktop-marketing-redirect";

/**
 * Site public (MIN-73) : landing et tarifs. Chrome partagé avec les pages
 * légales, qui rendent les deux mêmes composants depuis leur propre layout.
 * `pt-20` compense la pastille de navigation, posée en sticky au-dessus du flux.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // `relative isolate` : bloc conteneur ET contexte d'empilement pour les
    // fonds de page. La landing y ancre son shader en `-z-10` pour qu'il parte
    // du haut du document — donc DERRIÈRE la navbar, qui est transparente hors
    // de sa pastille. Sans ça, le fond démarrerait sous les 80 px réservés à la
    // barre et laisserait une couture horizontale en travers de la page.
    <div className="relative isolate flex min-h-[100dvh] flex-col bg-background">
      {/* Dans l'app de bureau, le site public n'a rien à dire : on repart vers
          l'app, qui renverra vers la connexion si besoin (MIN-291). */}
      <DesktopMarketingRedirect />
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
