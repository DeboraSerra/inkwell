import { BooksShelves } from "@/components/pages/books/shelves";
import { requireUser } from "@/server/auth/auth.guard";
import { listShelfPage } from "@/server/library/library.service";
import { parseShelfFilters } from "@/server/library/shelf-filters";

export default async function ShelvesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  const user = await requireUser();
  const filters = parseShelfFilters(await searchParams);
  const { status, formats, search } = filters;
  const shelf = await listShelfPage(
    user.id,
    { status, formats, search },
    filters.page,
  );

  return <BooksShelves filters={filters} shelf={shelf} />;
}
