import { formatIsbn } from "@/server/books/isbn";

// Hyphenates an ISBN field as it's typed. Rewriting the value sends the caret
// to the end, so put it back after the same character, or editing the middle
// of the ISBN would jump. The server strips the hyphens again (cleanIsbn).
export const applyIsbnFormat = (input: HTMLInputElement) => {
  const caret = input.selectionStart ?? input.value.length;
  const charsBeforeCaret = formatIsbn(input.value.slice(0, caret)).replaceAll("-", "").length;
  const formatted = formatIsbn(input.value);

  let position = 0;
  let seen = 0;
  while (seen < charsBeforeCaret && position < formatted.length) {
    if (formatted[position] !== "-") seen++;
    position++;
  }
  input.value = formatted;
  input.setSelectionRange(position, position);
};
