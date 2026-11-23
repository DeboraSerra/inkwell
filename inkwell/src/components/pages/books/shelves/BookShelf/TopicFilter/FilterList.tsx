import { cn } from "cn";
import { X } from "lucide-react";
import type { ReactNode } from "react";

// A toggle button, so it's reachable by keyboard and announced as pressed.
export const FilterChip = ({
  children,
  selected = false,
  onToggle,
}: Readonly<{ children: ReactNode; selected?: boolean; onToggle: () => void }>) => {
  return (
    <li>
      <button
        type='button'
        aria-pressed={selected}
        onClick={onToggle}
        className={cn(
          "rounded-sm border border-chip-border px-2 py-1 text-xs flex items-center gap-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "border-chip-selected bg-chip-selected/15",
        )}
      >
        {children} {selected && <X aria-hidden='true' size={12} />}
      </button>
    </li>
  );
};

export const FilterList = ({ children, label }: Readonly<{ children: ReactNode; label: string }>) => {
  return (
    <ul aria-label={label} className='flex gap-1 flex-wrap'>
      {children}
    </ul>
  );
};
