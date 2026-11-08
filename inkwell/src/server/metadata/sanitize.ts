// Pure helpers that turn untrusted provider fields into safe values. Anything
// that doesn't fit becomes undefined rather than an error, so one bad field
// never loses the rest of a book.
import { cleanIsbn, isValidIsbn10, isValidIsbn13 } from "@/server/books/isbn";

export const LIMITS = {
  title: 500,
  author: 200,
  authors: 25,
  description: 5000,
  maxPages: 100_000,
} as const;

// Hosts that serve covers. Anything else is dropped, so a provider response
// can't point the app at an arbitrary server.
const COVER_HOSTS = new Set(["covers.openlibrary.org", "books.google.com"]);

export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replaceAll(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function cleanAuthors(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const authors: string[] = [];
  for (const value of values) {
    const name = cleanText(value, LIMITS.author);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    authors.push(name);
    if (authors.length === LIMITS.authors) break;
  }
  return authors;
}

// A single pass over the characters, dropping everything between < and >, so
// there's no regex to backtrack on hostile input. Entities that commonly
// appear in Google's descriptions are decoded; others stay as they are.
export function stripHtml(html: string): string {
  let text = "";
  let inTag = false;
  for (const char of html) {
    if (char === "<") {
      inTag = true;
      text += " ";
    } else if (char === ">") {
      inTag = false;
    } else if (!inTag) {
      text += char;
    }
  }
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function cleanDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return cleanText(stripHtml(value), LIMITS.description);
}

// Upgrades http to https (Google sends http links) and keeps only known hosts.
export function cleanCoverUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || !COVER_HOSTS.has(url.hostname)) return undefined;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function cleanPageCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 1 && value <= LIMITS.maxPages ? value : undefined;
}

// Accepts a year as a number or inside text ("2005", "March 2005",
// "2005-03-01"). Only plausible years survive.
export function cleanYear(value: unknown, now = new Date()): number | undefined {
  let year: number | undefined;
  if (typeof value === "number") year = value;
  else if (typeof value === "string") {
    const match = /\d{4}/.exec(value.slice(0, 100));
    year = match ? Number(match[0]) : undefined;
  }
  if (year === undefined || !Number.isInteger(year)) return undefined;
  return year >= 1000 && year <= now.getUTCFullYear() + 1 ? year : undefined;
}

export function cleanIsbn13(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 30) return undefined;
  const isbn = cleanIsbn(value);
  return isValidIsbn13(isbn) ? isbn : undefined;
}

export function cleanIsbn10(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 30) return undefined;
  const isbn = cleanIsbn(value);
  return isValidIsbn10(isbn) ? isbn : undefined;
}

// Provider ids end up in URLs and the database; keep them short and plain.
export function cleanSourceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^[\w-]{1,64}$/.test(value) ? value : undefined;
}
