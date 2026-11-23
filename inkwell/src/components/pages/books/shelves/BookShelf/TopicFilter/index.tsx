"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { rememberTopicScope } from "@/server/library/library.controller";
import { onlyInUse, shownTropes as tropesToShow, tropesForGenres } from "@/server/library/topic-filter.rules";
import { Funnel } from "lucide-react";
import { useState } from "react";
import { FilterChip, FilterList } from "./FilterList";
import type { TopicLists, TopicNames } from "@/types/shelf.type";

const toggled = (list: string[], name: string) =>
  list.includes(name) ? list.filter((item) => item !== name) : [...list, name];

// Genres and tropes as toggle chips in a popover. A book matches any genre
// ticked and any trope ticked; ticking genres narrows the tropes to theirs. A popover rather than a menu, since its
// content is buttons, not menu items.
export function TopicFilter({
  topics,
  libraryTopics,
  onlyMine: initialOnlyMine,
  genres,
  tropes,
  onChange,
}: Readonly<{
  topics: TopicLists;
  // The names in use in the reader's library, and whether to list only those.
  libraryTopics: TopicNames;
  onlyMine: boolean;
  genres: string[];
  tropes: string[];
  onChange: (genres: string[], tropes: string[]) => void;
}>) {
  const count = genres.length + tropes.length;
  const [onlyMine, setOnlyMine] = useState(initialOnlyMine);
  // What's ticked is always listed, so it can be unticked whatever the switch.
  const listed = onlyMine
    ? onlyInUse(topics, { genres: [...libraryTopics.genres, ...genres], tropes: [...libraryTopics.tropes, ...tropes] })
    : topics;
  const shownTropes = tropesToShow(listed, genres, tropes);
  const switchScope = (checked: boolean) => {
    setOnlyMine(checked);
    // Only a preference: if saving fails, the switch still works on this visit.
    rememberTopicScope(checked).catch(() => undefined);
  };
  // Unticking a genre drops the ticked tropes no remaining genre has.
  const toggleGenre = (genre: string) => {
    const next = toggled(genres, genre);
    onChange(next, tropesForGenres(topics, next, tropes));
  };

  return (
    <div className='flex items-center gap-1'>
      {count > 0 && (
        <Button variant='ghost' size='sm' onClick={() => onChange([], [])}>
          Clear filters
        </Button>
      )}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant='ghost'
              size='icon'
              className='relative'
              aria-label={count ? `Filter books, ${count} selected` : "Filter books"}
            />
          }
        >
          <Funnel />
          {count > 0 && (
            <span
              aria-hidden='true'
              className='absolute -top-1 -right-2 flex size-4 items-center justify-center rounded-full bg-chip-selected text-[10px] font-medium text-chip-selected-foreground'
            >
              {count}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent align='end' aria-label='Filter books' className='w-fit max-w-[calc(85vw-2rem)] max-h-[min(28rem,70vh)] overflow-y-auto'>
          <Field orientation='horizontal' className='w-auto p-2'>
            <Switch id='topic-scope' checked={onlyMine} onCheckedChange={switchScope} />
            <FieldLabel htmlFor='topic-scope' className='font-normal'>
              Only genres in my books
            </FieldLabel>
          </Field>
          <div className='flex flex-col gap-2 p-2 sm:flex-row'>
            <p className='text-xs font-medium text-muted-foreground sm:w-14 sm:shrink-0 sm:pt-1'>Genre</p>
            <FilterList label='Genres'>
              {listed.genres.map((genre) => (
                <FilterChip
                  key={genre}
                  selected={genres.includes(genre)}
                  onToggle={() => toggleGenre(genre)}
                >
                  {genre}
                </FilterChip>
              ))}
            </FilterList>
          </div>
          <div className='flex flex-col gap-2 p-2 sm:flex-row'>
            <p className='text-xs font-medium text-muted-foreground sm:w-14 sm:shrink-0 sm:pt-1'>Trope</p>
            {shownTropes.length > 0 ? (
              <FilterList label='Tropes'>
                {shownTropes.map(({ name }) => (
                  <FilterChip
                    key={name}
                    selected={tropes.includes(name)}
                    onToggle={() => onChange(genres, toggled(tropes, name))}
                  >
                    {name}
                  </FilterChip>
                ))}
              </FilterList>
            ) : (
              <p className='text-xs text-muted-foreground sm:pt-1'>{genres.length > 0 ? 'No tropes for these genres.' : 'No genre selected'}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
