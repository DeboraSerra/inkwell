# Phase 0 — Fix the security issues

[← Plan overview](README.md)

**Status: ✅ Done** on branch `fix/security-deps` (not merged yet).

`npm audit` in `inkwell/` reports:

- **next 16.2.6 — critical.** Includes middleware/proxy bypass, RCE in image optimization and `next/og`, SSRF in Server Actions and rewrites, and cache poisoning. Fixed in **≥ 16.3.8**; 16.4.0 is the latest.
- postcss ≤ 8.5.22 (high). It comes in through `next` and `@tailwindcss/postcss`.
- firebase → `@firebase/firestore` → `@grpc/grpc-js` (high), plus protobufjs (moderate).
- prisma → `@prisma/config` → `deepmerge-ts` (high). This only affects development tooling.
- baseline-browser-mapping, nanoid (moderate). Transitive dependencies.

Steps:
1. Bump `next` and `eslint-config-next` to `16.4.0` (they are pinned exactly today, so `npm audit fix` won't touch them).
2. Read `node_modules/next/dist/docs` for the 16.2 → 16.4 changes (as `inkwell/AGENTS.md` asks) and apply any breaking changes.
3. `npm audit fix` (non-forced) for transitive fixes. If postcss is still vulnerable, add an `overrides` entry for it.
4. Update `firebase` to the latest 12.x. If grpc-js is still flagged, add an `overrides` entry for `@grpc/grpc-js`. Note: the web app only needs `firebase/auth`, and grpc is only used by Firestore on Node.
5. Align Prisma: right now it's `@prisma/adapter-pg@7` with `prisma`/`@prisma/client@6`. Move all three to 7.x (this also fixes deepmerge-ts), and update `prisma.config.ts` and the generator config.
6. Check that `npm run build`, `npm run lint` and `npm audit` all pass. Do the same audit for `extention/firebase-project`.
7. Commit on its own branch/PR: `fix: upgrade next to 16.4 and patch vulnerable deps`.

## Outcome

- `next` / `eslint-config-next` → 16.4.0. The 16.3/16.4 upgrade notes only add the optional Cache Components feature, so no code changes.
- `prisma`, `@prisma/client`, `@prisma/adapter-pg` → 7.10.0. Removed `engine: "classic"` from `prisma.config.ts` and `url` from the schema datasource.
- `firebase` → 12.19.0.
- `overrides` in `package.json`: `@grpc/grpc-js`, `protobufjs`, `postcss`, `deepmerge-ts`, `mysql2`. The latest upstream releases still pull in vulnerable versions of these.
- `prisma/seed.ts` now uses the shared adapter-backed client. The build was already failing on this before the upgrade.
- `npm run build` and `npm run lint` pass.
- Accepted risk: `braces`, which is dev-only (via `eslint-config-next`) and has no fixed release.
- `extention/firebase-project` has no npm dependencies, so there was nothing to fix.
