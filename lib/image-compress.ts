/**
 * Client-side image compression for avatars: downscale to `maxDim` and re-encode
 * (WebP, JPEG fallback), dropping quality until the result fits under `maxBytes`.
 * Returns a compressed Blob — or the original file if the browser can't process
 * it. DOM-only (canvas); call from client components.
 */
export async function compressImage(
  file: File,
  { maxDim = 512, maxBytes = 1.8 * 1024 * 1024 }: { maxDim?: number; maxBytes?: number } = {}
): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadImage(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const type = supportsWebp() ? "image/webp" : "image/jpeg";
  let quality = 0.9;
  let blob = await toBlob(canvas, type, quality);
  while (blob && blob.size > maxBytes && quality > 0.4) {
    quality -= 0.15;
    blob = await toBlob(canvas, type, quality);
  }
  return blob ?? file;
}

function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let _webp: boolean | null = null;
function supportsWebp(): boolean {
  if (_webp !== null) return _webp;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  _webp = c.toDataURL("image/webp").startsWith("data:image/webp");
  return _webp;
}
