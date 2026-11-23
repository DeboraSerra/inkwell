// Marks the shelf's tab panel, where focus goes when the control that had it
// is removed (a moved or deleted card, the selection bar after a bulk action).
const SHELF_PANEL_ATTRIBUTE = "data-shelf-panel";

// After the next paint, so React has removed the old control. Only when focus
// fell to the page itself: anything the reader focused meanwhile is kept.
export function refocusShelfIfLost() {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const panel = document.querySelector<HTMLElement>(`[${SHELF_PANEL_ATTRIBUTE}]`);
    panel?.focus();
  });
}
