"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import { DesktopAuthBridge } from "@/components/desktop-auth-bridge";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Login/signup possèdent leur propre mise en page pleine hauteur à deux
  // colonnes ; les écrans OAuth (consentement / succès) sont de simples cartes
  // centrées.
  const fullBleed = pathname === "/login" || pathname === "/signup";

  return (
    <AuthProvider>
      {/* Le retour du navigateur système, dans l'app de bureau (MIN-291). Ne
          rend rien hors de l'app, et rien tant qu'aucun lien n'arrive. */}
      <DesktopAuthBridge />
      {/* La bande de déplacement de la fenêtre ne vit plus ici : elle est dans
          le layout racine, donc sur TOUS les écrans (MIN-292). Ces écrans-là
          n'étaient qu'un des cinq qui en manquaient. */}
      {fullBleed ? (
        <div className="auth-shell min-h-[100dvh] bg-background">{children}</div>
      ) : (
        <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-background p-6">
          {children}
        </div>
      )}
    </AuthProvider>
  );
}
