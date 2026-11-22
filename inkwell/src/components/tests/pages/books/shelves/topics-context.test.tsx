import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TopicsProvider, useTopics } from "@/components/pages/books/shelves/topics-context";

const topics = { genres: ["Fantasy"], tropes: [{ name: "Chosen One", genres: ["Fantasy"] }] };

describe("topics context", () => {
  it("gives the shelves page's curated lists", () => {
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <TopicsProvider topics={topics}>{children}</TopicsProvider>
    );
    expect(renderHook(() => useTopics(), { wrapper }).result.current).toBe(topics);
  });

  it("is null outside the shelves page", () => {
    expect(renderHook(() => useTopics()).result.current).toBeNull();
  });
});
