// The remote issue, placed as a RESOURCE of the minddy ticket — the link that we open
// from the panel, next to files and other links.
//
// The `RemoteIssueIndicator` badge already says “this ticket comes from GitHub” at
// side of the identifier, but it is small, silent on the repository, and it is not
// where we are looking for a link. The resource reads “acme/app#42” and lives
// in the list we browse.
//
// The icon is EMBEDDED, not resolved: the normal path for adding a link
// (`resolveLinkResource`) downloads the page title and its favicon, which
// costs a network round trip PER resource. A backfill of 500 issues in
// would make 500, all to the same favicon. Here the brand of the forge is known
// in advance — two WebPs of 32 px, ~600 bytes each, under the ceiling of
// `MAX_ICON_DATA_URL_BYTES` (24 KB) with two orders of magnitude of margin.
//
// The GitHub brand is rendered in neutral gray rather than black: the thumbnail
// displays on `bg-muted`, which is dark in dark theme — a black octocat there
// would be an empty square. The GitLab tanuki keeps its orange, which changes from both
// sides. (Regenerate: rasterize the official brand in WebP 32 px, cf. the
//header comment of `forge-resource.test.ts`.)
//
// PUR module: neither I/O nor server-only, to remain testable in node.

import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import type { LinkResourceInput } from "@/lib/types";

const FORGE_ICON: Record<RepoProviderId, string> = {
  github:
    "data:image/webp;base64,UklGRkQCAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSIYBAAABkGtr27FHd+xkbNvmAdi2bdu2zd5op7IZdmNPbP24i+d53+89hIiYAFgmTr7yJrOyMvPN5YkJcNj6WiktS6629BJ71EePlYejrVqm0eHLuhZdM+n0ZydDy0w6/llXiU0jmXE92y73xnuSL6PFUZKch4g5f1mY8uhhch6zl0RiNEnuAtDaJ3oASGgXCgAhraoBaCaK6wDXKLvBcxPB80gsUaZ6G6QUx0+m/FPbW+InwQlXlCVwOEG59Eb4q7uILhGvssRvOE0R/yvEZzdvRHmJKHDzTRR/F8GaLmLLxbfXglNcDKJ8cVp5E+LggXJ8jMK13mZRHZVQqAT3RNqFrfMpeXE4Sx6blEz+2NE3TovptfkT9VNAi3Lm9ktKI8mnocp9msuaAthF5tdrlUlyBNReFjsAIDqZvIL620/Mj9KiTB+iBRr+pm8wrH3a7wbQO/+m79bKBTvCDH7lV0eYGyRTRhkCIrkBbCM2lJGMNpCsPBgFj81OFRRGGHIKzzSHw4TGMDZKgiVWUDggmAAAAFAFAJ0BKiAAIAA+MRSIQqIhIRgEACADBLSAAfFB5Ktk8ry69O8m5I4SijDEHdGZMQdAAAD+6NJigsfhbk8R2cVyaE0yZL8Y2gnvQMHwWZwRwtur5ftscJXtMAAg9b2wVKX5ikJznm7X9MsbF7TgES+AR5zq42EzNpnnHrSa2XlnVj8YmpEN9zMd7aXjUKGQQq5jIw5QAAQA",
  gitlab:
    "data:image/webp;base64,UklGRnwCAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSPcAAAABgKtt//nlk23btqZa2zoB27btU2iurfYm27abbPP3Gb76/TqCiJgA+J+psXLEpfAcbcixecIRgugt5okYzOpArBWrQ2xn7SAuiS0j7jH8EBFdRZwlRPSlNRHlIhWIiI20dWJGZJZYo3ggKTnw2UkEehG1FCzkK0JqDbFEG+Mbpy0CgJNE+83P4sz/pUlOAGWoaCnAtDJTYP2nzJ9tPiqcN6LU8L1S93k/yvzkQcSREudRAGDYL9+gCVCTXuR5Lwa214ocW/7Aq9XzJyL16oBg9AXfTQyIWw7xjNiCnCrFX7SfFlWQOfyQOIsE+Q36EAdMQNHkZPjvAFZQOCBeAQAAMAsAnQEqIAAgAD4xFIhCoiEhGAQAIAMEtgBOmUI6g9G/CDmO9aO3eSB8nf6f+W/kBvCf+F3QH6j/rtwgH6e///sAP4B/gPYA/Z31Dv7f+s3wAfst+4vwAfrL/5wT+0EZJ9gA/udkIX/0dhUxHzGZ139/Kq6SSO0zcUgZqx+t8k0zpMf/XQTl7dHFE0eDUj0SYWndhYYVr4ISJPvehx/moSzHN4p/K9+/D3aGDaHfyZzGw/YmRk5rKlnWsH+6sp5bQO8664dMbwRpsySQGxjw1s9BjKDilWFyQheLEfotnb7k+94KiolKjn4TLybQT7Xv//zvreGC3VneCEsc2iys1I3upGCrvmTcVwn4qMjuFRXJH0VPjPd36I4n8FX4Z+Gu+qayAAkpGkOdCeUIMFBB1jB8JkYlsyw7UMusM/lMkN84fI8//KoKlGYTaOJRezGl0C9Fv+P0aH1K/KIHgAA=",
};

/**
 * The resource descriptor for a remote issue, or `null` if the forge
 * did not give a URL (the field is nullable on both sides, and an unbound resource
 * is not a resource).
 *
 * The label is "acme/app#42" when we know the repository, "GitHub #42"
 * otherwise — the webhook always carries `full_name`, the backfill starts from the link,
 * but neither of them guarantees it over the entire duration of a link.
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
