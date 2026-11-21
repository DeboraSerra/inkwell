import { describe, expect, it } from "vitest";
import { firstTopic } from "@/server/library/book-topics.rules";

const at = (day: number) => new Date(Date.UTC(2026, 10, day));
const ai = (name: string, day = 1) => ({ name, source: "AI" as const, createdAt: at(day) });
const user = (name: string, day = 1) => ({ name, source: "USER" as const, createdAt: at(day) });

describe("firstTopic", () => {
  it("prefers the reader's pick, then the oldest", () => {
    expect(firstTopic([ai("Fantasy", 1), user("Romance", 5)])).toBe("Romance");
    expect(firstTopic([ai("Later", 3), ai("First", 2)])).toBe("First");
  });

  it("is null for none", () => {
    expect(firstTopic([])).toBeNull();
  });
});
