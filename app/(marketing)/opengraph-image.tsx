import { ImageResponse } from "next/og";
import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";

/**
 * Vignette de partage du site public (MIN-73) — ce qu'on voit quand un lien
 * minddy est collé dans Slack, X ou une conversation. Volontairement sobre :
 * la marque, la promesse, rien d'autre.
 *
 * Le texte est en anglais (la locale par défaut) : l'image est générée une fois
 * au build, elle ne peut pas suivre la langue du visiteur.
 *
 * ⚠ Les trois chaînes ci-dessous sont une COPIE FIGÉE de `en.Landing.metaTitle`
 * et `en.Landing.metaDescription` — hors du catalogue i18n, donc hors de portée
 * d'un audit de copy. À resynchroniser À LA MAIN chaque fois que ces deux clés
 * changent, sinon la vignette de partage continue d'annoncer une promesse que
 * la page ne tient plus.
 */

export const alt = "minddy, the issue tracker that stays simple";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0d0e10",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width={72} height={72} viewBox={MINDDY_LOGO_VIEWBOX} fill="#fafafa">
            <path fillRule="evenodd" clipRule="evenodd" d={MINDDY_LOGO_PATH} />
          </svg>
          <span style={{ fontSize: 52, fontWeight: 600, color: "#fafafa", letterSpacing: -1.5 }}>
            minddy
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span
            style={{
              fontSize: 68,
              fontWeight: 600,
              color: "#fafafa",
              letterSpacing: -2.5,
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            A complete issue tracker that stays obvious.
          </span>
          <span style={{ fontSize: 30, color: "#9ca3af", maxWidth: 820, lineHeight: 1.4 }}>
            Issues, objectives, cycles, user feedback and coding agents in one minimal
            tracker: one way to do each thing, nothing to configure.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 3, background: "#3098D0" }} />
          <span style={{ fontSize: 26, color: "#6b7280" }}>minddy.app</span>
        </div>
      </div>
    ),
    size,
  );
}
