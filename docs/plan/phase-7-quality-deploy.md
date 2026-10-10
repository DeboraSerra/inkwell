# Phase 7 — Quality and deploy

[← Plan overview](README.md)

- zod validation on every input. Every query is scoped by `userId` (write a test for this). Rate-limit the import and AI endpoints.
- Playwright for one happy path (Vitest and the domain-logic tests arrive in Phase 2a–2e).
- GitHub Actions: lint, typecheck, test, `npm audit --audit-level=high`. Dependabot for npm.
- Vercel deploy with a Neon branch per preview deployment.
