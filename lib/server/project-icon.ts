import "server-only";

import sharp from "sharp";
import { getServiceClient } from "@/lib/supabase-service";
import {
  ICON_MIME_EXT,
  iconExtFromContentType,
  resolveFavicon,
} from "@/lib/server/favicon";

/**
 * L'icône stockée d'un projet (MIN-62) : le fichier vit dans le bucket public
 * `project-icons`, une entrée par projet, et son URL est posée sur
 * `projects.icon_url`. Deux sources, un seul emplacement :
 *
 *  - le favicon du site live, téléchargé tel quel ([favicon.ts](./favicon.ts)) ;
 *  - une image envoyée par l'utilisateur, recompressée ici.
 *
 * L'upload accepte n'importe quel poids : c'est le serveur qui ramène l'image à
 * 256 px de côté en WebP — quelques dizaines de Ko, souvent moins — et non
 * l'utilisateur qui doit préparer son fichier. `MAX_ICON_UPLOAD_BYTES` n'est pas
 * une règle produit mais un garde-fou mémoire : la requête entière est
 * tamponnée avant d'atteindre libvips.
 *
 * Le favicon distant, lui, N'EST PAS recompressé : les `.ico` sont le format le
 * plus courant du web et libvips ne sait pas les lire. Ils sont déjà minuscules.
 */

/** Garde-fou mémoire, pas une contrainte de cadrage. */
export const MAX_ICON_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 Mo

/** Côté rendu max (64 px dans le wizard) × 4 : au-delà, l'écran ne montre rien de plus. */
const ICON_SIZE = 256;

/** Rendu des entrées vectorielles (SVG) avant réduction — 96 dpi × ~3. */
const VECTOR_DENSITY = 300;

const BUCKET = "project-icons";

/** Erreur typée pour que la route réponde avec la bonne clé ApiErrors. */
export class IconFileError extends Error {
  constructor(public readonly key: "invalidFile" | "tooLarge") {
    super(key);
  }
}

/**
 * Ramène n'importe quelle image lisible par libvips (PNG, JPEG, WebP, GIF,
 * AVIF, TIFF, HEIC, SVG…) à un carré WebP d'au plus 256 px.
 *
 * `contain` sur fond transparent plutôt que `cover` : un logo n'est pas une
 * photo, on préfère des marges à un rognage. Carré, parce que la tuile qui
 * l'affiche l'est (`object-cover` dans `ProjectOrb`) — une sortie 256 × 192
 * s'y ferait rogner, ce que `contain` cherchait précisément à éviter.
 *
 * D'où le côté calculé sur les dimensions d'entrée plutôt que fixé à 256 :
 * `withoutEnlargement` n'empêche que l'agrandissement du CONTENU, pas la
 * fabrication du canevas demandé — une icône de 48 px y arrivait entière mais
 * perdue au centre d'un carré six fois trop grand.
 *
 * `rotate()` sans argument applique l'orientation EXIF, sans quoi une photo
 * prise au téléphone arrive couchée. On ne fait confiance ni à l'extension ni
 * au type MIME déclaré : c'est libvips qui tranche sur les octets, et ce qu'il
 * ne sait pas lire est refusé.
 */
export async function compressIconFile(bytes: Buffer): Promise<Buffer> {
  if (bytes.byteLength === 0) throw new IconFileError("invalidFile");
  if (bytes.byteLength > MAX_ICON_UPLOAD_BYTES) throw new IconFileError("tooLarge");
  try {
    const image = sharp(bytes, { animated: false, density: VECTOR_DENSITY });
    const { width, height } = await image.metadata();
    if (!width || !height) throw new IconFileError("invalidFile");
    const side = Math.min(ICON_SIZE, Math.max(width, height));

    return await image
      .rotate()
      .resize(side, side, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new IconFileError("invalidFile");
  }
}

/**
 * Pose des octets déjà prêts comme icône du projet : upsert dans
 * `project-icons/{projectId}.{ext}`, update de `projects.icon_url` (URL publique
 * + cache-buster). Renvoie l'URL stockée.
 */
async function storeProjectIcon(
  projectId: string,
  bytes: Buffer,
  contentType: string,
  ext: string
): Promise<string> {
  const path = `${projectId}.${ext}`;
  const service = getServiceClient();

  await removeProjectIconObjects(projectId); // une seule extension à la fois
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = service.storage.from(BUCKET).getPublicUrl(path);
  const iconUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await service
    .from("projects")
    .update({ icon_url: iconUrl })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);

  return iconUrl;
}

/**
 * Importe le favicon de `siteUrl` comme icône du projet. L'appelant a déjà
 * vérifié que l'utilisateur est owner du projet.
 */
export async function importProjectIcon(
  projectId: string,
  siteUrl: string
): Promise<string> {
  const icon = await resolveFavicon(siteUrl);
  const ext = iconExtFromContentType(icon.contentType) as string;
  return storeProjectIcon(
    projectId,
    icon.bytes,
    icon.contentType.split(";")[0].trim(),
    ext
  );
}

/** Pose un fichier envoyé par l'utilisateur comme icône du projet (owner). */
export async function uploadProjectIcon(
  projectId: string,
  bytes: Buffer
): Promise<string> {
  const webp = await compressIconFile(bytes);
  return storeProjectIcon(projectId, webp, "image/webp", "webp");
}

/** Supprime les objets storage possibles de l'icône (toutes extensions). */
async function removeProjectIconObjects(projectId: string): Promise<void> {
  const service = getServiceClient();
  const exts = [...new Set([...Object.values(ICON_MIME_EXT), "webp"])];
  await service.storage
    .from(BUCKET)
    .remove(exts.map((ext) => `${projectId}.${ext}`));
}

/** Efface l'icône du projet (colonne + objets storage). */
export async function clearProjectIcon(projectId: string): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("projects")
    .update({ icon_url: null })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  await removeProjectIconObjects(projectId);
}
