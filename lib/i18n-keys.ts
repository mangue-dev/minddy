import type { Messages, NamespaceKeys, NestedKeyOf, useTranslations } from "next-intl";

/**
 * Tooling types for i18n keys built ELSEWHERE than on site:
 * tables de correspondance (`{ quotaExceeded: "errorQuotaExceeded" }`),
 * shortcut catalogs, section lists. Strict typing of next-intl
 * (cf. `global.d.ts`) checks `t("cle")` written hard; these types extend the
 * same check for keys that pass through a constant.
 *
 * The gain is not cosmetic: a table declared `Record<string, string>`
 * accepts a key that does not exist, and the screen then displays the path to the
 * key (`Agent.errorTypo`) instead of message. Declared `MessageKey<"Agent">`,
 * the same fault does not compile.
 *
 * The irreducible case remains: a key assembled at runtime from a
 * server value (`t(\`errors.${code}\`)`). No guy can guarantee it — we
 * the caste explicitly at the point of call with `Parameters<typeof t>[0]`, this
 * which makes visible the exact place where the compiler stops responding.
 */

/** The catalog namespaces (`"Board"`, `"Common"`, `"Agent"`…). */
export type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/** The keys that `t()` accepts for the namespace `N`. */
export type MessageKey<N extends Namespace> = Parameters<
  ReturnType<typeof useTranslations<N>>
>[0];
