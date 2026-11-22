"use client";

import { TapTooltip } from "@/components/common/TapTooltip";
import { useEffect, useRef, useState } from "react";

// The title and authors, cut with CSS rather than by character count, so the
// full text stays on the page for screen readers and the cut follows the
// card's width. Each gets one line.
export function BookTitle({
  title,
  authors,
}: Readonly<{ title: string; authors: string[] }>) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const authorsRef = useRef<HTMLSpanElement>(null);
  const [clamped, setClamped] = useState(false);
  const authorText = authors.join("; ");

  // Checked on render and whenever the card's width changes, so short titles
  // never get a tooltip that only repeats them.
  useEffect(() => {
    const elements = [titleRef.current, authorsRef.current].filter(
      (element) => element !== null,
    );
    const measure = () =>
      setClamped(
        elements.some((element) => element.scrollHeight > element.clientHeight),
      );
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Touch screens have no hover, so tapping a cut-off title shows the full
  // text instead of selecting the book; tapping elsewhere still selects. A
  // mouse click on the title selects, as before.
  return (
    <TapTooltip
      disabled={!clamped}
      touchOnly
      side='bottom'
      align='start'
      // A paragraph, not a button, so clicking it still ticks the card's
      // checkbox. It's focusable only when clamped, so the full text can be
      // read from the keyboard too.
      render={<p tabIndex={clamped ? 0 : undefined} className='grow' />}
      className='block rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
      content={
        <span className='flex flex-col gap-0.5'>
          <span className='font-medium'>{title}</span>
          {authorText && <span className='opacity-80'>{authorText}</span>}
        </span>
      }
    >
      <span
        ref={titleRef}
        className='line-clamp-1 font-medium wrap-break-word'
      >
        {title}
      </span>
      <span
        ref={authorsRef}
        className='line-clamp-1 text-sm font-normal text-muted-foreground wrap-break-word'
      >
        {authorText}
      </span>
    </TapTooltip>
  );
}
