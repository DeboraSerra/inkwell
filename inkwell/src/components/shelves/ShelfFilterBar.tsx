"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BookFormat } from "@/generated/prisma/enums";
import { type ShelfFilters, shelfHref } from "@/server/library/shelf-filters";
import { useRouter } from "next/navigation";
import type { SubmitEvent } from "react";
import { FORMAT_LABELS } from "./formats";

export function ShelfFilterBar({ filters }: Readonly<{ filters: ShelfFilters }>) {
  const router = useRouter();
  const { shelf, formats, search } = filters;

  const toggleFormat = (format: BookFormat, checked: boolean) => {
    const next = checked ? [...formats, format] : formats.filter((item) => item !== format);
    router.push(shelfHref({ shelf, formats: next, search }));
  };

  const submitSearch = (event: SubmitEvent<HTMLFormElement>) => {
    const q = new FormData(event.currentTarget).get("q");
    router.push(shelfHref({ shelf, formats, search: typeof q === "string" ? q.trim() : "" }));
  };

  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
      <search>
        <form onSubmit={submitSearch} className='flex gap-2 sm:w-80'>
          <Input
            key={search}
            name='q'
            type='search'
            aria-label='Search by title or author'
            placeholder='Title or author'
            defaultValue={search}
          />
          <Button type="submit">Search</Button>
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
