-- MIN-575: Smart Triage is ALWAYS available — the project setting only
-- chooses the engine, rules or AI. The "off" mode is retired: a switch that
-- said "disabled" while the smart view sort kept reordering by rules was a
-- lie. Existing projects on `off` (the former default) land on `rules` —
-- the free engine, exactly what they were effectively using.

ALTER TABLE "public"."projects"
    ALTER COLUMN "smart_triage_mode" SET DEFAULT 'rules'::"text";

UPDATE "public"."projects"
    SET "smart_triage_mode" = 'rules'::"text"
    WHERE "smart_triage_mode" = 'off'::"text";

ALTER TABLE "public"."projects"
    DROP CONSTRAINT IF EXISTS "projects_smart_triage_mode_check";

ALTER TABLE "public"."projects"
    ADD CONSTRAINT "projects_smart_triage_mode_check"
    CHECK ("smart_triage_mode" = ANY (ARRAY['rules'::"text", 'jev'::"text"]));
