-- MIN-575: Smart Triage is ALWAYS available — the project setting only
-- chooses the engine, rules or AI. The "off" mode is retired: a switch that
-- said "disabled" while the smart view sort kept reordering by rules was a
-- lie. Existing projects on `off` (the former default) land on `rules` —
-- the free engine, exactly what they were effectively using.
--
-- The check constraint is deliberately left three-valued (off | rules |
-- jev): this migration runs BEFORE the application swaps (migration-first
-- releases), and the PREVIOUS application still writes `off` from its
-- settings switch during the rollout window — tightening the constraint
-- here would turn that write into a 500. The contract is enforced by the
-- application instead (updateProjectSettings refuses `off`), and a retired
-- `off` row reads as the default (rules) anyway. A later contract migration
-- can tighten the constraint once the old code is gone.

ALTER TABLE "public"."projects"
    ALTER COLUMN "smart_triage_mode" SET DEFAULT 'rules'::"text";

UPDATE "public"."projects"
    SET "smart_triage_mode" = 'rules'::"text"
    WHERE "smart_triage_mode" = 'off'::"text";

-- Re-install the three-valued constraint: a no-op refresh on a fresh
-- install, and the repair path for a database that ran an earlier draft of
-- this migration (which tightened the constraint to two values).
ALTER TABLE "public"."projects"
    DROP CONSTRAINT IF EXISTS "projects_smart_triage_mode_check";

ALTER TABLE "public"."projects"
    ADD CONSTRAINT "projects_smart_triage_mode_check"
    CHECK ("smart_triage_mode" = ANY (ARRAY['off'::"text", 'rules'::"text", 'jev'::"text"]));

