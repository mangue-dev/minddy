import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Site public (MIN-73) : landing et tarifs. Chrome partagé avec les pages
 * légales, qui rendent les deux mêmes composants depuis leur propre layout.
 * `pt-20` compense la pastille de navigation, posée en sticky au-dessus du flux.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
