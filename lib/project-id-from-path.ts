/** Project id derived from the current URL (`/projects/[id]/…`), else null. */
export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}
