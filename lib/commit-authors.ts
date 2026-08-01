/**
 * Les AUTEURS d'un commit — au pluriel, parce qu'un commit en a souvent
 * plusieurs.
 *
 * Git ne connaît qu'un auteur ; la convention `Co-authored-by:` en trailer du
 * message ajoute les autres, et c'est elle que les forges lisent pour afficher
 * plusieurs avatars. Dans minddy c'est le cas COURANT : tout commit écrit avec
 * Numo, ou avec un agent de code, porte son co-signataire.
 *
 * Pur et partagé client/serveur, comme `pr-review-threads` : la même liste sert
 * l'onglet Commits et l'activité de la PR, et les laisser diverger ferait dire
 * deux choses différentes du même commit dans la même page.
 */

export interface CommitAuthor {
  /**
   * Le compte de forge, quand elle a su rattacher l'email à un utilisateur.
   * `null` = personne de connu derrière ce nom : l'affichage retombe sur `name`
   * et sur un avatar dérivé de lui, comme partout ailleurs dans minddy.
   */
  login: string | null;
  /** Le nom écrit dans le commit ou son trailer — toujours présent. */
  name: string;
  /** L'avatar du COMPTE. Jamais l'identicon que la forge fabrique pour un email
      inconnu : il se lirait comme la photo de quelqu'un. */
  avatar_url: string | null;
}

/**
 * `Co-authored-by: Nom <email>` — la convention, telle que GitHub et GitLab la
 * lisent. Insensible à la casse du mot-clé (`Co-Authored-By` est aussi répandu
 * que la forme minuscule), tolérante aux espaces, et sans email nul part :
 * un trailer sans `<…>` n'en est pas un.
 *
 * Repli du chemin riche : côté GitHub, la forge résout elle-même ces trailers en
 * COMPTES (avec avatars) et c'est sa réponse qui gagne. Ici on n'a que ce qui est
 * écrit dans le message — des noms. C'est ce qui reste quand GraphQL n'a pas
 * répondu, et tout ce que GitLab donnera jamais : son API ne sert aucun compte
 * sur ses commits.
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

/** Deux entrées désignent la même personne si leur email — sinon leur nom —
    coïncide. L'email est la clé de la forge ; le nom est ce qui reste sans lui. */
function identityKey(author: { login?: string | null; name: string; email?: string | null }): string {
  if (author.email) return `email:${author.email.toLowerCase()}`;
  if (author.login) return `login:${author.login.toLowerCase()}`;
  return `name:${author.name.toLowerCase()}`;
}

/**
 * La liste d'auteurs à AFFICHER, auteur principal en tête.
 *
 * `fromForge` est la réponse de la forge quand elle sait résoudre les trailers
 * elle-même (GitHub le fait en GraphQL, dédoublonnage compris) : elle gagne
 * entière, parce qu'elle seule porte les comptes et leurs avatars.
 *
 * Sinon on reconstruit : l'auteur du commit, puis ses co-signataires lus dans le
 * message. Le dédoublonnage compte — l'auteur principal est très souvent
 * re-déclaré en trailer, et l'afficher deux fois donnerait deux avatars pour une
 * seule personne.
 *
 * Vide seulement si le commit n'a ni auteur ni nom : l'appelant retombe alors sur
 * ce qu'il affichait avant.
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
    // Sans email commun, le nom reste le seul recours contre le doublon : un
    // trailer qui répète mot pour mot le nom de l'auteur est le même humain.
    if (out.some((a) => a.name.toLowerCase() === co.name.toLowerCase())) continue;
    seen.add(key);
    out.push({ login: co.login, name: co.name, avatar_url: co.avatar_url });
  }
  return out;
}

/**
 * Les auteurs de PLUSIEURS commits, dédoublonnés — ce que dit une poussée
 * repliée (« untel et untel ont poussé 5 commits »). L'ordre de première
 * apparition est conservé : c'est celui de l'histoire.
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
