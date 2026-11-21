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
