import sharp from "sharp";
import { writeFile } from "node:fs/promises";

/** Wait for the selected screen, without waiting on unrelated animated status badges. */
export async function settleDocumentationPage(page, locale) {
  await page.waitForLoadState("domcontentloaded");
  if (await page.locator("html").getAttribute("lang") !== locale) throw new Error(`The documentation capture did not render in ${locale}.`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    localStorage.setItem("mangue-ui-theme", "light");
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    document.documentElement.style.colorScheme = "light";
  });
}

/** Capture the real control with equal transparent margins baked into the PNG. */
export async function captureDocumentationControl(page, control, output, padding = 24) {
  // A listbox can sit inside the popover surface that paints its background and border.
  const popover = control.locator('xpath=ancestor-or-self::*[@data-radix-popper-content-wrapper][1]');
  if (await popover.count()) control = popover;
  await control.scrollIntoViewIfNeeded();
  let bounds = await control.boundingBox();
  if (!bounds || bounds.width < 100 || bounds.height < 40) throw new Error("The documentation control is not visible.");
  const viewport = page.viewportSize();
  const missingBottom = bounds.y + bounds.height + padding - viewport.height;
  if (missingBottom > 0) {
    await page.setViewportSize({ ...viewport, height: viewport.height + Math.ceil(missingBottom * 2) + padding });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    bounds = await control.boundingBox();
  }
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const x = Math.max(0, bounds.x + scroll.x - padding);
  const y = Math.max(0, bounds.y + scroll.y - padding);
  if (x !== bounds.x + scroll.x - padding || y !== bounds.y + scroll.y - padding) throw new Error("The control needs more room to capture equal margins.");
  const clip = { x, y, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
  await control.evaluate(el => el.setAttribute("data-documentation-capture", ""));
  await page.addStyleTag({ content: "html, body { background: transparent !important; } body * { visibility: hidden !important; } [data-documentation-capture], [data-documentation-capture] * { visibility: visible !important; }" });
  const pixels = await page.screenshot({ clip, omitBackground: true, animations: "disabled" });
  const scale = await page.evaluate(() => devicePixelRatio);
  const image = await sharp(pixels).metadata();
  if (Math.abs(image.width - clip.width * scale) > 1 || Math.abs(image.height - clip.height * scale) > 1) throw new Error("The screenshot cropped the documentation margin.");
  await writeFile(output, pixels);
  return { viewport: [Math.round(image.width / scale), Math.round(image.height / scale)], padding };
}
