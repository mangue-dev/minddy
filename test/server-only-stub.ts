/**
 * `server-only` only exists through the Next bundler: a module which
 * imports is unreadable under vitest ("Cannot find package 'server-only'").
 * Aliasing it on this empty file makes server modules which are
 * PURE despite the guardrail — `lib/server/agent/tools.ts`, including `agentToolsFor`
 * decides the set of tools used for the model (MIN-115).
 *
 * This does not change anything in the build: the alias only lives in vitest.config.ts, and the
 * real guardrail remains in place on the Next side.
 */
export {};
