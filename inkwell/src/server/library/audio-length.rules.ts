// An audiobook's length, typed as hours and minutes and stored as minutes.
// Pure, so it's unit-tested without a database, and shared with the forms and
// the shelf card.

// 200 hours, longer than any audiobook.
const MAX_AUDIO_MINUTES = 12_000;
const MAX_HOURS = MAX_AUDIO_MINUTES / 60;

const wholeNumber = (text: string) => (/^\d{1,5}$/.test(text) ? Number(text) : undefined);

// Both parts empty means no length. Either part alone is fine: "12" hours, or
// "45" minutes. Minutes stay under 60 when hours are given too.
export function parseAudioLength(hoursText = "", minutesText = ""): { minutes?: number; error?: string } {
  const hoursInput = hoursText.trim();
  const minutesInput = minutesText.trim();
  if (!hoursInput && !minutesInput) return {};

  const hours = hoursInput ? wholeNumber(hoursInput) : 0;
  const minutes = minutesInput ? wholeNumber(minutesInput) : 0;
  if (hours === undefined || minutes === undefined) {
    return { error: "Enter the length as whole hours and minutes." };
  }
  if (hours > MAX_HOURS) return { error: `Enter a length of at most ${MAX_HOURS} hours.` };
  if (hoursInput && minutes > 59) return { error: "Enter the minutes as 0 to 59." };

  const total = hours * 60 + minutes;
  if (total < 1) return { error: "Enter a length of at least 1 minute." };
  if (total > MAX_AUDIO_MINUTES) return { error: `Enter a length of at most ${MAX_HOURS} hours.` };
  return { minutes: total };
}

// The form's text for a stored length, so the edit dialog starts from it.
export function splitAudioLength(total: number | null | undefined) {
  if (!total) return { audioHours: "", audioMinutes: "" };
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return { audioHours: hours ? String(hours) : "", audioMinutes: minutes || !hours ? String(minutes) : "" };
}

// "12 h 30 min", "45 min" or "3 h".
export function formatAudioLength(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}
