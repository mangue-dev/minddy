"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, Spinner } from "mangue-ui";
import { ImageOff } from "lucide-react";

import { prFileRawUrl, type PrEndpoint, type PullRequestFile } from "@/lib/agent-api";

/**
 * Diff d'une image (MIN-66) : l'avant et l'après côte à côte, avec dimensions et
 * poids. Ce que la vue diff affiche à la place de « diff indisponible » quand le
 * fichier sans patch est une image — le cas de très loin le plus fréquent, et le
 * seul qu'on sache vraiment MONTRER.
 *
 * On passe par `fetch` + blob plutôt que par un `<img src>` direct sur la route :
 * un `<img>` ne dit ni le poids du fichier ni la raison d'un échec, et la même
 * requête nous donne les deux (`blob.size`, et le statut HTTP pour distinguer
 * « trop lourde » d'une vraie panne).
 */

type Side = "base" | "head";

interface Version {
  status: "loading" | "ready" | "missing" | "failed";
  url?: string;
  bytes?: number;
  width?: number;
  height?: number;
}

/**
 * Charge une version de l'image et en mesure les dimensions. `missing` = la
 * forge répond 404, ce qui est le cas NORMAL du côté absent (un fichier ajouté
 * n'a pas d'avant) — pas une erreur à signaler comme telle.
 */
function useImageVersion(endpoint: PrEndpoint, path: string, side: Side, enabled: boolean): Version {
  const [state, setState] = useState<Version>({ status: enabled ? "loading" : "missing" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "missing" });
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setState({ status: "loading" });
    fetch(prFileRawUrl(endpoint, path, side))
      .then(async (res) => {
        if (res.status === 404) return { status: "missing" as const };
        if (!res.ok) return { status: "failed" as const };
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        // Dimensions lues sur une image DÉTACHÉE : elles doivent être connues
        // avant le rendu pour que la légende s'affiche d'un coup, sans faire
        // sauter la mise en page une fois le `<img>` monté.
        const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
          // Un SVG sans dimensions intrinsèques, un format que le navigateur ne
          // décode pas : on l'affiche quand même, sans légende de taille.
          probe.onerror = () => resolve(null);
          probe.src = url;
        });
        return {
          status: "ready" as const,
          url,
          bytes: blob.size,
          width: size?.width,
          height: size?.height,
        };
      })
      .catch(() => ({ status: "failed" as const }))
      .then((next) => {
        if (cancelled) return;
        setState(next);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint, path, side, enabled]);

  return state;
}

/** Poids lisible. Ko/Mo décimaux — ceux qu'affichent GitHub et le Finder. */
function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB"] as const;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

/** Un des deux côtés : le damier, l'image, et sa légende. */
function ImagePane({
  label,
  version,
  tone,
  locale,
}: {
  label: string;
  version: Version;
  /** Teinte du liseré : l'avant se lit en rouge, l'après en vert, comme le diff. */
  tone: "base" | "head";
  locale: string;
}) {
  const t = useTranslations("PullRequests");

  const caption =
    version.status === "ready"
      ? [
          version.width && version.height ? `${version.width} × ${version.height}` : null,
          version.bytes != null ? formatBytes(version.bytes, locale) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span
        className={cn(
          "text-[11px] font-medium",
          tone === "base"
            ? "text-red-600 dark:text-red-400"
            : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          // `flex-1` : les deux panneaux sont des colonnes soeurs étirées à la
          // même hauteur, mais sans ça chaque cadre prend celle de SON image —
          // et deux images de tailles différentes donnent deux cadres inégaux,
          // ce qui se lit comme un défaut d'alignement plutôt que comme un écart
          // de dimensions.
          "pr-image-checker flex min-h-28 flex-1 items-center justify-center rounded border p-3",
          tone === "base"
            ? "border-red-500/30 bg-red-500/[0.04]"
            : "border-emerald-500/30 bg-emerald-500/[0.04]",
        )}
      >
        {version.status === "loading" ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : version.status === "ready" && version.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: local, hors optimiseur
          <img
            src={version.url}
            alt={label}
            className="max-h-72 max-w-full object-contain"
            style={{ imageRendering: version.width && version.width < 64 ? "pixelated" : undefined }}
          />
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ImageOff className="size-3.5" />
            {version.status === "failed" ? t("imageFailed") : t("imageAbsent")}
          </span>
        )}
      </div>
      {caption ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">{caption}</span>
      ) : null}
    </div>
  );
}

export function PrImageDiff({
  file,
  endpoint,
  locale,
}: {
  file: PullRequestFile;
  endpoint: PrEndpoint;
  locale: string;
}) {
  const t = useTranslations("PullRequests");

  // Le côté qui n'existe pas n'est PAS demandé : une requête qu'on sait vouée au
  // 404 ferait un aller-retour de forge pour rien.
  const base = useImageVersion(endpoint, file.filename, "base", file.status !== "added");
  const head = useImageVersion(endpoint, file.filename, "head", file.status !== "removed");

  // Ajout ou suppression : un seul côté a du sens, et le montrer seul et large
  // dit mieux ce qui s'est passé qu'un panneau vide en face.
  if (file.status === "added" || file.status === "removed") {
    const only = file.status === "added" ? head : base;
    return (
      <div className="p-3">
        <ImagePane
          label={file.status === "added" ? t("imageAdded") : t("imageRemoved")}
          version={only}
          tone={file.status === "added" ? "head" : "base"}
          locale={locale}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row">
      <ImagePane label={t("imageBefore")} version={base} tone="base" locale={locale} />
      <ImagePane label={t("imageAfter")} version={head} tone="head" locale={locale} />
    </div>
  );
}
