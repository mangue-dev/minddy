import type messages from "./messages/en.json";
import type { locales } from "./i18n/config";

/**
 * Strict next-intl typing: the English catalog (the reference locale,
 * cf. `defaultLocale`) becomes the TYPE of messages.
 *
 * What it buys, and why it's worth the cost: without this increase,
 * `AppConfig` is empty, `Messages` falls back to `Record<string, any>`, and the
 * signature `TranslateArgs` of use-intl takes its branch `string extends Value`
 * — where `values` is OPTIONAL. In other words `t("deleteViewTitle")` compiled
 * even though the message is `"Delete “{name}”?"`, and the dialog displayed
 * `Board.deleteViewTitle` on the screen (next-intl falls back to the path of the key
 * when formatting fails). A silent bug: no exception, no log, a
 * string that looks like a string.
 *
 * With the catalog as type, `ICUArgs` extracts `{name: string}` from the message, and
 * `values` becomes MANDATORY. The fault is now a compilation error
 * — therefore caught by `pnpm typecheck` locally AND automatically served to the
 * agent code at the end of the round (MIN-110, lib/server/agent/diagnostics.ts).
 *
 * The price, measured on this repository (`tsc --noEmit`, cache `.tsbuildinfo` purged):
 * 8.2 s without, 10.3 s with. +25% cold, indistinguishable hot — the cost
 * of instantiating 2,600 keys in literal types.
 *
 * What it DOES NOT do, and this is important: ARGUMENTS are not
 * checked. The messages come from a JSON import, whose TypeScript expands
 * any string value to `string`; `TranslateArgs` then takes its branch
 * `string extends Value`, where `values` is optional. No configuration
 * changes that. It is `lib/i18n-contract.test.ts` which holds this contract.
 *
 * Consequence to be aware of: a key constructed at execution (`t(\`errors.${code}\`)`)
 * is no longer typeable as is. The convention of the repository is to cast
 * explicitly to `Parameters<typeof t>[0]` — this is intentionally visible in
 * the code, because this is precisely the place where the compiler guarantees
 * nothing more.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
    Messages: typeof messages;
  }
}
