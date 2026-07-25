/**
 * captures/ — mise en scène d'une capture (mockup).
 *
 * Le cadre est rendu par le navigateur lui-même : on injecte le PNG dans une
 * page stylée et on rephotographie. Pas de dépendance de traitement d'image,
 * et le rendu profite du même moteur que la capture d'origine.
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { shoot } from "./browser.mjs";

const PRESETS = {
  /** Fenêtre de navigateur macOS avec barre d'adresse. */
  browser: { chrome: true, radius: 12, padding: 96, shadow: true },
  /** Cadre sobre, sans chrome de navigateur. */
  plain: { chrome: false, radius: 12, padding: 72, shadow: true },
  /** Bord à bord, juste des coins arrondis. */
  bare: { chrome: false, radius: 10, padding: 0, shadow: false },
};

/**
 * Encadre une capture existante.
 *
 *   await frame("shots/board/out/fr-light.png", "shots/board/out/fr-light@browser.png",
 *               { preset: "browser", url: "minddy.app/projects/mdy", background: "#0b0b0f" })
 */
export async function frame(inputPath, outputPath, options = {}) {
  const {
    preset = "browser",
    url = "minddy.app",
    background = "linear-gradient(140deg, #1c1c22 0%, #0b0b0f 100%)",
  } = options;
  const spec = { ...PRESETS[preset], ...options };

  const png = await readFile(inputPath);
  const dataUri = `data:image/png;base64,${png.toString("base64")}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });

  await page.setContent(`
    <html><body style="margin:0">
      <div id="stage" style="
        display:inline-block; padding:${spec.padding}px; background:${background};
        font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
        <div style="
          border-radius:${spec.radius}px; overflow:hidden; background:#fff;
          ${spec.shadow ? "box-shadow:0 40px 80px -20px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.06);" : ""}">
          ${
            spec.chrome
              ? `<div style="height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;
                   background:#f4f4f5;border-bottom:1px solid rgba(0,0,0,.07)">
                   <span style="width:11px;height:11px;border-radius:50%;background:#ff5f57"></span>
                   <span style="width:11px;height:11px;border-radius:50%;background:#febc2e"></span>
                   <span style="width:11px;height:11px;border-radius:50%;background:#28c840"></span>
                   <div style="flex:1;margin-left:10px;height:22px;border-radius:6px;background:#fff;
                        display:flex;align-items:center;padding:0 10px;font-size:11px;color:#71717a">
                     ${url}
                   </div>
                 </div>`
              : ""
          }
          <img src="${dataUri}" style="display:block;max-width:1100px;height:auto" />
        </div>
      </div>
    </body></html>
  `);

  await page.evaluate(() => document.fonts.ready);
  await shoot(page.locator("#stage"), outputPath);
  await browser.close();
  return outputPath;
}

export { PRESETS };
