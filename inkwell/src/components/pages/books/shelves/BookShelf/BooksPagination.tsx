import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { pageLinks, shelfHref } from "@/server/library/shelf-filters";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useLoadedShelf } from "../../../context";

export const BooksPagination = () => {
  const {
    filters,
    shelf: { page, pageCount },
  } = useLoadedShelf();
  const router = useRouter();

  const hrefFor = (target: number) => shelfHref({ ...filters, page: target });

  // A real link, so opening a page in a new tab still works.
  const goTo = (target: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    router.push(hrefFor(target));
  };

  return (

      
      <Pagination className='md:mx-0 w-fit mx-auto'>
        <PaginationContent>
          {page > 1 && (
            <PaginationItem>
              <PaginationPrevious
                href={hrefFor(page - 1)}
                onClick={goTo(page - 1)}
              />
            </PaginationItem>
          )}
          {pageLinks(page, pageCount).map((link, index) => (
            <PaginationItem
              key={link === "ellipsis" ? `ellipsis-${index}` : link}
            >
              {link === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href={hrefFor(link)}
                  onClick={goTo(link)}
                  isActive={link === page}
                >
                  {link}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          {page < pageCount && (
            <PaginationItem>
              <PaginationNext
                href={hrefFor(page + 1)}
                onClick={goTo(page + 1)}
              />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
  );
};
