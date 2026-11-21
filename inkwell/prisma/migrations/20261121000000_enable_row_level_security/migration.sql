-- Supabase serves the public schema through its Data API to anyone holding
-- the project's anon key. Row-level security with no policies blocks that API
-- entirely. The app connects through Prisma as the tables' owner, which RLS
-- doesn't apply to (no FORCE), so the app is unaffected.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Book" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Genre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookGenre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookTrope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserBook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReadThrough" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
