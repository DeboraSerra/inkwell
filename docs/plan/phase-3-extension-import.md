# Phase 3 — Extension → app import

[← Plan overview](README.md)

- Update the extension: keep the scraper and also capture the **ASIN** (from the row's id or link), which gives reliable deduplication. Replace the clipboard copy with `POST {APP_URL}/api/imports/amazon`. Add an options page where you paste the app URL and your API token, plus feedback on progress and the result ("42 new, 310 already in library").
- Tighten `manifest.json`: content script only on `https://www.amazon.*/hz/mycd/*`, and `host_permissions` for the app URL.
- Endpoint: validate the payload with zod and upsert `Book` rows (match on ASIN → ISBN → normalized title+author). Create `UserBook` rows (ownership EBOOK, status TO_READ, source AMAZON_IMPORT) on the Ebook TBR shelf, and skip existing ones. Record an `ImportJob` and queue new books for enrichment.
