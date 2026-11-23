# Phase 15 — Paid subscriptions

[← Plan overview](README.md)

⏳ Idea, not planned yet. Only if Inkwell becomes an app with paid subscriptions. Added on 2026-11-21.

## Better AI enrichment for subscribers

Moved here from Phase 5b (open question 4), where Haiku 5.5 alone enriches every catalog book.

- **What:** a book whose enrichment looks weak is enriched again with `claude-sonnet-5-5`, for subscribed users only.
- **How weak is decided:** to work out first. A model's own confidence score isn't reliable, so prefer signals that can be checked: no genre picked, a thin synopsis, or readers removing the AI's genres and tropes (5b6).
- **Cost (2026-11-21 prices):** Sonnet 5.5 is about 20× Haiku 5.5, roughly $0.008 a book inline and $0.004 through Message Batches, against about $0.0004 and $0.0002 for Haiku.
- **Still applies:** catalog books only, never private documents; curated lists only; AI never overwrites a reader's edits.
- **Open:** since enrichment is per catalog book, a subscriber's retry improves the book for every reader. Decide whether that's fine or whether subscriber results stay per user.

## SonarQube Cloud in CI

Moved here from Phase 6 (suggestion g) on 2026-11-22, to apply if subscriptions are enabled.

- A SonarQube Cloud scan on each pull request: the "Sonar way" quality gate the user already follows in SonarLint, with the `lcov` coverage from the `checks` job.
- **Cost:** free while the repository is public; a private repository needs a paid SonarQube Cloud plan (by lines of code).
- **Setup:** a SonarQube Cloud project, a `SONAR_TOKEN` secret, `sonar-project.properties` (sources `inkwell/src`, exclusions for `generated/` and `components/ui/`), and automatic analysis turned off so it doesn't run twice. Then the quality gate joins the ruleset's required checks.

## Security headers

Moved here from Phase 6 (suggestion m) on 2026-11-22, to apply if subscriptions are enabled.

- In `next.config.ts`: a `Content-Security-Policy` (scripts from self, images from the cover hosts, connections to Firebase and the providers), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera only for the barcode scanner) and `frame-ancestors 'none'`.
- **Cost:** free. The CSP must be tested on a preview deploy against Firebase sign-in, covers and the scanner's WASM.

## Free plan limits

Asked by the user on 2026-11-21. Free accounts get a capped Inkwell, and subscribers get it without the caps. The numbers are placeholders, to be set when this phase is planned.

**Applies to every limit**

- **Checked on the server,** in the service that does the work, never only in the UI or the extension. The extension can be changed by its user, so it can only show a limit; it never enforces one.
- **Nothing is deleted or hidden** when a limit is reached or a subscription ends. What's already there stays readable, movable and exportable; only adding more is blocked. Moving a book between lists, editing it and removing it are never limited.
- **A clear message** when a limit is hit: what the limit is, what's used, and what a subscription would change. Route handlers return 403 with that message (or 429 for the per-minute rate limits, as now).
- **One place for the limits:** a `plan.rules.ts` (pure) maps a plan to its limits, so the numbers change in one file. Counting usage is a model query, done when checked, never a stored counter that can drift (as goal progress is computed).
- **Rate limits stay** for every plan (`consumeRateLimit`); they protect the APIs' quotas, not the business model.

### Amazon import

- **Pages of the Kindle content list:** the extension stops after N pages for free accounts (for example 5). It reads the limit from `GET /api/me`.
- **On the server:** `POST /api/imports/amazon` counts the books in a free account's import against the book limit below, and refuses the rest with a message saying how many were skipped. A re-import that only adds formats to books already in the library is never refused.
- **Docs tab imports** follow the same limits.

### Journal (Phase 11)

- Free accounts get a limited journal, for example: reading sessions for the current year only, a review length cap, and one active goal (the default books per year). Subscribers get full history, longer reviews and any number of goals.
- **Progress by format** (pages, percentage, audiobook time) works on every plan; it's part of reading a book.
- Exact limits wait until Phase 11 is planned.

### AI enrichment

- **Every catalog book is enriched once, whatever the reader's plan,** since enrichment is shared. A free account's adds still get genres and tropes.
- **The Sonnet retry above** is for subscribers only.
- **A lower `AI_ENRICH` rate limit** (5b3) for free accounts, so a free account can't run up the bill with many single adds.

### Other limits that make sense

- **API tokens:** one for free accounts (enough for the extension), more for subscribers.
- **Metadata lookups:** a daily cap on ISBN lookups and searches for free accounts, on top of the per-minute limit, since they spend the Google Books quota.
- **Covers:** none. Covers are served from Open Library and Google Books, so they cost nothing to store.
- **Data export** (Later): never limited. Readers can always take their data with them, on any plan.

### Needs deciding first

- **Payments:** a provider (for example Stripe), a `Subscription` table with RLS, and webhooks for its status. That's a new dependency and an architectural change.
- **Existing accounts:** whether accounts from before this phase keep everything free.
- **The privacy policy** must say what the payment provider receives.
