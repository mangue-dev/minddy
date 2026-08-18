import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui/lib/utils";
import { ScreenshotSlot } from "./screenshot-slot";

/**
 * The desktop app, staged (MIN-292).
 *
 * **Three rules, and the first explains the other two.**
 *
 * 1. **Nothing wrong.** No macOS window frame drawn around the
 * capture: minddy does NOT have a title bar — the traffic lights
 * lives in the sidebar brand line (framing §2). A
 * generic chrome placed on top of a web capture would lie about the only
 * thing that this page has to show, and would overwrite the logo which occupies
 * precisely this corner.
 * 2. **What we add is what the app really does.** The banner of
 * notification and the encrypted patch of the dock are not part of the decor: they are
 * the only two things that the app brings and that a capture cannot
 * contain, since they live OUTSIDE the window. Drawing them is the only honest way to show them.
 * 3. **It's overflowing.** Both objects go out of scope of the capture, top right and bottom left: this is what says "out of browser" without writing it, and what prevents the composition from being a capture more
 * centered in a box.
 *
 * Under `sm`, overflows fit: a banner that extends by 40 px on
 * a 390 px screen would scroll the page sideways.
 */
export async function DesktopShowcase({ className }: { className?: string }) {
  const t = await getTranslations("Download");

  return (
    <div className={cn("relative", className)}>
      {/* Halo — it gives depth without adding an object. `blur-3xl` on
 a solid color of the accent color, under everything else. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-10 -z-10 rounded-[3rem] bg-primary/[0.07] blur-3xl"
      />

      <ScreenshotSlot id="heroBoard" priority />

      {/* The native banner, top right. This is the shape of a
 macOS notification: square icon with very rounded corners, title in bold
, body on two lines at most. */}
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

      {/* The dock icon and its button, bottom left. The icon is the REAL
 (the one used to make the .icns), and the dot is a real
 unread counter — not a decorative “1”. */}
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
