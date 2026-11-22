# Phase 10 — Profile

[← Plan overview](README.md)

⏳ Planned. Asked by the user on 2026-11-21, to come after the dashboard (Phase 9) and before Phase 11.

Goal: the reader can see and edit their profile: everything stored about them except the email.

**What's stored today** (`User` in `prisma/schema.prisma`): `email`, `name`, `photoUrl` and `age`. `name` and `photoUrl` come from Firebase at sign-in (`auth.service.ts`); `age` is never set. The Settings page already has a "Profile" tab (`components/pages/settings/Profile.tsx`) that only says "Welcome".

## 10a — Backend

1. **`user.model.ts`:** `updateUserProfile(userId, data, db)`, an `update` by `id = userId`.
2. **Sign-in must not undo edits:** `upsertUser` already keeps `name` on update, but overwrites `photoUrl` from Firebase on every sign-in. Keep the reader's photo once they've set or removed it (a `photoEdited` flag, or only filling it when empty; see open question 3).
3. **`profile.schema.ts` (zod):** `name` trimmed, 1–80 characters, or empty to clear; `photoUrl` an `https` address, at most 2,048 characters, or empty; `age` per open question 2. The email is not accepted.
4. **`auth.service.updateProfile(userId, input)`** validates and saves; **`auth.controller.updateProfileAction`** authenticates with `requireUser()`, parses the FormData, maps `ValidationError` to field messages, and revalidates the layout (the sidebar footer shows the name).
5. **`GET /api/me`** keeps returning the same fields, now with the edited values.
6. **Tests** in `src/server/tests/auth/`: the schema (lengths, trimming, bad addresses), the service with the model mocked, the model scoped by `userId`, the controller refusing a signed-out call, and sign-in not overwriting an edited name or photo.

## 10b — Profile UI

1. The existing "Profile" tab in `/settings` (reachable as `/settings?tab=profile`, from 9d) becomes a form: photo preview, name, the open-question fields, and the email shown read-only with a note that it comes from the sign-in account.
2. shadcn components (`Input`, `Field`, `Button`, `Avatar`), the same field components as the book form where they fit, Server Action submit with pending state and inline errors.
3. The sidebar footer's "Settings" item can also be labelled "Profile" (see open question 1).
4. `/privacy` says the profile fields are stored and editable, and that they're deleted with the account.
5. Check it signed in, on a phone and a desktop width; mark the phase done here and in `README.md`, with an "Outcome" section.

**Done when**

- The reader can change and clear their name, photo and the other fields, and the change shows in the sidebar and survives signing out and back in.
- The email can't be changed by any request.
- `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass.

## Open questions

1. **Where does it live?** The existing Profile tab in `/settings` (recommended, no new route), or its own `/profile` page with Settings keeping only the tokens?
2. **Age:** keep `age` (a number that goes stale), replace it with a birth date or birth year (a new column, additive migration), or drop it from the profile? Recommended: replace it with an optional birth year, or remove it if nothing will use it.
3. **Photo:** a typed image address only (no new service), or an upload (Firebase Storage or Supabase Storage, which `/privacy` would then need to mention)? And should signing in keep refreshing the Google photo until the reader changes it?
4. **Sync to Firebase:** should a name change also update the Firebase account's display name, or stay only in Inkwell (recommended)?
5. **More fields:** anything else to add now, for example a reading timezone (useful for Phase 11's goal periods) or a preferred default format for new books?
