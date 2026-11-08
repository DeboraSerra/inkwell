# Phase 4 — Search and ISBN

[← Plan overview](README.md)

- A server-side `BookMetadataProvider` interface with Open Library first and Google Books as fallback. Results are cached in the `Book` table.
- "Add book" dialog: search by title/author, or enter an ISBN. Pick the formats you own; none means Wishlist.
- The MVP's manual form stays as the last resort.
- Later: scan ISBN barcodes with the phone camera (`BarcodeDetector`, with a `@zxing/browser` fallback).
