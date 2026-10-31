import { describe, expect, it } from "vitest";
import { Ownership, ReadingStatus } from "@/generated/prisma/enums";
import {
  canTransition,
  changeOwnership,
  initialState,
  InvalidTransitionError,
  transitionStatus,
  unreadStatusFor,
  type ReadingState,
} from "@/server/library/status.rules";

const { WISHLIST, TO_READ, READING, FINISHED, DNF } = ReadingStatus;
const STATUSES = Object.values(ReadingStatus);

const jan1 = new Date("2026-01-01T00:00:00Z");
const feb1 = new Date("2026-02-01T00:00:00Z");
const mar1 = new Date("2026-03-01T00:00:00Z");

const state = (overrides: Partial<ReadingState> = {}): ReadingState => ({
  status: TO_READ,
  ownership: Ownership.PHYSICAL,
  startedAt: null,
  finishedAt: null,
  ...overrides,
});

// The full expected transition table. Rows are the current status, values are
// the statuses it may move to (besides staying the same).
const OWNED: Record<ReadingStatus, ReadingStatus[]> = {
  WISHLIST: [READING, FINISHED],
  TO_READ: [READING, FINISHED],
  READING: [FINISHED, DNF, TO_READ],
  FINISHED: [READING, TO_READ],
  DNF: [READING, TO_READ],
};
const NOT_OWNED: Record<ReadingStatus, ReadingStatus[]> = {
  WISHLIST: [READING, FINISHED],
  TO_READ: [READING, FINISHED],
  READING: [FINISHED, DNF, WISHLIST],
  FINISHED: [READING, WISHLIST],
  DNF: [READING, WISHLIST],
};

describe("canTransition / transitionStatus: every status pair", () => {
  const cases = (
    [
      [Ownership.EBOOK, OWNED],
      [Ownership.NONE, NOT_OWNED],
    ] as const
  ).flatMap(([ownership, table]) =>
    STATUSES.flatMap((from) =>
      STATUSES.map((to) => ({
        ownership,
        from,
        to,
        // An unread status must always match the ownership, even when "staying".
        allowed:
          (from === to && to !== (ownership === Ownership.NONE ? TO_READ : WISHLIST)) ||
          table[from].includes(to),
      })),
    ),
  );

  it.each(cases)("$ownership: $from → $to allowed=$allowed", ({ ownership, from, to, allowed }) => {
    const current = state({ ownership, status: from });
    expect(canTransition(current, to)).toBe(allowed);
    if (allowed) {
      expect(transitionStatus(current, to, jan1).status).toBe(to);
    } else {
      expect(() => transitionStatus(current, to, jan1)).toThrow(InvalidTransitionError);
    }
  });
});

describe("transitionStatus dates", () => {
  it("starting a book sets startedAt", () => {
    expect(transitionStatus(state(), READING, jan1)).toMatchObject({
      status: READING,
      startedAt: jan1,
      finishedAt: null,
    });
  });

  it("finishing sets finishedAt and keeps the start date", () => {
    const reading = state({ status: READING, startedAt: jan1 });
    expect(transitionStatus(reading, FINISHED, feb1)).toMatchObject({
      startedAt: jan1,
      finishedAt: feb1,
    });
  });

  it("finishing an unstarted book sets both dates", () => {
    expect(transitionStatus(state(), FINISHED, feb1)).toMatchObject({
      startedAt: feb1,
      finishedAt: feb1,
    });
  });

  it("DNF keeps startedAt and has no finish date", () => {
    const reading = state({ status: READING, startedAt: jan1 });
    expect(transitionStatus(reading, DNF, feb1)).toMatchObject({
      status: DNF,
      startedAt: jan1,
      finishedAt: null,
    });
  });

  it("picking a DNF book back up resumes it with the original start date", () => {
    const dnf = state({ status: DNF, startedAt: jan1 });
    expect(transitionStatus(dnf, READING, mar1).startedAt).toBe(jan1);
  });

  it("rereading a finished book starts fresh", () => {
    const finished = state({ status: FINISHED, startedAt: jan1, finishedAt: feb1 });
    expect(transitionStatus(finished, READING, mar1)).toMatchObject({
      startedAt: mar1,
      finishedAt: null,
    });
  });

  it("going back to unread clears both dates", () => {
    const finished = state({ status: FINISHED, startedAt: jan1, finishedAt: feb1 });
    expect(transitionStatus(finished, TO_READ, mar1)).toMatchObject({
      status: TO_READ,
      startedAt: null,
      finishedAt: null,
    });
  });

  it("staying on the same status changes nothing", () => {
    const reading = state({ status: READING, startedAt: jan1 });
    expect(transitionStatus(reading, READING, mar1)).toBe(reading);
  });

  it("defaults the date to now", () => {
    const before = Date.now();
    const { startedAt } = transitionStatus(state(), READING);
    expect(startedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("changeOwnership", () => {
  it("buying a wishlist book moves it to TO_READ", () => {
    const wishlist = state({ status: WISHLIST, ownership: Ownership.NONE });
    expect(changeOwnership(wishlist, Ownership.EBOOK)).toMatchObject({
      status: TO_READ,
      ownership: Ownership.EBOOK,
    });
  });

  it("giving away an unread book moves it to WISHLIST", () => {
    expect(changeOwnership(state(), Ownership.NONE)).toMatchObject({
      status: WISHLIST,
      ownership: Ownership.NONE,
    });
  });

  it("keeps read statuses and dates", () => {
    const finished = state({ status: FINISHED, startedAt: jan1, finishedAt: feb1 });
    expect(changeOwnership(finished, Ownership.NONE)).toEqual({
      ...finished,
      ownership: Ownership.NONE,
    });
  });
});

describe("initialState", () => {
  it("defaults to the unread status for the ownership", () => {
    expect(initialState(Ownership.EBOOK).status).toBe(TO_READ);
    expect(initialState(Ownership.NONE).status).toBe(WISHLIST);
    expect(unreadStatusFor(Ownership.AUDIO)).toBe(TO_READ);
  });

  it("can add a book that's already finished", () => {
    expect(initialState(Ownership.PHYSICAL, FINISHED, jan1)).toMatchObject({
      status: FINISHED,
      startedAt: jan1,
      finishedAt: jan1,
    });
  });

  it("can add a book that was abandoned", () => {
    expect(initialState(Ownership.PHYSICAL, DNF, jan1)).toMatchObject({
      status: DNF,
      startedAt: jan1,
      finishedAt: null,
    });
  });

  it("rejects an unread status that doesn't match the ownership", () => {
    expect(() => initialState(Ownership.NONE, TO_READ)).toThrow(InvalidTransitionError);
    expect(() => initialState(Ownership.EBOOK, WISHLIST)).toThrow(InvalidTransitionError);
  });
});
