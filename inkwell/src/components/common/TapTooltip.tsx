"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type MouseEvent, type PointerEvent, type ReactElement, type ReactNode, useRef, useState } from "react";

// A tooltip that a tap opens too. Base UI's tooltip only opens on hover and
// focus, so on a phone a tap showed nothing. A tap toggles it here; a mouse
// click keeps it open, since hovering already opened it. Hover, focus, Escape
// and tapping elsewhere still work as before. The click's
// default is stopped, so a trigger inside a label doesn't also tick or focus
// the field.
// With touchOnly, only a tap toggles it and any other click goes through
// untouched (BookTitle's mouse click selects its card).
export function TapTooltip({
  content,
  label,
  render,
  children,
  side,
  align,
  className,
  disabled = false,
  touchOnly = false,
}: Readonly<{
  content: ReactNode;
  // For a trigger with no text of its own, such as an icon.
  label?: string;
  // The trigger's element, when it isn't a button (see BookCard's "+N").
  render?: ReactElement;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
  disabled?: boolean;
  touchOnly?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const pointerType = useRef("");
  const rememberPointer = (event: PointerEvent) => {
    pointerType.current = event.pointerType;
  };
  const toggle = (event: MouseEvent) => {
    if (disabled || (touchOnly && pointerType.current !== "touch")) return;
    event.preventDefault();
    event.stopPropagation();
    if (pointerType.current === "mouse") setOpen(true);
    else setOpen((current) => !current);
  };

  return (
    <Tooltip disabled={disabled} open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        aria-label={label}
        closeOnClick={false}
        onPointerDown={rememberPointer}
        onClick={toggle}
        render={render}
        className={className}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
