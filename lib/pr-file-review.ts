import type { PullRequestFile } from "./agent-api";

/** Count only markers that still belong to the current pull-request diff. */
export function reviewedFileCount(
  files: Pick<PullRequestFile, "filename">[],
  reviewedFiles: ReadonlySet<string>,
): number {
  return files.reduce(
    (count, file) => count + (reviewedFiles.has(file.filename) ? 1 : 0),
    0,
  );
}

/** Update one optional review marker without mutating the previous state. */
export function setFileReviewed(
  reviewedFiles: ReadonlySet<string>,
  path: string,
  reviewed: boolean,
): Set<string> {
  const next = new Set(reviewedFiles);
  if (reviewed) next.add(path);
  else next.delete(path);
  return next;
}
