"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BookFormat } from "@/generated/prisma/enums";
import { type ShelfFilters, shelfHref } from "@/server/library/shelf-filters";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type SubmitEvent, useEffect, useRef, useState } from "react";
import { FORMAT_LABELS } from "../formats";

// How long typing has to pause before the search runs.
const SEARCH_DELAY_MS = 500;

export function ShelfFilterBar({ filters }: Readonly<{ filters: ShelfFilters }>) {
  const router = useRouter();
  const { shelf, formats, search } = filters;
  const [text, setText] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The search this box last asked for, so its own navigation doesn't reset
  // what's being typed meanwhile.
  const requested = useRef(search);

  const toggleFormat = (format: BookFormat, checked: boolean) => {
    const next = checked ? [...formats, format] : formats.filter((item) => item !== format);
    // Includes what's typed but not searched yet.
    requested.current = text.trim();
    router.push(shelfHref({ shelf, formats: next, search: requested.current, perPage: filters.perPage }));
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
  const current = useRef({ shelf, formats, perPage: filters.perPage });
  useEffect(() => {
    current.current = { shelf, formats, perPage: filters.perPage };
  }, [shelf, formats, filters.perPage]);

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
    if (value.trim()) timer.current = setTimeout(() => runSearch(value), SEARCH_DELAY_MS);
    else runSearch("");
  };

  // Enter searches without waiting. The form also works without JavaScript,
  // through its hidden fields; this stops that native submission.
  const submitSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(text);
  };

  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
      <search>
        <form action='/books/shelves' method='get' onSubmit={submitSearch} className='flex gap-2 sm:w-80'>
          <input type='hidden' name='shelf' value={shelf} />
          {formats.map((format) => (
            <input key={format} type='hidden' name='format' value={format} />
          ))}
          <Input
            name='q'
            type='search'
            aria-label='Search by title or author'
            placeholder='Search by title or author'
            value={text}
            onChange={changeText}
          />
        </form>
      </search>

      <fieldset className='flex flex-wrap gap-x-4 gap-y-2'>
        <legend className='sr-only'>Owned formats</legend>
        {Object.values(BookFormat).map((format) => (
          <Field key={format} orientation='horizontal' className='w-auto'>
            <Checkbox
              id={`filter-${format as string}`}
              checked={formats.includes(format)}
              onCheckedChange={(checked) => toggleFormat(format, checked)}
            />
            <FieldLabel htmlFor={`filter-${format as string}`} className='font-normal'>
              {FORMAT_LABELS[format]}
            </FieldLabel>
          </Field>
        ))}
      </fieldset>
    </div>
  );
}
