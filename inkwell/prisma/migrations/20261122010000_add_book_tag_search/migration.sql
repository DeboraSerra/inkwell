-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "tagSearch" TEXT NOT NULL DEFAULT '';

-- Backfill from the tags already saved (enrichment stores them lower case and
-- single-spaced): "|tag one|tag two|".
UPDATE "Book"
SET "tagSearch" = '|' || array_to_string(ARRAY(SELECT replace(lower(t), '|', ' ') FROM unnest("tags") AS t), '|') || '|'
WHERE "tags" IS NOT NULL AND cardinality("tags") > 0;
