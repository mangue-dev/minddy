-- MIN-510: the "smart" ticket order (priority, lifted by imminent due dates
-- and open "blocks" relations) becomes the default sort of every board.
ALTER TABLE "public"."views" ALTER COLUMN "sort" SET DEFAULT 'smart';

-- Views still on the old default move to the new one: those rows carry the
-- seed value, not a deliberate choice. "manual" stays available in the UI for
-- anyone who wants their drag order back.
UPDATE "public"."views" SET "sort" = 'smart' WHERE "sort" = 'manual';
