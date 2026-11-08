// Normalization used to recognise the same book across sources (Amazon,
// Open Library, Google Books, manual entry) when there's no shared identifier.

// Leading articles are dropped so "The Hobbit" and "Hobbit, The" match.
// English and Portuguese; extend as needed.
const ARTICLES = ["the", "a", "an", "o", "os", "as", "um", "uma"];
const LEADING_ARTICLE = new RegExp(String.raw`^(?:${ARTICLES.join("|")})\s+`);
const TRAILING_ARTICLE = new RegExp(String.raw`,\s*(?:${ARTICLES.join("|")})$`);
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

const stripAccents = (text: string) =>
  text.normalize("NFKD").replaceAll(/\p{M}/gu, "");

const toWords = (text: string) =>
  text
    .replaceAll("&", " and ")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ");

export function normalizeTitle(title: string) {
  const base = stripAccents(title)
    .toLowerCase()
    // Series and edition markers: "(The Empyrean Book 1)", "[Kindle Edition]".
    .replaceAll(/\([^()]*\)|\[[^[\]]*\]/g, " ")
    // Subtitles: "Fourth Wing: A Novel".
    .split(":")[0]
    .trim()
    .replace(TRAILING_ARTICLE, "");
  return toWords(base).replace(LEADING_ARTICLE, "");
}

// A name in natural order and without suffixes: "Tolkien, J. R. R.", "J.R.R. Tolkien"
// and "J R R Tolkien" all become "j r r tolkien".
export function normalizeAuthorName(author: string) {
  const [last, first] = author.split(",").map((part) => part.trim());
  const ordered = first ? `${first} ${last}` : author;
  return toWords(stripAccents(ordered).toLowerCase())
    .split(" ")
    .filter((word) => word && !NAME_SUFFIXES.has(word))
    .join(" ");
}

// Reduces an author to their surname.
export function normalizeAuthor(author: string) {
  return normalizeAuthorName(author).split(" ").at(-1) ?? "";
}

// Surnames are sorted so the order the authors were entered in doesn't matter.
export function dedupeKey(title: string, authors: string[]) {
  const surnames = new Set(authors.map(normalizeAuthor).filter(Boolean));
  const sorted = [...surnames].sort((a, b) => a.localeCompare(b, "en"));
  return `${normalizeTitle(title)}|${sorted.join(",")}`;
}

// What author search runs against: "|terry pratchett|neil gaiman|". The bars mark
// where each name starts and ends, so a search can't match across two authors
// and a surname can be matched on its own.
export function authorSearchText(authors: string[]) {
  const names = authors.map(normalizeAuthorName).filter(Boolean);
  return names.length ? `|${names.join("|")}|` : "";
}

const isNameSuffix = (part: string) => NAME_SUFFIXES.has(toWords(part.toLowerCase()));

function splitCommaNames(text: string) {
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const names: string[] = [];
  for (const part of parts) {
    const previous = names.at(-1);
    if (previous && isNameSuffix(part)) names[names.length - 1] = `${previous}, ${part}`;
    else names.push(part);
  }
  // A one-word name before the comma is a surname: "Tolkien, J. R. R.".
  return names.length === 2 && !names[0].includes(" ") ? [names.join(", ")] : names;
}

// Amazon lists authors in one string, separated by commas:
// "Kerrigan Byrne, Cynthia St. Aubin". A comma can also be part of one name.
export const splitAmazonAuthors = (text: string) => text.split(";").flatMap(splitCommaNames);
