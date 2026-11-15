# Phase 5 — AI enrichment (Claude API)

[← Plan overview](README.md)

- A server-only module that uses the Anthropic SDK with structured output (tool use / JSON schema). The model may pick only from the genre and trope names in the DB. It returns `genres[]`, `tropes[]`, `tags[]` (free-form, capped), `lengthCategory` (short/medium/long, based on page count when known) and a confidence score.
- Run it once per catalog `Book`, never per user. Large Amazon imports use the **Message Batches API** (50% cheaper); single adds run inline. Default model: `claude-haiku-5-5`, with `claude-sonnet-5-5` as an option for books where Haiku returns low confidence.
- Run it in the background so imports return immediately: a Vercel Cron route processes `aiEnrichedAt IS NULL` books in batches. Add a queue service (Inngest / QStash) later if needed.
- You can always edit or override the AI's tags per book.
- **Synopsis for books added without a lookup** (asked by the user on 2026-11-15): Amazon imports and manual adds have no provider record, so their `Book.description` starts empty. Before enrichment, or when a future book details page first opens one, fill it once from a provider.
  - **Only with a sure match:** a provider id (`openLibraryId`, `googleBooksId`) or an ISBN. Never from a title search alone, which can pick another book.
  - **Private documents are skipped:** they're never sent to an outside service.
  - **A miss is recorded** (for example a `descriptionCheckedAt` timestamp, a new additive migration), so it isn't retried on every open.
  - **Never overwrites** an existing description. Adds by search and ISBN fill it at add time instead (Phase 4c follow-up).
