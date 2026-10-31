// Reading-status rules for a user's book. Pure functions, so every rule is
// unit-tested without a database.
import { Ownership, ReadingStatus } from "@/generated/prisma/enums";
import { ValidationError } from "@/server/errors";

export type ReadingState = {
  status: ReadingStatus;
  ownership: Ownership;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export class InvalidTransitionError extends ValidationError {
  constructor(from: ReadingStatus, to: ReadingStatus, ownership: Ownership) {
    super(`Can't change status from ${from} to ${to} for a book with ownership ${ownership}`);
  }
}

// "Unread" is WISHLIST when the user doesn't own the book, TO_READ when they do.
export const unreadStatusFor = (ownership: Ownership): ReadingStatus =>
  ownership === Ownership.NONE ? ReadingStatus.WISHLIST : ReadingStatus.TO_READ;

const isUnread = (status: ReadingStatus) =>
  status === ReadingStatus.WISHLIST || status === ReadingStatus.TO_READ;

// Which statuses each status may move to. Going back to unread (to reread, or
// after putting a book down) resolves to WISHLIST or TO_READ by ownership.
const ALLOWED: Record<ReadingStatus, readonly ReadingStatus[]> = {
  WISHLIST: [ReadingStatus.READING, ReadingStatus.FINISHED],
  TO_READ: [ReadingStatus.READING, ReadingStatus.FINISHED],
  READING: [
    ReadingStatus.FINISHED,
    ReadingStatus.DNF,
    ReadingStatus.WISHLIST,
    ReadingStatus.TO_READ,
  ],
  FINISHED: [ReadingStatus.READING, ReadingStatus.WISHLIST, ReadingStatus.TO_READ],
  DNF: [ReadingStatus.READING, ReadingStatus.WISHLIST, ReadingStatus.TO_READ],
};

export function canTransition(state: ReadingState, to: ReadingStatus) {
  if (isUnread(to) && to !== unreadStatusFor(state.ownership)) return false;
  return state.status === to || ALLOWED[state.status].includes(to);
}

// Returns the new status and dates. `at` defaults to now; pass an earlier
// date to record something that happened in the past.
export function transitionStatus(
  state: ReadingState,
  to: ReadingStatus,
  at: Date = new Date(),
): ReadingState {
  if (!canTransition(state, to)) {
    throw new InvalidTransitionError(state.status, to, state.ownership);
  }
  if (state.status === to) return state;

  switch (to) {
    case ReadingStatus.READING: {
      // Picking a DNF book back up resumes it; anything else is a fresh start
      // (including a reread of a finished book).
      const resuming = state.status === ReadingStatus.DNF && state.startedAt;
      return { ...state, status: to, startedAt: resuming ? state.startedAt : at, finishedAt: null };
    }
    case ReadingStatus.FINISHED:
      return { ...state, status: to, startedAt: state.startedAt ?? at, finishedAt: at };
    case ReadingStatus.DNF:
      return { ...state, status: to, finishedAt: null };
    default:
      // Back to unread. Proper reread history is out of scope for now.
      return { ...state, status: to, startedAt: null, finishedAt: null };
  }
}

// Changing ownership (buying a wishlist book, giving a book away) keeps an
// unread book in the matching unread status. Read statuses don't change.
export function changeOwnership(state: ReadingState, ownership: Ownership): ReadingState {
  const status = isUnread(state.status) ? unreadStatusFor(ownership) : state.status;
  return { ...state, ownership, status };
}

// The state of a book when it's first added to a library, optionally already
// read or in progress (e.g. adding a book you finished last year).
export function initialState(
  ownership: Ownership,
  status: ReadingStatus = unreadStatusFor(ownership),
  at?: Date,
): ReadingState {
  const unread: ReadingState = {
    status: unreadStatusFor(ownership),
    ownership,
    startedAt: null,
    finishedAt: null,
  };
  if (status === ReadingStatus.DNF) {
    return transitionStatus(transitionStatus(unread, ReadingStatus.READING, at), status, at);
  }
  return transitionStatus(unread, status, at);
}
