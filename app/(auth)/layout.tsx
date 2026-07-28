import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { AuthShell } from "./auth-shell";

/**
 * Écrans d'authentification. Composant SERVEUR, comme celui de `(app)` : il ne
 * porte que le catalogue i18n complet — sans lui, `/login` atteinte depuis la
 * landing en navigation cliente n'aurait que les namespaces du site public et
 * afficherait le chemin de ses clés (MIN-100). La mise en page, qui dépend du
 * `usePathname`, vit dans `auth-shell.tsx`.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <FullCatalogMessages>
      <AuthShell>{children}</AuthShell>
    </FullCatalogMessages>
  );
}
