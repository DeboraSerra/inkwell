import type { ReactNode } from "react";
import type { PositionedWord } from "@/types/ui.type";

function wordsWithPositions(text: string): PositionedWord[] {
  const words: PositionedWord[] = [];
  let position = 0;
  for (const word of text.split(" ")) {
    words.push({ word, start: position });
    position += word.length + 1;
  }
  return words;
}

const PILL =
  "text-xs font-normal text-muted-foreground flex flex-wrap gap-0.5 items-center border w-fit max-w-full rounded-full px-1 py-0.5";

// A small rounded line on a shelf card (read dates, genre and trope, tags).
// Each word is its own element so the line wraps between words. With
// `onClick` it's a button, for example one that filters the shelf by it.
export function CardPill({
  text,
  label,
  action,
  onClick,
  children,
}: Readonly<{ text: string; label?: string; action?: string; onClick?: () => void; children?: ReactNode }>) {
  const content = (
    <>
      {label && <span className='sr-only'>{label}: </span>}
      {wordsWithPositions(text).map(({ word, start }) => (
        <small key={start}>{word}</small>
      ))}
      {children}
    </>
  );
  if (!onClick) return <span className={PILL}>{content}</span>;
  return (
    <button
      type='button'
      title={action}
      onClick={onClick}
      className={`${PILL} cursor-pointer text-left hover:border-chip-selected hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {content}
      {action && <span className='sr-only'>, {action}</span>}
    </button>
  );
}
