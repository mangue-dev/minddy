/**
 * The AUTHORS of a commit — plural, because a commit often has them
 * plusieurs.
 *
 * Git only knows one author; the `Co-authored-by:` convention in trailer of the
 * message adds the others, and it is this that the forges read to display
 * several avatars. In minddy this is the COMMON case: any commit written with
 * Numo, or with a code agent, carries his co-signer.
 *
 * Pure and shared client/server, like `pr-review-threads`: the same list is used
 * Commits tab and PR activity, and letting them diverge would mean
 * two different things from the same commit in the same page.
 */

export interface CommitAuthor {
  /**
   * The forge account, when she knew how to link the email to a user.
   * `null` = known person behind this name: the display falls to `name`
   * and on an avatar derived from him, like everywhere else in minddy.
   */
  login: string | null;
  /** The name written in the commit or its trailer — always present. */
  name: string;
  /** The ACCOUNT avatar. Never the identicon that the forge makes for an email
      unknown: it would read like someone's photo. */
  avatar_url: string | null;
}

/**
 * `Co-authored-by: Nom <email>` — the convention, such as GitHub and GitLab
 * read. Insensitive to the case of the keyword (`Co-Authored-By` is also common
 * than the lowercase form), space tolerant, and without email anywhere:
 * a trailer without `<…>` is not one.
 *
 * Fallback from the rich path: on the GitHub side, the forge resolves these trailers itself by
 * ACCOUNTS (with avatars) and his answer wins. Here we only have what is
 * written in the message — names. This is what's left when GraphQL doesn't have
 * answered, and all GitLab will ever give: its API serves no account
 * on his commits.
 */
const CO_AUTHOR = /^\s*co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/i;

export function parseCoAuthorTrailers(message: string): Array<CommitAuthor & { email: string }> {
  const out: Array<CommitAuthor & { email: string }> = [];
  for (const line of (message ?? "").split("\n")) {
    const m = line.match(CO_AUTHOR);
    if (!m) continue;
    const name = m[1].trim();
    if (!name) continue;
    out.push({ login: null, name, avatar_url: null, email: m[2].trim().toLowerCase() });
  }
  return out;
}

/** Two entries designate the same person if their email — otherwise their name —
    coincides. Email is the key to the forge; the name is what remains without it. */
function identityKey(author: { login?: string | null; name: string; email?: string | null }): string {
  if (author.email) return `email:${author.email.toLowerCase()}`;
  if (author.login) return `login:${author.login.toLowerCase()}`;
  return `name:${author.name.toLowerCase()}`;
}

/**
 * The list of authors to DISPLAY, main author at the top.
 *
 * `fromForge` is the response from the forge when it knows how to resolve trailers
 * itself (GitHub does it in GraphQL, deduplication included): it wins
 * entire, because it alone carries the accounts and their avatars.
 *
 * Otherwise we reconstruct: the author of the commit, then his co-signatories read in the
 * message. Deduplication matters — the primary author is very often
 * re-declared in trailer, and displaying it twice would give two avatars for one
 * seule personne.
 *
 * Empty only if the commit has neither author nor name: the caller then falls back to
 * what he displayed before.
 */
export function commitAuthors(
  commit: {
    message: string;
    author: { login: string; avatar_url: string | null } | null;
    authorName: string | null;
    authorEmail: string | null;
  },
  fromForge?: CommitAuthor[],
): CommitAuthor[] {
  if (fromForge?.length) return fromForge;

  const primary: CommitAuthor | null =
    commit.author || commit.authorName
      ? {
          login: commit.author?.login ?? null,
          name: commit.authorName ?? commit.author?.login ?? "",
          avatar_url: commit.author?.avatar_url ?? null,
        }
      : null;

  const seen = new Set<string>();
  const out: CommitAuthor[] = [];
  if (primary) {
    seen.add(identityKey({ ...primary, email: commit.authorEmail }));
    out.push(primary);
  }
  for (const co of parseCoAuthorTrailers(commit.message)) {
    const key = identityKey(co);
    if (seen.has(key)) continue;
    // Without a common email, the name remains the only recourse against the duplicate: a
    // trailer which repeats word for word the name of the author is the same human.
    if (out.some((a) => a.name.toLowerCase() === co.name.toLowerCase())) continue;
    seen.add(key);
    out.push({ login: co.login, name: co.name, avatar_url: co.avatar_url });
  }
  return out;
}

/**
 * Authors of MULTIPLE commits, deduplicated — what a push says
 * folded (“so-and-so pushed 5 commits”). The order of first
 * appearance is preserved: it is that of history.
 */
export function mergeCommitAuthors(lists: CommitAuthor[][]): CommitAuthor[] {
  const seen = new Set<string>();
  const out: CommitAuthor[] = [];
  for (const author of lists.flat()) {
    const key = identityKey(author);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(author);
  }
  return out;
}
