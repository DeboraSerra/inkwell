// ISBN helpers. All functions accept hyphens and spaces ("978-0-261-10221-7").

export const cleanIsbn = (isbn: string) => isbn.replaceAll(/[\s-]/g, "").toUpperCase();

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
