import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui/lib/utils";
import { ScreenshotSlot } from "./screenshot-slot";

/**
 * L'app de bureau, mise en scène (MIN-292).
 *
 * **Trois règles, et la première explique les deux autres.**
 *
 * 1. **Rien de faux.** Pas de cadre de fenêtre macOS dessiné autour de la
 *    capture : minddy n'a PAS de barre de titre — les feux de circulation
 *    vivent dans la ligne de marque de la barre latérale (§2 du cadrage). Un
 *    chrome générique posé par-dessus une capture web mentirait sur la seule
 *    chose que cette page a à montrer, et écraserait le logo qui occupe
 *    précisément ce coin.
 * 2. **Ce qu'on ajoute est ce que l'app fait vraiment.** La bannière de
 *    notification et la pastille chiffrée du dock ne sont pas du décor : ce sont
 *    les deux seules choses que l'app apporte et qu'une capture ne peut pas
 *    contenir, puisqu'elles vivent HORS de la fenêtre. Les dessiner est la seule
 *    façon honnête de les montrer.
 * 3. **Ça déborde.** Les deux objets sortent du cadre de la capture, en haut à
 *    droite et en bas à gauche : c'est ce qui dit « hors du navigateur » sans
 *    l'écrire, et ce qui empêche la composition d'être une capture de plus
 *    centrée dans une boîte.
 *
 * Sous `sm`, les débordements rentrent : une bannière qui dépasse de 40 px sur
 * un écran de 390 px ferait défiler la page latéralement.
 */
export async function DesktopShowcase({ className }: { className?: string }) {
  const t = await getTranslations("Download");

  return (
    <div className={cn("relative", className)}>
      {/* Halo — il donne de la profondeur sans ajouter d'objet. `blur-3xl` sur
          un aplat de la couleur d'accent, sous tout le reste. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-10 -z-10 rounded-[3rem] bg-primary/[0.07] blur-3xl"
      />

      <ScreenshotSlot id="heroBoard" priority />

      {/* La bannière native, en haut à droite. C'est la forme d'une
          notification macOS : icône carrée à coins très arrondis, titre en
          gras, corps sur deux lignes au plus. */}
      <div className="pointer-events-none absolute -top-7 -right-2 hidden w-[19rem] sm:block lg:-top-9 lg:-right-10">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-xl ring-1 ring-black/[0.04] backdrop-blur-md dark:ring-white/[0.06]">
          <Image
            src="/web-app-manifest-192x192.png"
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-[0.6rem]"
          />
          <div className="min-w-0">
            <p className="text-[0.8rem] leading-tight font-semibold">
              {t("previewNotifTitle")}
            </p>
            <p className="mt-0.5 text-[0.8rem] leading-snug text-muted-foreground">
              {t("previewNotifBody")}
            </p>
          </div>
        </div>
      </div>

      {/* L'icône du dock et sa pastille, en bas à gauche. L'icône est la VRAIE
          (celle qui a servi à fabriquer le .icns), et la pastille est un vrai
          compteur de non-lus — pas un « 1 » décoratif. */}
      <div className="pointer-events-none absolute -bottom-9 -left-4 hidden sm:block lg:-bottom-10 lg:-left-12">
        <div className="relative">
          <Image
            src="/web-app-manifest-192x192.png"
            alt=""
            width={72}
            height={72}
            className="size-[4.5rem] rounded-[1.15rem] shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
          />
          <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#ff453a] px-1.5 text-xs font-semibold text-white shadow-md ring-2 ring-background">
            3
          </span>
        </div>
      </div>
    </div>
  );
}
