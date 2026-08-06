import "server-only";

import sharp from "sharp";
import { resolveLinkPreview } from "@/lib/server/favicon";
import { MAX_ICON_DATA_URL_BYTES } from "@/lib/server/attachments";
import type { LinkResourceInput } from "@/lib/types";

/**
 * D'une URL brute au descripteur de ressource qu'on enregistre (MIN-184) :
 * titre de la page pour libellé, favicon ramené à une vignette inline.
 *
 * Le favicon vit DANS la ligne, en data URI — pas dans le bucket. C'est ce qui
 * garde les quatre chaînes de ménage (route DELETE, corbeille, rétention,
 * suppression de compte) sur un seul chemin d'objets. Le prix à payer, c'est
 * que l'icône doit rester petite : 32 px de côté en WebP, ~1-2 Ko.
 *
 * Deux exceptions à la recompression, toutes deux dictées par libvips :
 *  - un `.ico` ne se lit pas — vérifié sur le favicon de linear.app, un vrai
 *    conteneur ICO à trois frames que sharp refuse net. On le garde donc BRUT,
 *    et c'est lui qui décide du plafond : 15 Ko d'ICO font ~20 Ko de base64,
 *    d'où `MAX_ICON_DATA_URL_BYTES` à 24 Ko. Descendre le plafond ne rendrait
 *    pas ces icônes plus légères, il les ferait seulement disparaître ;
 *  - une icône que sharp refuse (SVG masqué, octets tronqués) n'annule pas le
 *    lien : on rend simplement `icon_data_url: null`.
 *
 * Ne lève que sur une URL irrécupérable (FaviconError("invalidUrl")). Un site
 * éteint reste un lien valide, avec son hostname pour titre.
 */

/** Le badge d'une ressource affiche l'icône en 20 px CSS ; ×1,6 pour le retina
    sans faire grossir la ligne. */
const ICON_SIZE = 32;

export async function resolveLinkResource(
  rawUrl: string
): Promise<LinkResourceInput> {
  const preview = await resolveLinkPreview(rawUrl);
  return {
    kind: "link",
    url: preview.url,
    file_name: preview.title.slice(0, 200),
    icon_data_url: preview.icon ? await toIconDataUrl(preview.icon) : null,
  };
}

async function toIconDataUrl(icon: {
  contentType: string;
  bytes: Buffer;
}): Promise<string | null> {
  const mime = icon.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const isIco = mime.includes("icon") || mime === "image/ico";

  if (isIco) {
    const raw = dataUrl("image/x-icon", icon.bytes);
    return raw.length <= MAX_ICON_DATA_URL_BYTES ? raw : null;
  }

  try {
    const webp = await sharp(icon.bytes, { animated: false })
      .resize(ICON_SIZE, ICON_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 82 })
      .toBuffer();
    const url = dataUrl("image/webp", webp);
    return url.length <= MAX_ICON_DATA_URL_BYTES ? url : null;
  } catch {
    return null;
  }
}

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
