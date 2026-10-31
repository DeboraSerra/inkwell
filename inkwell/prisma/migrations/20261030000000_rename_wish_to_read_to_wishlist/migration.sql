-- Rename the enum value in place, so existing rows keep their status.
ALTER TYPE "ReadingStatus" RENAME VALUE 'WISH_TO_READ' TO 'WISHLIST';
