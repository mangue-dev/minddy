"use client";

import { useEffect, useState } from "react";
import { SegmentedControl, Spinner } from "mangue-ui";

import { fetchPullRequestApi, prEndpoint, type PullRequestFile } from "@/lib/agent-api";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { DiffViewAlt } from "./diff-view-alt";
import fixture from "./fixture.json";

/**
 * BANC D'ESSAI des libs de diff — la partie cliente. Voir `page.tsx` pour ce que
 * la comparaison cherche à trancher.
 *
 * Deux sources : le jeu figé de `fixture.json` (extrait de vrais commits de
 * minddy, donc toujours disponible et identique d'une session à l'autre), ou une
 * VRAIE pull request via `?pr=<id>` — les mêmes octets que la page Pull requests.
 */

const FIXTURE = fixture as PullRequestFile[];

type Lib = "current" | "alt";

export function DiffLabClient({ prId }: { prId?: string }) {
  const [lib, setLib] = useState<Lib>("current");
  const [files, setFiles] = useState<PullRequestFile[]>(FIXTURE);
  const [loading, setLoading] = useState(!!prId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prId) return;
    setLoading(true);
    fetchPullRequestApi(prId)
      .then((res) => {
        setFiles(res.files);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [prId]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Banc d&apos;essai — rendu des diffs</h1>
          <p className="text-xs text-muted-foreground">
            {prId ? `Pull request ${prId}` : "Jeu figé, extrait de vrais commits de minddy"} ·{" "}
            {files.length} fichiers
          </p>
        </div>
        <SegmentedControl
          className="w-72"
          value={lib}
          onChange={setLib}
          options={[
            { value: "current", label: "react-diff-view" },
            { value: "alt", label: "@git-diff-view" },
          ]}
        />
      </header>

      {error ? (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error} — repli sur le jeu figé.
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : lib === "current" ? (
        // `readOnly` : la comparaison porte sur le RENDU, et l'endpoint bidon
        // ci-dessous ne sait de toute façon rien poster.
        <PrDiff files={files} endpoint={prEndpoint(prId ?? "lab")} readOnly />
      ) : (
        <DiffViewAlt files={files} />
      )}
    </div>
  );
}
