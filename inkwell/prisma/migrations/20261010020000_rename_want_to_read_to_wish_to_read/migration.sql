-- Rename the enum value in place, so existing rows keep their status.
ALTER TYPE "ReadingStatus" RENAME VALUE 'WANT_TO_READ' TO 'WISH_TO_READ';
