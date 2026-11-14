// The read dates a shelf card shows, at the precision that's known. Pure, so
// it's unit-tested without a browser, and shared with client components.
import { DatePrecision, ReadingStatus } from "@/generated/prisma/enums";
import type { PartialDate } from "./partial-date.rules";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A shelf book's latest read, with only the dates that are known.
export type ShelfRead = { started?: PartialDate; ended?: PartialDate };

// "24", "Oct 24" or "5 Oct 25", with the year's last two digits: never a day
// or month that isn't known. Read dates are calendar dates stored in UTC, so
// they're read in UTC too.
export function formatPartialDate({ date, precision }: PartialDate) {
  const year = String(date.getUTCFullYear() % 100).padStart(2, "0");
  if (precision === DatePrecision.YEAR) return year;
  const month = `${MONTHS[date.getUTCMonth()]} ${year}`;
  return precision === DatePrecision.MONTH ? month : `${date.getUTCDate()} ${month}`;
}

function finishedLabel(started?: string, ended?: string) {
  if (started && ended) return `${started} – ${ended}`;
  if (ended) return `${ended}`;
  return started && `${started}`;
}

// What the card says about the latest read, or undefined when there's
// nothing to say: Wishlist and TBR show no dates, and a read with no dates
// (as after a bulk move) shows nothing rather than "Started —".
export function readDatesLabel(status: ReadingStatus, read: ShelfRead | null) {
  if (!read) return undefined;
  const started = read.started && formatPartialDate(read.started);
  const ended = read.ended && formatPartialDate(read.ended);

  if (status === ReadingStatus.READING) return started && `${started}`;
  if (status === ReadingStatus.FINISHED) return finishedLabel(started, ended);
  if (status === ReadingStatus.DNF) {
    const parts = [started && `Started ${started}`, ended && `Stopped ${ended}`].filter(Boolean);
    return parts.length ? parts.join(" · ") : undefined;
  }
  return undefined;
}
