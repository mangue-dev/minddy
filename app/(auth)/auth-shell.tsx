"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import { DesktopAuthBridge } from "@/components/desktop-auth-bridge";

/**
 * La coquille des écrans d'auth : un fond uni, et rien d'autre (MIN-300).
 *
 * Ce fond a une histoire, qui tient en une leçon. Il a été le shader « grain
 * gradient » de Paper sur la moitié gauche d'une page à deux colonnes ; puis,
 * la colonne disparue, des dégradés CSS teintés par intention ; puis le shader
 * de nouveau, en pleine page, puis en bande haute, avec une hauteur MESURÉE sur
 * le sommet du formulaire pour ne jamais le toucher.
 *
 * Chaque étape corrigeait bien le défaut de la précédente, et chacune ajoutait
 * une contrainte : ne pas passer sous le texte, ne pas déborder, se recalculer
 * quand la colonne grandit. Un décor qui demande un `ResizeObserver` pour ne pas
 * gêner ce qu'on est venu lire n'est plus un décor. Il est retiré.
 *
 * **Avant d'en remettre un** : c'est une page où l'on tape un mot de passe. Le
 * fond doit pouvoir rester immobile derrière un formulaire centré verticalement
 * dont la hauteur change à chaque étape — sans le masquer, et sans avoir à le
 * mesurer.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Connexion et inscription posent elles-mêmes leur colonne : la marque en
  // haut à gauche de la FENÊTRE, le contenu au centre. Les écrans OAuth
  // (consentement / succès) sont de simples cartes centrées.
  const fullBleed = pathname === "/login" || pathname === "/signup";

  return (
    <AuthProvider>
      {/* Le retour du navigateur système, dans l'app de bureau (MIN-291). Ne
          rend rien hors de l'app, et rien tant qu'aucun lien n'arrive. */}
      <DesktopAuthBridge />
      {/* La bande de déplacement de la fenêtre ne vit plus ici : elle est dans
          le layout racine, donc sur TOUS les écrans (MIN-292). Ces écrans-là
          n'étaient qu'un des cinq qui en manquaient. */}
      <div className="auth-shell min-h-[100dvh] bg-background">
        {fullBleed ? (
          children
        ) : (
          <div className="flex min-h-[100dvh] items-center justify-center p-6">
            {children}
          </div>
        )}
      </div>
    </AuthProvider>
  );
}
