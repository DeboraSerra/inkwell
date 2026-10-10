# Phase 7 — Quality and deploy

[← Plan overview](README.md)

- zod validation on every input. Every query is scoped by `userId` (write a test for this). Rate-limit the import and AI endpoints.
- Vitest for domain logic (dedupe, goal progress) and Playwright for one happy path.
- GitHub Actions: lint, typecheck, test, `npm audit --audit-level=high`. Dependabot for npm.
- Vercel deploy with a Neon branch per preview deployment.
