"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Funnel } from "lucide-react";
import { FilterChip, FilterList } from "./FilterList";
import type { TopicLists } from "@/types/shelf.type";

const toggled = (list: string[], name: string) =>
  list.includes(name) ? list.filter((item) => item !== name) : [...list, name];

// Genres and tropes as toggle chips in a popover. A book matches any genre
// ticked and any trope ticked; ticking genres narrows the tropes to theirs. A popover rather than a menu, since its
// content is buttons, not menu items.
export function TopicFilter({
  topics,
  genres,
  tropes,
  onChange,
}: Readonly<{
  topics: TopicLists;
  genres: string[];
  tropes: string[];
  onChange: (genres: string[], tropes: string[]) => void;
}>) {
  const count = genres.length + tropes.length;
  // With genres ticked, only their tropes, plus any trope already ticked so it
  // can still be unticked.
  const shownTropes = genres.length
    ? topics.tropes.filter(
        (trope) => tropes.includes(trope.name) || trope.genres.some((genre) => genres.includes(genre)),
      )
    : topics.tropes;

  return (
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
            className='absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-chip-selected text-[10px] font-medium text-chip-selected-foreground'
          >
            {count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align='end' className='w-fit max-w-[calc(85vw-2rem)] max-h-[min(28rem,70vh)] overflow-y-auto'>
        <div className='flex flex-col gap-2 p-2 sm:flex-row'>
          <p className='text-xs font-medium text-muted-foreground sm:w-14 sm:shrink-0 sm:pt-1'>Genre</p>
          <FilterList label='Genres'>
            {topics.genres.map((genre) => (
              <FilterChip
                key={genre}
                selected={genres.includes(genre)}
                onToggle={() => onChange(toggled(genres, genre), tropes)}
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
            <p className='text-xs text-muted-foreground sm:pt-1'>No tropes for these genres.</p>
          )}
        </div>
        {count > 0 && (
          <div className='flex justify-end p-2'>
            <Button variant='ghost' size='sm' onClick={() => onChange([], [])}>
              Clear filters
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  // return (
  //   <Combobox
  //     multiple
  //     autoHighlight
  //     items={groups}
  //     value={selected}
  //     onValueChange={change}
  //     itemToStringLabel={(topic: TopicOption) => topic.name}
  //     isItemEqualToValue={sameTopic}
  //   >
  //     <ComboboxChips ref={anchor} className='w-full sm:w-80'>
  //       <ComboboxValue>
  //         {(values: TopicOption[]) => (
  //           <>
  //             {values.map((topic) => (
  //               <ComboboxChip key={`${topic.kind}:${topic.name}`} aria-label={`${topic.name}, ${topic.kind}`}>
  //                 {topic.name}
  //               </ComboboxChip>
  //             ))}
  //             <ComboboxChipsInput
  //               aria-label='Filter by genre or trope'
  //               placeholder={values.length ? "" : "Genres and tropes"}
  //             />
  //           </>
  //         )}
  //       </ComboboxValue>
  //     </ComboboxChips>
  //     <ComboboxContent anchor={anchor} className='max-w-[calc(100vw-2rem)]'>
  //       <ComboboxEmpty>No genre or trope found.</ComboboxEmpty>
  //       <ComboboxList>
  //         {(group: TopicGroup) => (
  //           <ComboboxGroup key={group.value} items={group.items}>
  //             <ComboboxLabel>{group.value}</ComboboxLabel>
  //             <ComboboxCollection>
  //               {(topic: TopicOption) => (
  //                 <ComboboxItem key={`${topic.kind}:${topic.name}`} value={topic}>
  //                   {topic.name}
  //                 </ComboboxItem>
  //               )}
  //             </ComboboxCollection>
  //           </ComboboxGroup>
  //         )}
  //       </ComboboxList>
  //     </ComboboxContent>
  //   </Combobox>
  // );
}
