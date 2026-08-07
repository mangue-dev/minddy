// L'issue distante, posée en RESSOURCE du ticket minddy — le lien qu'on ouvre
// depuis le panneau, à côté des fichiers et des autres liens.
//
// Le badge de `RemoteIssueIndicator` dit déjà « ce ticket vient de GitHub » à
// côté de l'identifiant, mais il est petit, muet sur le dépôt, et il n'est pas
// là où l'on cherche un lien. La ressource, elle, se lit « acme/app#42 » et vit
// dans la liste qu'on parcourt.
//
// L'icône est EMBARQUÉE, pas résolue : le chemin normal d'ajout de lien
// (`resolveLinkResource`) télécharge le titre de la page et son favicon, ce qui
// coûte un aller-retour réseau PAR ressource. Un backfill de 500 issues en
// ferait 500, tous vers le même favicon. Ici la marque de la forge est connue
// d'avance — deux WebP de 32 px, ~600 octets chacun, sous le plafond de
// `MAX_ICON_DATA_URL_BYTES` (24 Ko) avec deux ordres de grandeur de marge.
//
// La marque GitHub est rendue en gris neutre plutôt qu'en noir : la vignette
// s'affiche sur `bg-muted`, qui est sombre en thème sombre — un octocat noir y
// serait un carré vide. Le tanuki GitLab garde son orange, qui passe des deux
// côtés. (Régénérer : rasteriser la marque officielle en WebP 32 px, cf. le
// commentaire d'en-tête de `forge-resource.test.ts`.)
//
// Module PUR : ni I/O ni server-only, pour rester testable en node.

import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import type { LinkResourceInput } from "@/lib/types";

const FORGE_ICON: Record<RepoProviderId, string> = {
  github:
    "data:image/webp;base64,UklGRkQCAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSIYBAAABkGtr27FHd+xkbNvmAdi2bdu2zd5op7IZdmNPbP24i+d53+89hIiYAFgmTr7yJrOyMvPN5YkJcNj6WiktS6629BJ71EePlYejrVqm0eHLuhZdM+n0ZydDy0w6/llXiU0jmXE92y73xnuSL6PFUZKch4g5f1mY8uhhch6zl0RiNEnuAtDaJ3oASGgXCgAhraoBaCaK6wDXKLvBcxPB80gsUaZ6G6QUx0+m/FPbW+InwQlXlCVwOEG59Eb4q7uILhGvssRvOE0R/yvEZzdvRHmJKHDzTRR/F8GaLmLLxbfXglNcDKJ8cVp5E+LggXJ8jMK13mZRHZVQqAT3RNqFrfMpeXE4Sx6blEz+2NE3TovptfkT9VNAi3Lm9ktKI8mnocp9msuaAthF5tdrlUlyBNReFjsAIDqZvIL620/Mj9KiTB+iBRr+pm8wrH3a7wbQO/+m79bKBTvCDH7lV0eYGyRTRhkCIrkBbCM2lJGMNpCsPBgFj81OFRRGGHIKzzSHw4TGMDZKgiVWUDggmAAAAFAFAJ0BKiAAIAA+MRSIQqIhIRgEACADBLSAAfFB5Ktk8ry69O8m5I4SijDEHdGZMQdAAAD+6NJigsfhbk8R2cVyaE0yZL8Y2gnvQMHwWZwRwtur5ftscJXtMAAg9b2wVKX5ikJznm7X9MsbF7TgES+AR5zq42EzNpnnHrSa2XlnVj8YmpEN9zMd7aXjUKGQQq5jIw5QAAQA",
  gitlab:
    "data:image/webp;base64,UklGRnwCAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSPcAAAABgKtt//nlk23btqZa2zoB27btU2iurfYm27abbPP3Gb76/TqCiJgA+J+psXLEpfAcbcixecIRgugt5okYzOpArBWrQ2xn7SAuiS0j7jH8EBFdRZwlRPSlNRHlIhWIiI20dWJGZJZYo3ggKTnw2UkEehG1FCzkK0JqDbFEG+Mbpy0CgJNE+83P4sz/pUlOAGWoaCnAtDJTYP2nzJ9tPiqcN6LU8L1S93k/yvzkQcSREudRAGDYL9+gCVCTXuR5Lwa214ocW/7Aq9XzJyL16oBg9AXfTQyIWw7xjNiCnCrFX7SfFlWQOfyQOIsE+Q36EAdMQNHkZPjvAFZQOCBeAQAAMAsAnQEqIAAgAD4xFIhCoiEhGAQAIAMEtgBOmUI6g9G/CDmO9aO3eSB8nf6f+W/kBvCf+F3QH6j/rtwgH6e///sAP4B/gPYA/Z31Dv7f+s3wAfst+4vwAfrL/5wT+0EZJ9gA/udkIX/0dhUxHzGZ139/Kq6SSO0zcUgZqx+t8k0zpMf/XQTl7dHFE0eDUj0SYWndhYYVr4ISJPvehx/moSzHN4p/K9+/D3aGDaHfyZzGw/YmRk5rKlnWsH+6sp5bQO8664dMbwRpsySQGxjw1s9BjKDilWFyQheLEfotnb7k+94KiolKjn4TLybQT7Xv//zvreGC3VneCEsc2iys1I3upGCrvmTcVwn4qMjuFRXJH0VPjPd36I4n8FX4Z+Gu+qayAAkpGkOdCeUIMFBB1jB8JkYlsyw7UMusM/lMkN84fI8//KoKlGYTaOJRezGl0C9Fv+P0aH1K/KIHgAA=",
};

/**
 * Le descripteur de ressource pour une issue distante, ou `null` si la forge
 * n'a pas donné d'URL (le champ est nullable des deux côtés, et une ressource
 * sans lien n'est pas une ressource).
 *
 * Le libellé est « acme/app#42 » quand on connaît le dépôt, « GitHub #42 »
 * sinon — le webhook porte toujours `full_name`, le backfill part de la liaison,
 * mais aucun des deux ne le garantit sur toute la durée d'une liaison.
 */
export function forgeIssueResource(params: {
  provider: RepoProviderId;
  repoFullName: string | null;
  number: number;
  url: string | null;
}): LinkResourceInput | null {
  if (!params.url) return null;
  const label = params.repoFullName
    ? `${params.repoFullName}#${params.number}`
    : `${getRepoProvider(params.provider).displayName} #${params.number}`;
  return {
    kind: "link",
    url: params.url,
    file_name: label.slice(0, 200),
    icon_data_url: FORGE_ICON[params.provider] ?? null,
  };
}
