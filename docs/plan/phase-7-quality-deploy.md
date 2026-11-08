# Phase 7 — Quality and deploy

[← Plan overview](README.md)

- zod validation on any input the MVP didn't cover. Every query is scoped by `userId` (write a test for this). Rate-limit the import and AI endpoints.
- Playwright for one happy path (Vitest and the domain-logic tests already exist).
- GitHub Actions: lint, typecheck, test, `npm audit --audit-level=high`. Dependabot for npm.
- Vercel deploy with a Neon branch per preview deployment.
