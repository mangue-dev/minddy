/**
 * D'où vient cette requête ? (MIN-345)
 *
 * Toute la protection CSRF de minddy reposait sur le `SameSite=Lax` du cookie
 * Supabase. C'est solide pour un `POST` — un formulaire ou un `fetch` venu d'un
 * autre site n'emporte pas le cookie — mais `Lax` a une exception, et c'est
 * exactement celle qui nous a coûté trois surfaces : **la navigation `GET` de
 * premier niveau**. Un lien cliqué depuis n'importe où arrive chez nous avec la
 * session complète.
 *
 * La réponse de fond est ailleurs (ne rien muter sur un `GET`). Ce module est le
 * contrôle qui manquait par-dessus : est-ce que le navigateur DIT venir de chez
 * nous ?
 *
 * ## Deux niveaux, et pourquoi ils ne sont pas le même
 *
 * `isSameOriginRequest` **exige** l'en-tête. À réserver aux surfaces dont on
 * sait qu'elles sont toujours atteintes par un navigateur — un formulaire de
 * l'app —, parce que tout navigateur envoie `Origin` sur une requête non-`GET`
 * depuis 2020, et qu'une requête sans en-tête y est donc une anomalie.
 *
 * `hasForeignOrigin` ne refuse que ce qui est **explicitement d'ailleurs**.
 * C'est la garde des routes d'API : une absence d'`Origin` y passe, à dessein.
 * Elle ne peut pas venir d'une page tierce (le navigateur l'aurait posée), et
 * la refuser ferait tomber des appelants légitimes qui n'ont pas de page — un
 * outil en ligne de commande, une sonde, un test. On refuse ce qui se déclare
 * étranger ; on ne demande pas ses papiers à qui ne se déclare pas.
 *
 * ## Ce à quoi on compare
 *
 * Au `host` de la requête elle-même, jamais à une liste de domaines. minddy est
 * servi sous plusieurs origines légitimes — `www.minddy.app`, les préversions
 * Vercel, `localhost` en développement, les domaines personnalisés des clients
 * — et une liste écrite quelque part serait fausse le jour où l'une d'elles
 * change. « La page qui appelle est servie par le même host que la route
 * appelée » n'a rien à tenir à jour.
 */

type HeaderBag = { headers: { get(name: string): string | null } };

function hostOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    return new URL(value).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

function expectedHost(request: HeaderBag): string | null {
  return request.headers.get("host")?.toLowerCase() || null;
}

/**
 * L'origine déclarée par le navigateur, ou celle du `Referer` à défaut —
 * certaines navigations n'ont que le second. `null` = rien de déclaré.
 */
function declaredHost(request: HeaderBag): string | null {
  return hostOf(request.headers.get("origin")) ?? hostOf(request.headers.get("referer"));
}

/** Vrai seulement si la requête DIT venir de chez nous. Une requête muette est
    refusée — voir l'en-tête du fichier pour savoir où c'est le bon choix. */
export function isSameOriginRequest(request: HeaderBag): boolean {
  const host = expectedHost(request);
  const declared = declaredHost(request);
  return Boolean(host && declared && host === declared);
}

/** Vrai quand la requête se déclare d'une AUTRE origine. Une requête muette
    rend `false` : rien à lui reprocher. */
export function hasForeignOrigin(request: HeaderBag): boolean {
  const declared = declaredHost(request);
  if (!declared) return false;
  const host = expectedHost(request);
  return Boolean(host) && declared !== host;
}

/** Les méthodes qui changent l'état, et donc celles qu'une page tierce ne doit
    jamais pouvoir déclencher au nom de quelqu'un. */
export function isMutatingMethod(method: string): boolean {
  const verb = method.toUpperCase();
  return verb !== "GET" && verb !== "HEAD" && verb !== "OPTIONS";
}
