import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts by itself when test globals are on; they aren't here.
afterEach(() => {
  cleanup();
});
