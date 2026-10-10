/** Preserve existing UI pixels while adding the documentation capture margin. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { documentationLocales, parseDocumentation } from '../lib/documentation-core.mjs';

const padding = 24;
const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
const page = await context.newPage();
const records = [];
const hash = data => createHash('sha256').update(data).digest('hex');
try {
  for (const locale of documentationLocales) {
    const directory = `content/documentation/${locale}`;
    for (const name of (await fs.readdir(directory)).filter(name => name.endsWith('.md'))) {
      const filename = path.join(directory, name);
      const raw = await fs.readFile(filename, 'utf8');
      const article = parseDocumentation(raw);
      let changed = false;
      for (const figure of article.figures.filter(figure => figure.kind === 'screenshot' && figure.padding !== padding)) {
        const output = path.join('public', figure.src);
        const original = await fs.readFile(output);
        const metadata = await sharp(original).metadata();
        const ratio = metadata.width / figure.viewport[0];
        const scale = ratio > 1.5 ? 2 : 1;
        if (Math.abs(scale - ratio) > 0.02) throw new Error(`Unknown capture scale: ${figure.src}`);
        const margin = padding * scale;
        const render = await sharp(original).png().toBuffer();
        await page.setViewportSize({ width: metadata.width + margin * 2, height: metadata.height + margin * 2 });
        await page.setContent(`<html><head><style>html,body{margin:0;background:transparent}img{display:block;margin:${margin}px;width:${metadata.width}px;height:${metadata.height}px}</style></head><body><img src="data:image/png;base64,${render.toString('base64')}" /></body></html>`);
        await page.locator('img').evaluate(img => img.decode());
        const framed = await page.screenshot({ omitBackground: true });
        // Compare decoded pixels rather than PNG encoding. The UI must be unchanged.
        const before = await sharp(original).ensureAlpha().raw().toBuffer();
        const after = await sharp(framed).extract({ left: margin, top: margin, width: metadata.width, height: metadata.height }).ensureAlpha().raw().toBuffer();
        if (!before.equals(after)) throw new Error(`Framing changed UI pixels: ${figure.src}`);
        await fs.writeFile(output, framed);
        figure.viewport = [Math.round(metadata.width / scale) + padding * 2, Math.round(metadata.height / scale) + padding * 2];
        figure.padding = padding;
        changed = true;
        records.push({ src: figure.src, sourceSha256: hash(original), framedSha256: hash(framed), viewport: figure.viewport, padding, deviceScaleFactor: scale, uiPixelsPreserved: true });
      }
      if (changed) {
        const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        const updated = JSON.parse(match[1]);
        const body = match[2];
        updated.figures = article.figures;
        await fs.writeFile(filename, `---\n${JSON.stringify(updated, null, 2)}\n---\n${body}`);
      }
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  await fs.writeFile(`content/documentation/reviews/illustration-framing-${date}.json`, JSON.stringify({ date, method: 'Browser capture with transparent margins. Existing screenshot UI pixels are preserved exactly; original capture dates and prose remain unchanged.', records }, null, 2) + '\n');
  console.log(`Framed ${records.length} screenshots without changing their UI pixels.`);
} finally {
  await browser.close();
}
