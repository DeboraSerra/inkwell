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

// Reduces an author to their surname: "Tolkien, J. R. R.", "J.R.R. Tolkien"
// and "J R R Tolkien" all become "tolkien".
export function normalizeAuthor(author: string) {
  const [last, first] = author.split(",").map((part) => part.trim());
  const ordered = first ? `${first} ${last}` : author;
  const words = toWords(stripAccents(ordered).toLowerCase())
    .split(" ")
    .filter((word) => word && !NAME_SUFFIXES.has(word));
  return words.at(-1) ?? "";
}

export const dedupeKey = (title: string, authors: string[]) =>
  `${normalizeTitle(title)}|${normalizeAuthor(authors[0] ?? "")}`;
