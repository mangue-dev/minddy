/**
 * SUBSTITUTION DU TOKEN DE FORGE dans tout ce qui SORT de la boucle (MIN-239).
 *
 * Le token d'installation est dans l'URL de clone (`repo-access.ts`), et
 * `git clone` écrit cette URL ENTIÈRE dans `.git/config` comme `remote.origin.url`.
 * Trois portes la rendent alors lisible au modèle — `run_command("git remote -v")`,
 * `run_command("cat .git/config")`, `read_file(".git/config")` — et rien ne les
 * ferme : `assertNotGit` ne garde que les ÉCRITURES, et son message le dit.
 *
 * **Ce n'est pas une faille de sandbox.** La microVM a le token par construction,
 * c'est son travail. C'est une fuite de JOURNAL : la sortie du tool part dans
 * `agent_run_events` (persisté 30 jours, lu par tout membre du projet) et dans
 * `agent_runs.checkpoint`, où elle reste tant que la conversation vit.
 *
 * D'où la forme du correctif : **substituer, jamais refuser**. `git remote -v` est
 * une commande légitime — c'est sa sortie qui ne doit pas porter le secret. Une
 * garde en lecture sur `.git/` fermerait une porte sur trois, casserait `git log`
 * au passage, et laisserait `run_command` grande ouverte.
 *
 * Corollaire, et c'est ce qui rend la chose étanche : la substitution est posée à
 * la frontière de sortie de la boucle, AVANT le modèle. Il ne voit donc plus le
 * token du tout — il ne peut plus le recopier dans un fichier, un commit ou sa
 * propre réponse.
 *
 * Module PUR : il descend dans le bundle de la microVM avec la boucle
 * (`vm-bundle-secrets.test.ts`), il n'atteint donc ni base ni environnement.
 */

/** Ce qui remplace un secret. Reconnaissable, et lisible par un humain qui débogue. */
export const REDACTED_MARK = "[redacted]";

/**
 * Plancher de longueur. Un « secret » de trois caractères substituerait des bouts
 * de mots partout dans les sorties — le remède serait pire que le mal. Aucun token
 * de forge n'est court : `ghs_…` fait une quarantaine de caractères, un access
 * token GitLab une soixantaine.
 */
const MIN_SECRET_LENGTH = 12;

/**
 * Les secrets portés par une URL de clone token-authentifiée
 * (`https://x-access-token:<token>@github.com/…`, `https://oauth2:<token>@…`).
 *
 * Le mot de passe, sous ses DEUX formes : telle que `URL` la rend (percent-encodée,
 * c'est ce que git écrit dans `.git/config`) et décodée (c'est le token brut, celui
 * qui peut aussi apparaître seul dans un en-tête ou un message d'erreur). Les deux
 * sont identiques pour un token alphanumérique — la duplication ne coûte rien et
 * couvre le jour où elle ne l'est plus.
 *
 * L'utilisateur (`x-access-token`, `oauth2`) n'est jamais un secret : c'est une
 * constante du protocole, et la substituer rendrait les URL illisibles pour rien.
 */
export function authUrlSecrets(authUrl: string | null | undefined): string[] {
  if (!authUrl) return [];
  let password: string;
  try {
    password = new URL(authUrl).password;
  } catch {
    return [];
  }
  if (!password) return [];
  const out = [password];
  try {
    const decoded = decodeURIComponent(password);
    if (decoded !== password) out.push(decoded);
  } catch {
    // Percent-encodage malformé : la forme brute suffit.
  }
  return out;
}

/**
 * Le registre des secrets d'un run, et il est MUTABLE à dessein.
 *
 * Un tour dure des heures, un token d'installation de forge une heure : il est
 * re-minté avant chaque push (`pushWork` dans la microVM, `freshTarget` en fin de
 * tour dans la fonction). Tout token VU reste dans le registre — un `.git/config`
 * lu au round 3 porte celui du clone, pas celui du dernier push.
 */
export class SecretRedactor {
  private readonly secrets = new Set<string>();

  /** Enregistre une valeur brute. Ignorée si trop courte pour être un secret. */
  add(value: string | null | undefined): void {
    if (value && value.length >= MIN_SECRET_LENGTH) this.secrets.add(value);
  }

  /** Enregistre le token porté par une URL de clone. Ne lève jamais. */
  addAuthUrl(authUrl: string | null | undefined): void {
    for (const secret of authUrlSecrets(authUrl)) this.add(secret);
  }

  /** Nombre de secrets suivis — utile aux tests et au débogage, à rien d'autre. */
  get size(): number {
    return this.secrets.size;
  }

  /**
   * Le texte, secrets substitués. `split`/`join` plutôt qu'une regex : un token
   * est une chaîne littérale, et une regex construite dessus demanderait de
   * l'échapper — un caractère spécial oublié et la substitution rate en silence,
   * ce qui est exactement le mode d'échec qu'on ne veut pas ici.
   */
  redact = (text: string): string => {
    if (!text || this.secrets.size === 0) return text;
    let out = text;
    for (const secret of this.secrets) {
      if (out.includes(secret)) out = out.split(secret).join(REDACTED_MARK);
    }
    return out;
  };
}

/** Ce que la boucle reçoit : de quoi substituer, sans rien savoir du registre. */
export type RedactText = (text: string) => string;

/**
 * La substitution appliquée aux CHAÎNES d'une valeur quelconque, **en
 * profondeur** — un `preview` de tool, un résultat d'outil de Numo, un payload
 * d'event : tous sont des objets imbriqués, et c'est au fond qu'un secret se
 * cache.
 *
 * « En profondeur » était FAUX jusqu'à MIN-328 : le commentaire l'annonçait, le
 * code ne descendait que d'un niveau. Une substitution qui ne descend pas est
 * pire que pas de substitution : elle donne l'apparence de la garantie.
 *
 * Ici plutôt que dans le superviseur (MIN-343) : Numo en a besoin aussi, et une
 * SECONDE substitution écrite à côté serait la faute d'origine recommencée.
 */
export function redactDeep(value: unknown, redact: RedactText): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, redact));
  // `null` est un objet ; une Date, un Buffer et consorts n'ont rien à gagner à
  // être recopiés champ à champ — seuls les objets simples sont descendus.
  if (value === null || typeof value !== "object") return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactDeep(item, redact);
  }
  return out;
}
