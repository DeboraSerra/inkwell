import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { pageLinks, shelfHref } from "@/server/library/shelf-filters";
import { useRouter } from "next/navigation";
import { MouseEvent } from "react";
import { useLoadedShelf } from "../../../context";

const booksPerPage = [
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "20", value: 20 },
  { label: "30", value: 30 },
  { label: "50", value: 50 },
];

export const BooksPagination = () => {
  const {
    filters,
    shelf: { page, pageCount },
  } = useLoadedShelf();
  const isMobile = useIsMobile();
  const router = useRouter();

  const hrefFor = (target: number) => shelfHref({ ...filters, page: target });

  // A real link, so opening a page in a new tab still works.
  const goTo = (target: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    router.push(hrefFor(target));
  };

  return (
    <div className='flex gap-4'>
      <Select
        items={booksPerPage}
        defaultValue={booksPerPage.find((it) =>
          isMobile ? it.value === 10 : it.value === 30,
        )}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='min-w-0 w-fit'>
          <SelectGroup>
            {booksPerPage.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                className='text-center'
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Pagination className='mx-0 w-fit'>
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
    </div>
  );
};
