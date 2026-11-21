"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BookFormat } from "@/generated/prisma/enums";
import { shelfHref } from "@/server/library/shelf-filters";
import type { ShelfFilters, TopicLists } from "@/types/shelf.type";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type SubmitEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { FORMAT_LABELS } from "../formats";
import { ShelfOrderControls } from "./ShelfOrderControls";
import { TopicFilter } from "./TopicFilter";

// How long typing has to pause before the search runs.
const SEARCH_DELAY_MS = 500;

export function ShelfFilterBar({
  filters,
  topics,
}: Readonly<{
  filters: ShelfFilters;
  topics: TopicLists;
}>) {
  const router = useRouter();
  const { shelf, formats, genres, tropes, search } = filters;
  const [text, setText] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The search this box last asked for, so its own navigation doesn't reset
  // what's being typed meanwhile.
  const requested = useRef(search);

  const toggleFormat = (format: BookFormat, checked: boolean) => {
    const next = checked
      ? [...formats, format]
      : formats.filter((item) => item !== format);
    // Includes what's typed but not searched yet.
    requested.current = text.trim();
    router.push(
      shelfHref({
        shelf,
        formats: next,
        genres,
        tropes,
        search: requested.current,
        perPage: filters.perPage,
        sort: filters.sort,
      }),
    );
  };

  const changeTopics = (nextGenres: string[], nextTropes: string[]) => {
    requested.current = text.trim();
    router.push(
      shelfHref({
        shelf,
        formats,
        genres: nextGenres,
        tropes: nextTropes,
        search: requested.current,
        perPage: filters.perPage,
        sort: filters.sort,
      }),
    );
  };

  // A search changed from outside (back and forward, a link) shows in the box.
  useEffect(() => {
    if (search !== requested.current) {
      requested.current = search;
      setText(search);
    }
  }, [search]);

  // A pending search runs on the shelf and filters showing when it fires, not
  // the ones it was typed on.
  const current = useRef({
    shelf,
    formats,
    genres,
    tropes,
    perPage: filters.perPage,
    sort: filters.sort,
  });
  useEffect(() => {
    current.current = {
      shelf,
      formats,
      genres,
      tropes,
      perPage: filters.perPage,
      sort: filters.sort,
    };
  }, [shelf, formats, genres, tropes, filters.perPage, filters.sort]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Replaces the history entry, so Back doesn't step through every pause in typing.
  const runSearch = (value: string) => {
    clearTimeout(timer.current);
    const next = value.trim();
    if (next === requested.current) return;
    requested.current = next;
    router.replace(shelfHref({ ...current.current, search: next }));
  };

  // Emptying the box in any way (its ✕, Escape, deleting the text) shows the
  // whole shelf at once. Not the "search" event, which Firefox doesn't fire.
  const changeText = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.currentTarget;
    setText(value);
    clearTimeout(timer.current);
    if (value.trim())
      timer.current = setTimeout(() => runSearch(value), SEARCH_DELAY_MS);
    else runSearch("");
  };

  // Enter searches without waiting. The form also works without JavaScript,
  // through its hidden fields; this stops that native submission.
  const submitSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(text);
  };

  return (
    <div className='flex flex-col gap-3'>
      <search>
        <form
          action='/books/shelves'
          method='get'
          onSubmit={submitSearch}
          className='flex gap-2 sm:w-80'
        >
          <input type='hidden' name='shelf' value={shelf} />
          {formats.map((format) => (
            <input key={format} type='hidden' name='format' value={format} />
          ))}
          {genres.map((genre) => (
            <input key={genre} type='hidden' name='genre' value={genre} />
          ))}
          {tropes.map((trope) => (
            <input key={trope} type='hidden' name='trope' value={trope} />
          ))}
          <Input
            name='q'
            type='search'
            aria-label='Search by title, author or tag'
            placeholder='Search by title, author or tag'
            value={text}
            onChange={changeText}
          />
        </form>
      </search>

      <div className='flex justify-between items-center'>
        <fieldset className='flex flex-wrap gap-x-4 gap-y-2'>
          <legend className='sr-only'>Owned formats</legend>
          {Object.values(BookFormat).map((format) => (
            <Field key={format} orientation='horizontal' className='w-auto'>
              <Checkbox
                id={`filter-${format as string}`}
                checked={formats.includes(format)}
                onCheckedChange={(checked) => toggleFormat(format, checked)}
              />
              <FieldLabel
                htmlFor={`filter-${format as string}`}
                className='font-normal'
              >
                {FORMAT_LABELS[format].title}
              </FieldLabel>
            </Field>
          ))}
        </fieldset>
        <div className='flex gap-1 items-center'>
          <TopicFilter
            topics={topics}
            genres={genres}
            tropes={tropes}
            onChange={changeTopics}
          />
          <ShelfOrderControls />
        </div>
      </div>
    </div>
  );
}
