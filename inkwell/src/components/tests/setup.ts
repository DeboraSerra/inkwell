import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts by itself when test globals are on; they aren't here.
afterEach(() => {
  cleanup();
});

// jsdom has no layout, so no ResizeObserver; components that measure (BookTitle's clamp) only need it to exist.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Nor matchMedia, which the shadcn sidebar reads through useIsMobile. Tests that
// need a phone width stub it themselves.
globalThis.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
