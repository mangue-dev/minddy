/**
 * LE SCAN DE SECRETS AVANT PUSH (MIN-360) — PUR et testable, comme
 * [command-guard.ts](command-guard.ts) et [repo-path.ts](repo-path.ts), et pour la
 * même raison : ce qu'il garde ne se rattrape pas après coup.
 *
 * CE QUI LE REND NÉCESSAIRE. La fin de tour publie une pull request **sans humain
 * devant l'écran** — c'est tout l'intérêt du produit, et c'est aussi ce qui fait
 * qu'aucun regard ne passe entre le diff et le remote.
 * [delivery-gate.ts](delivery-gate.ts) est une porte de QUALITÉ (types, tests,
 * relecture) : rien n'y cherche un secret. Tant que le dépôt était un clone
 * jetable, le seul secret à portée était celui du dépôt lui-même ; en mode dépôt
 * courant, le `.env` réel de l'utilisateur est là, à côté des fichiers du tour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DOCTRINE, ET ELLE EST LA MÊME QUE CELLE DU GARDE-FOU DE COMMANDES
 *
 * **Liste fermée de préfixes STRUCTURÉS, jamais d'entropie.** Une porte DURE — qui
 * refuse le push — ne peut pas se permettre de faux positif : un tour bloqué par
 * une chaîne aléatoire de 40 caractères dans une fixture est un tour perdu, et un
 * garde-fou qu'on finit par retirer. Ce qu'on reconnaît, ce sont des jetons qui
 * s'annoncent : `AKIA…`, `ghp_…`, `sk-ant-…`, `-----BEGIN … PRIVATE KEY-----`.
 *
 * DEUX MOTIFS ONT ÉTÉ ESSAYÉS PUIS RETIRÉS, et il vaut mieux dire pourquoi que
 * laisser quelqu'un les rajouter :
 *
 * - **le JWT nu.** La clé anonyme de Supabase EN EST UN, elle est publique par
 *   conception et vit dans les `.env.example` et les README de la moitié du
 *   monde. On ne garde donc que le JWT dont la charge utile dit `service_role` —
 *   celui-là, personne ne le publie exprès ;
 * - **l'URL à identifiants** (`postgres://user:pass@host`). Presque toujours une
 *   URL de dév locale, dans un `docker-compose.yml` ou un README.
 */

/** Une trouvaille. Le secret lui-même n'y est JAMAIS entier : ce module écrit
 *  dans un fil de conversation, et une fuite qui se raconte reste une fuite. */
export interface SecretFinding {
  /** Ce qu'on a reconnu, en clair (« GitHub token »). */
  kind: string;
  /** Le fichier, quand le diff le dit. */
  file: string;
  /** Le début du jeton, tronqué — assez pour le retrouver, pas pour s'en servir. */
  sample: string;
}

/**
 * LES FICHIERS DONT LE CONTENU EST UN SECRET PAR NATURE — la famille dotenv.
 *
 * Lu à deux endroits, et c'est pour ça qu'il vit ici plutôt que dans l'un des
 * deux : le verdict de permission s'en sert pour refuser une LECTURE sur le
 * chemin local ([vm/opencode-permissions.ts](vm/opencode-permissions.ts)), le scan
 * pour refuser un push qui en AJOUTE un.
 *
 * `.env.example` (et ses cousins `.sample` / `.template`) sont épargnés : ils sont
 * faits pour être lus et commités, et c'est souvent le seul endroit où le nom des
 * variables est écrit.
 */
export function isSecretFile(path: string): boolean {
  const name = (path.split("/").pop() ?? "").trim().toLowerCase();
  if (!name) return false;
  if (name.endsWith(".example") || name.endsWith(".sample") || name.endsWith(".template")) {
    return false;
  }
  return name === ".env" || name.startsWith(".env.") || name.endsWith(".env");
}

/** Les jetons qui s'annoncent. L'ordre compte : le plus spécifique d'abord, parce
 *  qu'un `sk-ant-…` satisfait aussi le motif générique des clés en `sk-`. */
const PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: "private key", re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g },
  { kind: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{50,}/g },
  { kind: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { kind: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{12,}/g },
  { kind: "Stripe live key", re: /\b[sr]k_live_[A-Za-z0-9]{16,}/g },
  { kind: "OpenRouter key", re: /\bsk-or-v1-[a-f0-9]{48,}/g },
  { kind: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{24,}/g },
  { kind: "OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: "Vercel Blob token", re: /\bvercel_blob_rw_[A-Za-z0-9_]{20,}/g },
];

/** Un JWT, dont on ne retient que ceux dont la charge utile dit `service_role`. */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]{16,}/g;

/** Ce qui, DANS LA VALEUR ELLE-MÊME, dit qu'elle n'est pas un vrai jeton. On ne
 *  regarde pas la ligne entière : un commentaire « example » au-dessus d'une
 *  vraie clé ne doit pas l'exempter. */
const PLACEHOLDER = /(example|placeholder|redacted|changeme|your[_-]|xxxx|\.\.\.)/i;

/** Assez pour retrouver la ligne, pas assez pour s'en servir. */
function sampleOf(match: string): string {
  return `${match.slice(0, 12)}…`;
}

function isServiceRoleJwt(payload: string): boolean {
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    return json.includes("service_role");
  } catch {
    return false;
  }
}

/**
 * Les secrets d'un TEXTE (le contenu d'un fichier neuf, une ligne ajoutée).
 * `file` n'est qu'une étiquette, pour que la trouvaille se dise.
 */
export function scanSecrets(text: string, file = ""): SecretFinding[] {
  if (!text) return [];
  const found: SecretFinding[] = [];
  const seen = new Set<string>();
  const push = (kind: string, match: string) => {
    if (PLACEHOLDER.test(match)) return;
    const key = `${file}:${match.slice(0, 16)}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ kind, file, sample: sampleOf(match) });
  };

  for (const { kind, re } of PATTERNS) {
    // `lastIndex` est de l'état porté par le littéral de module : on le remet à
    // zéro, sans quoi un appel sur deux sauterait le début du texte.
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) push(kind, match[0]);
  }
  JWT.lastIndex = 0;
  for (const match of text.matchAll(JWT)) {
    if (isServiceRoleJwt(match[1])) push("service-role JWT", match[0]);
  }
  return found;
}

/**
 * LES SECRETS D'UN DIFF UNIFIÉ — les lignes AJOUTÉES, et elles seules.
 *
 * Scanner les fichiers entiers plutôt que le diff paraîtrait plus sûr et serait en
 * réalité inutilisable : un secret déjà présent dans le dépôt bloquerait alors
 * tous les tours qui touchent à ce fichier, pour toujours, sans que l'agent ait
 * quoi que ce soit à s'y reprocher. Ce qu'on garde, c'est ce que CE tour ajoute.
 */
export function scanDiff(diff: string): SecretFinding[] {
  const found: SecretFinding[] = [];
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      file = path === "/dev/null" ? "" : path.replace(/^b\//, "");
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (!line.startsWith("+")) continue;
    found.push(...scanSecrets(line.slice(1), file));
  }
  return found;
}

/** Le mot au modèle. Il NOMME les fichiers — c'est ce qui rend le refus réparable
 *  — et ne recopie jamais le jeton entier. */
export function formatSecretFindings(findings: SecretFinding[]): string {
  const lines = findings
    .slice(0, 10)
    .map((f) => `- ${f.kind} (${f.sample}) in ${f.file || "an added file"}`);
  const more = findings.length > lines.length ? `\n- …and ${findings.length - lines.length} more` : "";
  return (
    `Refused to push: this turn adds what looks like a real credential.\n${lines.join("\n")}${more}\n` +
    `Nothing was pushed and nothing was committed. Remove the value from the diff — read it from ` +
    `the environment instead, and put the variable's NAME in \`.env.example\` if it needs ` +
    `documenting. If this is a fixture, make it obviously fake (\`…-example\`, \`placeholder\`).`
  );
}
