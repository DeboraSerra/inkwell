# Phase 4 — Adding books by search, ISBN and manual entry

[← Plan overview](README.md)

- A server-side `BookMetadataProvider` interface with Open Library first and Google Books as fallback. Results are cached in the `Book` table.
- "Add book" dialog: search by title/author, or enter an ISBN. Pick the target: Physical TBR, Wishlist or Ebook TBR.
- Manual form as the last resort.
- Later: scan ISBN barcodes with the phone camera (`BarcodeDetector`, with a `@zxing/browser` fallback).
