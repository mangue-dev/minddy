import sharp from "sharp";
import { writeFile } from "node:fs/promises";

/** Wait for the selected screen, without waiting on unrelated animated status badges. */
export async function settleDocumentationPage(page, locale) {
  await page.waitForLoadState("domcontentloaded");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  if (await page.locator("html").getAttribute("lang") !== locale) throw new Error(`The documentation capture did not render in ${locale}.`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    localStorage.setItem("mangue-ui-theme", "light");
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    document.documentElement.style.colorScheme = "light";
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await page.locator("html").evaluate(el => el.classList.contains("dark"))) throw new Error("Documentation screenshots must use light mode.");
}

/** Capture native device pixels and add transparent margins without resampling the UI. */
export async function captureDocumentationControl(page, control, output, padding = 24) {
  const scale = await page.evaluate(() => devicePixelRatio);
  if (!Number.isInteger(scale) || scale < 2) throw new Error("Documentation screenshots require an integer device scale of at least 2.");
  if (await page.locator("html").evaluate(el => el.classList.contains("dark"))) throw new Error("Documentation screenshots must use light mode.");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("[data-settings-focus]").waitFor({ state: "detached", timeout: 5000 });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  // A listbox can sit inside the popover surface that paints its background and border.
  const popover = control.locator('xpath=ancestor-or-self::*[@data-radix-popper-content-wrapper][1]');
  if (await popover.count()) control = popover;
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  if (!bounds || bounds.width < 100 || bounds.height < 40) throw new Error("The documentation control is not visible.");
  const surface = await control.evaluate(el => {
    for (let parent = el; parent; parent = parent.parentElement) {
      const color = getComputedStyle(parent).backgroundColor;
      if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    }
    return "rgb(255, 255, 255)";
  });
  await control.evaluate(el => el.setAttribute("data-documentation-capture", ""));
  let pixels, isolation;
  try {
    isolation = await page.addStyleTag({ content: `html, body { background: transparent !important; } body * { visibility: hidden !important; } [data-documentation-capture], [data-documentation-capture] * { visibility: visible !important; } [data-documentation-capture] { background-color: ${surface} !important; }` });
    pixels = await control.screenshot({ type: "png", scale: "device", omitBackground: true, animations: "disabled" });
  } finally {
    await isolation?.evaluate(el => el.remove()).catch(() => {});
    await control.evaluate(el => el.removeAttribute("data-documentation-capture")).catch(() => {});
  }
  const finalBounds = await control.boundingBox();
  if (!finalBounds) throw new Error("The documentation control disappeared during capture.");
  const image = await sharp(pixels).metadata();
  if (Math.abs(image.width - finalBounds.width * scale) > scale * 2 || Math.abs(image.height - finalBounds.height * scale) > scale * 2) throw new Error(`The screenshot cropped the documentation control: ${image.width}x${image.height}, expected ${finalBounds.width * scale}x${finalBounds.height * scale}.`);
  const margin = Math.round(padding * scale);
  const framed = await sharp(pixels).extend({ left: margin, top: margin, right: margin, bottom: margin, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await writeFile(output, framed);
  return { viewport: [Math.round(image.width / scale) + padding * 2, Math.round(image.height / scale) + padding * 2], padding, deviceScaleFactor: scale, theme: "light" };
}
