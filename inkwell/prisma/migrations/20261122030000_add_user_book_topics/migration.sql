-- AlterTable
ALTER TABLE "UserBook" ADD COLUMN     "genreEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "genreId" TEXT,
ADD COLUMN     "tagSearch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tagsEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tropeEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tropeId" TEXT;

-- AddForeignKey
ALTER TABLE "UserBook" ADD CONSTRAINT "UserBook_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBook" ADD CONSTRAINT "UserBook_tropeId_fkey" FOREIGN KEY ("tropeId") REFERENCES "Trope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
