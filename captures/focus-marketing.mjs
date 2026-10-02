/** Publish focused feature images from the original, lossless product captures. */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

// Coordinates are fractions of each source image. The crop always keeps the slot ratio.
// Recomputed for the landing-refinements layout (2026-09-21): the shell moved
// the secondary sidebar, the palette centers over the board, the agent and PR
// detail sheets sit further right.
const shots = [
  { id: 'pagesEditor', shot: 'pages-editor', x: .42, y: .10, width: .44, ratio: 16 / 10 },
  { id: 'feedbackBoard', shot: 'feedback-board', x: .20, y: .05, width: .43, height: .45, ratio: 16 / 10 },
  { id: 'featurePalette', shot: 'palette', x: .292, y: .153, width: .414, height: .40, ratio: 16 / 10 },
  { id: 'workflowAgent', shot: 'agent', x: .35, y: .02, width: .65, ratio: 4 / 3 },
  { id: 'workflowPr', shot: 'pull-request', x: .335, y: .10, width: .645, ratio: 4 / 3 },
  { id: 'numoPanel', shot: 'numo', x: .605, y: .293, width: .395, ratio: 4 / 3 },
];
const locales = ['en', 'fr', 'de', 'es', 'it', 'pt-BR'];
await mkdir('public/captures/focused', { recursive: true });
for (const shot of shots) {
  for (const locale of locales) {
    for (const theme of ['light', 'dark']) {
      const source = `captures/shots/${shot.shot}/out/${locale}-${theme}.png`;
      const { width, height } = await sharp(source).metadata();
      const cropWidth = Math.floor(width * shot.width / 16) * 16;
      const crop = {
        left: Math.round(width * shot.x), top: Math.round(height * shot.y),
        width: cropWidth, height: shot.height ? Math.round(height * shot.height) : Math.round(cropWidth / shot.ratio),
      };
      if (crop.left + crop.width > width || crop.top + crop.height > height) {
        throw new Error(`Focus crop exceeds source bounds: ${source}`);
      }
      // Pad isolated surfaces instead of cutting through a menu or a feedback row.
      const pixel = await sharp(source).extract({ left: crop.left + 16, top: crop.top + 16, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      const padding = Math.max(0, Math.round(cropWidth / shot.ratio) - crop.height);
      const framed = await sharp(source).extract(crop)
        .extend({ top: Math.floor(padding / 2), bottom: Math.ceil(padding / 2), left: 0, right: 0,
          background: { r: pixel[0], g: pixel[1], b: pixel[2] } })
        .png().toBuffer();
      await sharp(framed).resize({ width: 1440, withoutEnlargement: true })
        .webp({ quality: 94, effort: 6 })
        .toFile(`public/captures/focused/${shot.id}-${locale}-${theme}.webp`);
    }
  }
  console.log(`Published ${shot.id}: six locales, light and dark, ratio ${shot.ratio}.`);
}
