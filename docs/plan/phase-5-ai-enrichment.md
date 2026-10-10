# Phase 5 — AI enrichment (Claude API)

[← Plan overview](README.md)

- A server-only module that uses the Anthropic SDK with structured output (tool use / JSON schema). The model may pick only from the genre and trope names in the DB. It returns `genres[]`, `tropes[]`, `tags[]` (free-form, capped), `lengthCategory` (short/medium/long, based on page count when known) and a confidence score.
- Run it once per catalog `Book`, never per user. Large Amazon imports use the **Message Batches API** (50% cheaper); single adds run inline. Default model: `claude-haiku-5-5`, with `claude-sonnet-5-5` as an option for books where Haiku returns low confidence.
- Run it in the background so imports return immediately: a Vercel Cron route processes `aiEnrichedAt IS NULL` books in batches. Add a queue service (Inngest / QStash) later if needed.
- You can always edit or override the AI's tags per book.
