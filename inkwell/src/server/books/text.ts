// Pure text helpers for untrusted book fields.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // A plain space, so search and the dedupe key treat it like any other.
  nbsp: " ",
};

const MAX_CODE_POINT = 0x10ffff;

// Bounded and with no nested repetition, so it can't backtrack on hostile text.
const ENTITY = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi;

function decodeEntity(match: string, body: string) {
  if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  const hex = body[1] === "x" || body[1] === "X";
  const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  // Surrogates and the null character aren't characters on their own.
  const valid = code > 0 && code <= MAX_CODE_POINT && (code < 0xd800 || code > 0xdfff);
  return valid ? String.fromCodePoint(code) : match;
}

// Decodes HTML entities once, so "&amp;amp;" becomes "&amp;", not "&": text
// that really says "&amp;" isn't decoded twice. Unknown entities and invalid
// code points stay as they are.
export const decodeEntities = (text: string) => text.replaceAll(ENTITY, decodeEntity);
