import type { ReactNode } from "react";

export function capitalizeFirstLetter(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PILL =
  "text-xs font-normal text-muted-foreground flex flex-wrap gap-0.5 items-center border w-fit max-w-full rounded-full px-1 py-0.5";

// A small rounded line on a shelf card (read dates, genre and trope, tags).
// With `onClick` it's a button, for example one that filters the shelf by it.
export function CardPill({
  text,
  label,
  action,
  onClick,
  children,
  capitalize = false,
}: Readonly<{
  text: string;
  label?: string;
  action?: string;
  onClick?: () => void;
  children?: ReactNode;
  capitalize?: boolean;
}>) {
  const content = (
    <>
      {label && (
        <>
          <span className='sr-only'>{label}:</span>{" "}
        </>
      )}
      <small className='[word-spacing:-0.3em]'>
        {capitalize
          ? text.split(" ").map(capitalizeFirstLetter).join(" ")
          : text}
      </small>
      {children}
    </>
  );
  if (!onClick) return <span className={PILL}>{content}</span>;
  return (
    <button
      type='button'
      title={action}
      onClick={onClick}
      className={`${PILL} cursor-pointer text-left hover:border-chip-selected/60 hover:bg-chip-selected/20 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {content}
      {action && <span className='sr-only'>, {action}</span>}
    </button>
  );
}
