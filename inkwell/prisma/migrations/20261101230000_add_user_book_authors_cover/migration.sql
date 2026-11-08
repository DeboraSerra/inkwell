-- AlterTable
ALTER TABLE "UserBook" ADD COLUMN     "authorSearch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "authors" TEXT[],
ADD COLUMN     "coverUrl" TEXT;

