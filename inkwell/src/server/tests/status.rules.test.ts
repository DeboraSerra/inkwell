import { describe, expect, it } from "vitest";
import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import {
  canTransition,
  changeFormats,
  initialState,
  InvalidTransitionError,
  notStartedStatusFor,
  type ReadChange,
  readChangeFor,
} from "@/server/library/status.rules";

const { WISHLIST, TO_READ, READING, FINISHED, DNF } = ReadingStatus;
const { EBOOK, PHYSICAL, AUDIO } = BookFormat;
const STATUSES = Object.values(ReadingStatus);

// The full table: current status → allowed status → what happens to the reads.
// The target that doesn't fit the formats is filtered out below.
const TABLE: Record<ReadingStatus, Partial<Record<ReadingStatus, ReadChange>>> = {
  WISHLIST: { READING: "open", FINISHED: "addFinished" },
  TO_READ: { READING: "open", FINISHED: "addFinished" },
  READING: { FINISHED: "closeFinished", DNF: "closeDnf", WISHLIST: "discardOpen", TO_READ: "discardOpen" },
  FINISHED: { READING: "open", WISHLIST: "none", TO_READ: "none" },
  DNF: { READING: "reopen", WISHLIST: "none", TO_READ: "none" },
};

describe("every status pair, owned and not owned", () => {
  const cases = [[EBOOK], []].flatMap((formats: BookFormat[]) =>
    STATUSES.flatMap((from) =>
      STATUSES.map((to) => {
        const wrongNotStarted = formats.length ? WISHLIST : TO_READ;
        const fits = to !== wrongNotStarted;
        const expected = from === to ? "none" : TABLE[from][to];
        return { formats, from, to, expected: fits ? expected : undefined };
      }),
    ),
  );

  it.each(cases)("$formats: $from → $to = $expected", ({ formats, from, to, expected }) => {
    const state = { status: from, formats };
    expect(canTransition(state, to)).toBe(expected !== undefined);
    if (expected) expect(readChangeFor(state, to)).toBe(expected);
    else expect(() => readChangeFor(state, to)).toThrow(InvalidTransitionError);
  });
});

describe("notStartedStatusFor", () => {
  it("is TBR when owned in any format, Wishlist otherwise", () => {
    expect(notStartedStatusFor([])).toBe(WISHLIST);
    expect(notStartedStatusFor([AUDIO])).toBe(TO_READ);
    expect(notStartedStatusFor([PHYSICAL, AUDIO])).toBe(TO_READ);
  });
});

describe("changeFormats", () => {
  it("moves a Wishlist book to TBR on its first format", () => {
    expect(changeFormats({ status: WISHLIST, formats: [] }, [PHYSICAL])).toEqual({
      status: TO_READ,
      formats: [PHYSICAL],
    });
  });

  it("moves a TBR book back when its last format goes", () => {
    expect(changeFormats({ status: TO_READ, formats: [AUDIO] }, [])).toEqual({
      status: WISHLIST,
      formats: [],
    });
  });

  it("holds several formats, without duplicates", () => {
    expect(changeFormats({ status: TO_READ, formats: [EBOOK] }, [EBOOK, AUDIO, EBOOK])).toEqual({
      status: TO_READ,
      formats: [EBOOK, AUDIO],
    });
  });

  it.each([READING, FINISHED, DNF])("doesn't change %s", (status) => {
    expect(changeFormats({ status, formats: [EBOOK] }, []).status).toBe(status);
    expect(changeFormats({ status, formats: [] }, [EBOOK]).status).toBe(status);
  });
});

describe("initialState", () => {
  it("defaults to the list the formats call for", () => {
    expect(initialState([])).toEqual({ status: WISHLIST, formats: [], readChange: "none" });
    expect(initialState([EBOOK, EBOOK])).toEqual({ status: TO_READ, formats: [EBOOK], readChange: "none" });
  });

  it("can add a book already read, in progress or abandoned", () => {
    expect(initialState([PHYSICAL], FINISHED).readChange).toBe("addFinished");
    expect(initialState([], READING).readChange).toBe("open");
    expect(initialState([PHYSICAL], DNF).readChange).toBe("addDnf");
  });

  it("rejects a list that contradicts the formats", () => {
    expect(() => initialState([], TO_READ)).toThrow(InvalidTransitionError);
    expect(() => initialState([EBOOK], WISHLIST)).toThrow(InvalidTransitionError);
  });
});
