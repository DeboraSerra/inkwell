// Rules for a user's book: which status (list) it may move to, what that does
// to its read history, and how formats affect it. Pure functions, so every
// rule is unit-tested without a database.
import { type BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { ValidationError } from "@/server/errors";
import type { ReadChange, ReadingState } from "@/types/library.type";

// What each status is called as a list in the UI.
export const LIST_NAMES: Record<ReadingStatus, string> = {
  WISHLIST: "Wishlist",
  TO_READ: "TBR",
  READING: "Reading",
  FINISHED: "Finished",
  DNF: "DNF",
};

export class InvalidTransitionError extends ValidationError {
  constructor(from: ReadingStatus, to: ReadingStatus, formats: readonly BookFormat[]) {
    let reason = "";
    if (isNotStarted(to) && to !== notStartedStatusFor(formats)) {
      reason = formats.length ? ", because you own it" : ", because you don't own it in any format";
    }
    super(`A book on ${LIST_NAMES[from]} can't move to ${LIST_NAMES[to]}${reason}.`);
  }
}

// A book nobody has started is on the Wishlist if it isn't owned, or TBR if it is.
export const notStartedStatusFor = (formats: readonly BookFormat[]): ReadingStatus =>
  formats.length ? ReadingStatus.TO_READ : ReadingStatus.WISHLIST;

const isNotStarted = (status: ReadingStatus) =>
  status === ReadingStatus.WISHLIST || status === ReadingStatus.TO_READ;

const TRANSITIONS: Record<ReadingStatus, Partial<Record<ReadingStatus, ReadChange>>> = {
  // Giving up before starting, or after only a little, still records a DNF read.
  WISHLIST: { READING: "open", FINISHED: "addFinished", DNF: "addDnf" },
  TO_READ: { READING: "open", FINISHED: "addFinished", DNF: "addDnf" },
  READING: { FINISHED: "closeFinished", DNF: "closeDnf", WISHLIST: "discardOpen", TO_READ: "discardOpen" },
  // A reread opens a new read, and a reread given up on adds a DNF read; the
  // finished one stays in the history either way.
  FINISHED: { READING: "open", DNF: "addDnf", WISHLIST: "none", TO_READ: "none" },
  DNF: { READING: "reopen", WISHLIST: "none", TO_READ: "none" },
};

export function canTransition(state: ReadingState, to: ReadingStatus) {
  if (isNotStarted(to) && to !== notStartedStatusFor(state.formats)) return false;
  return state.status === to || TRANSITIONS[state.status][to] !== undefined;
}

// Whether this change begins a read rather than continuing the latest one, so
// that read's dates don't apply to it.
export const startsNewRead = (state: ReadingState, to: ReadingStatus) =>
  canTransition(state, to) && TRANSITIONS[state.status][to] === "open";

// Returns what happens to the reads. Throws for a change that isn't allowed.
export function readChangeFor(state: ReadingState, to: ReadingStatus): ReadChange {
  if (!canTransition(state, to)) {
    throw new InvalidTransitionError(state.status, to, state.formats);
  }
  return state.status === to ? "none" : (TRANSITIONS[state.status][to] ?? "none");
}

const uniqueFormats = (formats: readonly BookFormat[]) => [...new Set(formats)];

// Getting a first format moves a Wishlist book to TBR, and losing the last one
// moves a TBR book back. Other statuses don't depend on owning the book.
export function changeFormats(state: ReadingState, formats: readonly BookFormat[]): ReadingState {
  const next = uniqueFormats(formats);
  return { formats: next, status: isNotStarted(state.status) ? notStartedStatusFor(next) : state.status };
}

// The state of a book when it's first added, which may already be read or in
// progress (e.g. adding a book you finished last year).
export function initialState(
  formats: readonly BookFormat[],
  status: ReadingStatus = notStartedStatusFor(formats),
): ReadingState & { readChange: ReadChange } {
  const unique = uniqueFormats(formats);
  const notStarted = notStartedStatusFor(unique);
  const readChange = readChangeFor({ formats: unique, status: notStarted }, status);
  return { formats: unique, status, readChange };
}
