"use client";

import { BookCover } from "@/components/common/BookCover";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { previewSearchResult } from "@/server/library/library.controller";
import { LIST_NAMES } from "@/server/library/status.rules";
import type { IsbnPreview, SearchResult } from "@/types/books.type";
import type { SearchState } from "@/types/ui.type";
import { Info, Loader } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
import { TapTooltip } from "@/components/common/TapTooltip";

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

// Searches as the reader types: after a pause, from 3 characters, and
// cancelling the previous search when a new one starts.
function useBookSearch(query: string) {
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/books/search?${new URLSearchParams({ q: text })}`,
          { signal: controller.signal },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState({
            kind: "error",
            message: body.error ?? "The search didn't work. Try again.",
          });
          return;
        }
        setState({ kind: "results", results: body.results ?? [] });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          kind: "error",
          message: "The search didn't work. Check your connection and try again.",
        });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return state;
}

function ResultRow({ result }: Readonly<{ result: SearchResult }>) {
  return (
    <span className='flex min-w-0 gap-3'>
      <BookCover
        src={result.coverUrl ?? null}
        lazy
        className='h-15 w-10 shrink-0'
        width={40}
        height={60}
      />
      <span className='flex min-w-0 flex-col gap-0.5'>
        <span className='font-semibold leading-snug'>{result.title}</span>
        {result.authors.length > 0 && (
          <span className='text-xs'>{result.authors.join(", ")}</span>
        )}
        {result.publishedYear && (
          <span className='text-xs text-muted-foreground'>
            {result.publishedYear}
          </span>
        )}
        {result.inLibrary && (
          <span className='w-fit rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'>
            In your library · {LIST_NAMES[result.inLibrary]}
          </span>
        )}
      </span>
    </span>
  );
}

const resultKey = (result: SearchResult) =>
  `${result.source}:${result.sourceId}`;

// The book form's title field, searching Open Library and Google Books as the
// reader types. Picking a result opens it (`previewSearchResult`) and hands it
// to `onFound`; not picking one leaves the typed title for a manual add.
export function TitleSearchField({
  id,
  defaultValue = "",
  invalid,
  onFound,
}: Readonly<{
  id: string;
  defaultValue?: string;
  invalid: boolean;
  // The title as typed, so a blank form can start from it again.
  onFound: (preview: IsbnPreview, title: string) => void;
}>) {
  const labelId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const search = useBookSearch(query);
  const [previewError, setPreviewError] = useState<string>();
  const [isOpening, startOpening] = useTransition();
  const results = search.kind === "results" ? search.results : [];

  const choose = (result: SearchResult) =>
    startOpening(async () => {
      setPreviewError(undefined);
      const { preview, error } = await previewSearchResult({
        source: result.source,
        sourceId: result.sourceId,
      });
      if (preview) onFound(preview, query);
      else setPreviewError(error ?? "That book couldn't be opened.");
    });

  // Enter picks a highlighted result (Base UI handles that); otherwise it
  // mustn't submit the half-filled form.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.preventDefault();
  };

  const error = search.kind === "error" ? search.message : previewError;
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        <span id={labelId}>Title</span>
        <span className='font-normal text-muted-foreground'>*</span>
        <TapTooltip
          label='About the title search'
          content={
            <p>
              Type a title or author to search Open Library and Google Books,
              or just the title to add it by hand.
            </p>
          }
        >
          <Info size={16} />
        </TapTooltip>
      </FieldLabel>
      <Combobox
        items={results}
        // The providers already matched the query.
        filter={null}
        value={null}
        onValueChange={(result: SearchResult | null) => {
          if (result) choose(result);
        }}
        itemToStringLabel={(result: SearchResult) => result.title}
        isItemEqualToValue={(a: SearchResult, b: SearchResult) =>
          resultKey(a) === resultKey(b)
        }
        inputValue={query}
        onInputValueChange={(value, details) => {
          // Only what the reader types: not Base UI resetting the text when
          // the list closes without a pick.
          if (details.reason === "input-change" || details.reason === "input-clear") {
            setQuery(value);
            setPreviewError(undefined);
          }
        }}
        open={open && search.kind !== "idle"}
        onOpenChange={setOpen}
      >
        <ComboboxInput
          id={id}
          name='title'
          // Base UI hides the rest of the page from screen readers while the
          // list is open, label included; a reference still names the field.
          // Only the label's text, without the ⓘ button's name.
          aria-labelledby={labelId}
          autoComplete='off'
          required
          aria-invalid={invalid || error ? true : undefined}
          showTrigger={false}
          className='w-full'
          disabled={isOpening}
          onKeyDown={handleKeyDown}
        />
        <ComboboxContent className='max-w-[calc(100vw-2rem)]'>
          {search.kind === "loading" && (
            <p
              className='flex items-center gap-2 p-3 text-sm text-muted-foreground'
              role='status'
            >
              <Loader className='spin-in' size={14} /> Searching…
            </p>
          )}
          {search.kind === "error" && (
            <p className='p-3 text-sm text-destructive' role='status'>
              {search.message}
            </p>
          )}
          {search.kind === "results" && results.length === 0 && (
            <p className='p-3 text-sm text-muted-foreground' role='status'>
              No books found. Try the author's surname, or fill in the rest by
              hand.
            </p>
          )}
          <ComboboxList>
            {(result: SearchResult) => (
              <ComboboxItem
                key={resultKey(result)}
                value={result}
                className='pr-1.5'
              >
                <ResultRow result={result} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {isOpening && (
        <p
          className='flex items-center gap-2 text-sm text-muted-foreground'
          role='status'
        >
          <Loader className='spin-in' size={14} /> Opening the book…
        </p>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
