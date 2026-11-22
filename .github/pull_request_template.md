## What changed

<!-- A sentence or two, and the plan step (for example "Phase 7, 7b"). -->

## Checklist

- [ ] The plan is updated: status in the phase file and in `docs/plan/README.md`, and an "Outcome" section
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass (from `inkwell/`)
- [ ] Checked in the app, when the change is visible there
- [ ] `/privacy` is updated, if what the app or extension collects, or where data goes, changed
- [ ] New environment variables are in `inkwell/.env.example` (placeholders only), and set on Vercel
- [ ] A schema change has its migration, with row-level security on any new table
