"use client";

import { BookCover } from "@/components/BookCover";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  addSearchBook,
  previewSearchResult,
} from "@/server/library/library.controller";
import type {
  IsbnPreview,
  SearchResult,
} from "@/server/library/library.service";
import { LIST_NAMES } from "@/server/library/status.rules";
import { ArrowLeft, Loader } from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { AddPreviewedBook, BookPreview } from "./BookPreview";

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: SearchResult[] }
  | { kind: "error"; message: string };

// What to search for. A new object with the same text searches again, as
// after adding a book, so the results show it as in the library.
type SearchRequest = { text: string };

// Searches as the reader types: after a pause, from 3 characters, and
// cancelling the previous search when a new one starts.
function useBookSearch(request: SearchRequest) {
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  useEffect(() => {
    const text = request.text.trim();
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
  }, [request]);

  return state;
}

function ResultItem({
  result,
  disabled,
  onChoose,
}: Readonly<{
  result: SearchResult;
  disabled: boolean;
  onChoose: (result: SearchResult) => void;
}>) {
  return (
    <li>
      <button
        type='button'
        disabled={disabled}
        onClick={() => onChoose(result)}
        className='flex w-full gap-3 rounded-lg border p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'
      >
        <BookCover
          src={result.coverUrl ?? null}
          lazy
          className='h-24 w-16 shrink-0'
          width={64}
          height={96}
        />
        <span className='flex min-w-0 flex-col gap-1'>
          <span className='font-semibold leading-snug'>{result.title}</span>
          {result.authors.length > 0 && (
            <span className='text-sm'>{result.authors.join(", ")}</span>
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
      </button>
    </li>
  );
}

export default function SearchLookup({
  onFillByHand,
}: Readonly<{ onFillByHand: () => void }>) {
  const [request, setRequest] = useState<SearchRequest>({ text: "" });
  const search = useBookSearch(request);
  const [preview, setPreview] = useState<IsbnPreview | null>(null);
  const [previewError, setPreviewError] = useState<string>();
  const [isOpening, startOpening] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setRequest({ text: event.target.value });
    setPreview(null);
    setPreviewError(undefined);
  };

  const choose = (result: SearchResult) =>
    startOpening(async () => {
      setPreviewError(undefined);
      const { preview: found, error } = await previewSearchResult({
        source: result.source,
        sourceId: result.sourceId,
        isbn13: result.isbn13,
      });
      if (found) setPreview(found);
      else setPreviewError(error ?? "That book couldn't be opened.");
    });

  const backToResults = useCallback(() => {
    setPreview(null);
    inputRef.current?.focus();
  }, []);

  const handleAdded = useCallback(() => {
    backToResults();
    setRequest((current) => ({ ...current }));
  }, [backToResults]);

  return (
    <div className='flex flex-col gap-6'>
      <search>
      <form
        onSubmit={(event) => event.preventDefault()}
        className='flex max-w-150 flex-col gap-3'
      >
        <TextField
          ref={inputRef}
          id='search-books'
          name='q'
          label='Title or author'
          autoComplete='off'
          invalid={search.kind === "error"}
          onChange={handleChange}
          info={<p>Searches Open Library, then Google Books.</p>}
        />
        <FieldError>
          {search.kind === "error" ? search.message : previewError}
        </FieldError>
      </form>
      </search>

      {preview ? (
        <div className='flex flex-col gap-6'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='w-fit'
            onClick={backToResults}
          >
            <ArrowLeft /> Back to results
          </Button>
          <BookPreview preview={preview} />
          <AddPreviewedBook
            preview={preview}
            action={addSearchBook}
            onAdded={handleAdded}
          />
        </div>
      ) : (
        <SearchResults
          search={search}
          isOpening={isOpening}
          onChoose={choose}
          onFillByHand={onFillByHand}
        />
      )}
    </div>
  );
}

function SearchResults({
  search,
  isOpening,
  onChoose,
  onFillByHand,
}: Readonly<{
  search: SearchState;
  isOpening: boolean;
  onChoose: (result: SearchResult) => void;
  onFillByHand: () => void;
}>) {
  if (search.kind === "loading") {
    return (
      <p className='flex items-center gap-2 text-sm text-muted-foreground' role='status'>
        <Loader className='spin-in' /> Searching…
      </p>
    );
  }
  if (search.kind !== "results") return null;
  if (search.results.length === 0) {
    return (
      <div className='flex flex-col items-start gap-3 rounded-lg border p-4' role='status'>
        <p className='text-sm'>
          No books found. Try the author's surname, or add it by hand.
        </p>
        <Button type='button' variant='outline' onClick={onFillByHand}>
          Fill in by hand
        </Button>
      </div>
    );
  }
  return (
    <ul className='grid grid-cols-1 gap-3 md:grid-cols-2' aria-busy={isOpening}>
      {search.results.map((result) => (
        <ResultItem
          key={`${result.source}:${result.sourceId}`}
          result={result}
          disabled={isOpening}
          onChoose={onChoose}
        />
      ))}
    </ul>
  );
}
