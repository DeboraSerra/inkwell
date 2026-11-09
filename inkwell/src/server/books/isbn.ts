// ISBN helpers. All functions accept hyphens and spaces ("978-0-261-10221-7").

export const cleanIsbn = (isbn: string) => isbn.replaceAll(/[\s-]/g, "").toUpperCase();

// Keeps only what an ISBN can contain: digits, and an X only as the tenth and
// last character, where it's an ISBN-10 check digit worth 10. Anything after
// that X is dropped, and so is everything past thirteen digits.
function isbnChars(isbn: string) {
  let chars = "";
  for (const char of cleanIsbn(isbn)) {
    if (chars.length === 13) break;
    if (char >= "0" && char <= "9") chars += char;
    else if (char === "X" && chars.length === 9) return `${chars}X`;
  }
  return chars;
}

// Groups the characters for easier reading while typing. The official hyphen
// positions vary by publisher and need range tables, so these are approximate
// and are never stored.
export function formatIsbn(isbn: string) {
  const chars = isbnChars(isbn);
  const groups = /^97([89]|$)/.test(chars) || chars.length > 10 ? [3, 1, 4, 4, 1] : [1, 4, 4, 1];
  const parts: string[] = [];
  let start = 0;
  for (const size of groups) {
    const part = chars.slice(start, start + size);
    if (part) parts.push(part);
    start += size;
  }
  return parts.join("-");
}

export function isValidIsbn10(isbn: string) {
  const digits = cleanIsbn(isbn);
  if (!/^\d{9}[\dX]$/.test(digits)) return false;
  const sum = [...digits].reduce(
    (acc, char, i) => acc + (char === "X" ? 10 : Number(char)) * (10 - i),
    0,
  );
  return sum % 11 === 0;
}

const isbn13CheckDigit = (first12: string) => {
  const sum = [...first12].reduce(
    (acc, char, i) => acc + Number(char) * (i % 2 === 0 ? 1 : 3),
    0,
  );
  return String((10 - (sum % 10)) % 10);
};

export function isValidIsbn13(isbn: string) {
  const digits = cleanIsbn(isbn);
  if (!/^97[89]\d{10}$/.test(digits)) return false;
  return isbn13CheckDigit(digits.slice(0, 12)) === digits[12];
}

export function isbn10To13(isbn10: string) {
  if (!isValidIsbn10(isbn10)) return null;
  const first12 = `978${cleanIsbn(isbn10).slice(0, 9)}`;
  return first12 + isbn13CheckDigit(first12);
}

// Returns a valid, cleaned ISBN-13 from either format, or null.
export function toIsbn13(isbn: string) {
  if (isValidIsbn13(isbn)) return cleanIsbn(isbn);
  return isbn10To13(isbn);
}
