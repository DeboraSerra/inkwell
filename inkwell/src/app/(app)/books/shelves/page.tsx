import { BooksShelf } from "@/components/shelves/BookShelf";
import { ShelfFilterBar } from "@/components/shelves/ShelfFilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/server/auth/auth.guard";
import { listShelfPage } from "@/server/library/library.service";
import {
  parseShelfFilters,
  shelfHref,
  SHELVES,
} from "@/server/library/shelf-filters";
import Link from "next/link";

export default async function ShelvesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  const user = await requireUser();
  const filters = parseShelfFilters(await searchParams);
  const { status, formats, search } = filters;
  const { books, page, pageCount, total, firstIndex } = await listShelfPage(
    user.id,
    { status, formats, search },
    filters.page,
  );

  return (
    <div className='flex flex-col gap-4'>
      <h1 className='text-2xl font-semibold'>Shelves</h1>
      <Tabs value={filters.shelf} className="gap-5">
        <TabsList variant="line" className='h-auto! max-w-full flex-wrap justify-start'>
          {SHELVES.map((it) => (
            <TabsTrigger
              key={it.slug}
              value={it.slug}
              nativeButton={false}
              render={<Link href={shelfHref({ shelf: it.slug, formats, search })} />}
            >
              {it.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="w-full bg-abbey-400/30 h-px -mt-4.75" />
        <ShelfFilterBar filters={filters} />
        <TabsContent value={filters.shelf}>
          {/* A new key clears the selection when the shelf or page changes. */}
          <BooksShelf
            key={shelfHref({ ...filters, page })}
            filters={filters}
            books={books}
            page={page}
            pageCount={pageCount}
            total={total}
            firstIndex={firstIndex}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
