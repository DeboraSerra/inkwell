// Rules for a user's book: which status (list) it may move to, what that does
// to its read history, and how formats affect it. Pure functions, so every
// rule is unit-tested without a database.
import { type BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { ValidationError } from "@/server/errors";

// What each status is called as a list in the UI.
export const LIST_NAMES: Record<ReadingStatus, string> = {
  WISHLIST: "Wishlist",
  TO_READ: "TBR",
  READING: "Reading",
  FINISHED: "Finished",
  DNF: "DNF",
};

export type ReadingState = {
  status: ReadingStatus;
  formats: BookFormat[];
};

// What a status change does to the book's reads.
export type ReadChange =
  | "none"
  | "open"
  | "reopen"
  | "closeFinished"
  | "closeDnf"
  | "addFinished"
  | "addDnf"
  | "discardOpen";

export class InvalidTransitionError extends ValidationError {
  constructor(from: ReadingStatus, to: ReadingStatus, formats: BookFormat[]) {
    const owned = formats.length ? formats.join(", ") : "no formats";
    super(`Can't change status from ${from} to ${to} for a book with ${owned}`);
  }
}

// A book nobody has started is on the Wishlist if it isn't owned, or TBR if it is.
export const notStartedStatusFor = (formats: readonly BookFormat[]): ReadingStatus =>
  formats.length ? ReadingStatus.TO_READ : ReadingStatus.WISHLIST;

const isNotStarted = (status: ReadingStatus) =>
  status === ReadingStatus.WISHLIST || status === ReadingStatus.TO_READ;

const TRANSITIONS: Record<ReadingStatus, Partial<Record<ReadingStatus, ReadChange>>> = {
  WISHLIST: { READING: "open", FINISHED: "addFinished" },
  TO_READ: { READING: "open", FINISHED: "addFinished" },
  READING: { FINISHED: "closeFinished", DNF: "closeDnf", WISHLIST: "discardOpen", TO_READ: "discardOpen" },
  // A reread opens a new read; the finished one stays in the history.
  FINISHED: { READING: "open", WISHLIST: "none", TO_READ: "none" },
  DNF: { READING: "reopen", WISHLIST: "none", TO_READ: "none" },
};

export function canTransition(state: ReadingState, to: ReadingStatus) {
  if (isNotStarted(to) && to !== notStartedStatusFor(state.formats)) return false;
  return state.status === to || TRANSITIONS[state.status][to] !== undefined;
}

// Returns what happens to the reads. Throws for a change that isn't allowed.
export function readChangeFor(state: ReadingState, to: ReadingStatus): ReadChange {
  if (!canTransition(state, to)) {
    throw new InvalidTransitionError(state.status, to, state.formats);
  }
  return state.status === to ? "none" : (TRANSITIONS[state.status][to] ?? "none");
}

export const uniqueFormats = (formats: readonly BookFormat[]) => [...new Set(formats)];

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
  if (status === ReadingStatus.DNF) return { formats: unique, status, readChange: "addDnf" };
  const readChange = readChangeFor({ formats: unique, status: notStarted }, status);
  return { formats: unique, status, readChange };
}
