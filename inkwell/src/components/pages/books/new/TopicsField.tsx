"use client";

import { TapTooltip } from "@/components/common/TapTooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Info } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useId, useMemo, useState } from "react";
import type { TopicLists } from "@/types/shelf.type";

const NONE = { label: "None", value: "" };

// The reader's genre and trope (one of each) and tags. Only for this reader:
// the shared book keeps the AI's. Choosing a genre narrows the tropes to that
// genre's, unless "Show all tropes" is ticked.
export function TopicsField({
  topics,
  genre: startGenre,
  trope: startTrope,
  tags,
}: Readonly<{ topics: TopicLists; genre?: string | null; trope?: string | null; tags?: string[] }>) {
  const uid = useId();
  const [genre, setGenre] = useState(startGenre ?? "");
  const [trope, setTrope] = useState(startTrope ?? "");
  const [allTropes, setAllTropes] = useState(false);

  const genreItems = useMemo(() => [NONE, ...topics.genres.map((name) => ({ label: name, value: name }))], [topics]);
  const tropeItems = useMemo(() => {
    const shown =
      genre && !allTropes
        ? topics.tropes.filter((item) => item.name === trope || item.genres.includes(genre))
        : topics.tropes;
    return [NONE, ...shown.map(({ name }) => ({ label: name, value: name }))];
  }, [topics, genre, trope, allTropes]);

  return (
    <div className='flex flex-col gap-4'>
      <input type='hidden' name='genre' value={genre} />
      <input type='hidden' name='trope' value={trope} />
      <div className='flex flex-wrap gap-4'>
        <Field className='w-auto'>
          <FieldLabel id={`${uid}-genre`}>Genre</FieldLabel>
          <Select items={genreItems} value={genre} onValueChange={(value: string | null) => setGenre(value ?? "")}>
            <SelectTrigger aria-labelledby={`${uid}-genre`} className='min-w-44'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className='max-h-72'>
              <SelectGroup>
                {genreItems.map((item) => (
                  <SelectItem key={item.value || "none"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className='w-auto'>
          <FieldLabel id={`${uid}-trope`}>Trope</FieldLabel>
          <Select items={tropeItems} value={trope} onValueChange={(value: string | null) => setTrope(value ?? "")}>
            <SelectTrigger aria-labelledby={`${uid}-trope`} className='min-w-44'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className='max-h-72'>
              <SelectGroup>
                {tropeItems.map((item) => (
                  <SelectItem key={item.value || "none"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {genre && (
        <Field orientation='horizontal' className='w-auto'>
          <Checkbox id={`${uid}-all-tropes`} checked={allTropes} onCheckedChange={setAllTropes} />
          <FieldLabel htmlFor={`${uid}-all-tropes`} className='font-normal'>
            Show all tropes, not only this genre’s
          </FieldLabel>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor={`${uid}-tags`}>
          <span id={`${uid}-tags-label`}>Tags</span>
          <TapTooltip
            label='About tags'
            content='Separate tags with commas or new lines. Up to 10, each under 31 characters.'
          >
            <Info size={16} />
          </TapTooltip>
        </FieldLabel>
        <Textarea id={`${uid}-tags`} aria-labelledby={`${uid}-tags-label`} name='tags' rows={3} className='resize-none' defaultValue={tags?.join(", ")} />
      </Field>
    </div>
  );
}
