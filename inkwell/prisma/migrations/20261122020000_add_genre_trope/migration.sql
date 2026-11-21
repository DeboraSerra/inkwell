-- CreateTable
CREATE TABLE "GenreTrope" (
    "genreId" TEXT NOT NULL,
    "tropeId" TEXT NOT NULL,

    CONSTRAINT "GenreTrope_pkey" PRIMARY KEY ("genreId","tropeId")
);

-- CreateIndex
CREATE INDEX "GenreTrope_tropeId_idx" ON "GenreTrope"("tropeId");

-- AddForeignKey
ALTER TABLE "GenreTrope" ADD CONSTRAINT "GenreTrope_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenreTrope" ADD CONSTRAINT "GenreTrope_tropeId_fkey" FOREIGN KEY ("tropeId") REFERENCES "Trope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, so Supabase's Data API can't expose the table.
ALTER TABLE "GenreTrope" ENABLE ROW LEVEL SECURITY;
