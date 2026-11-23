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

## 10c — Name and age when creating an account

Asked by the user on 2026-11-22.

1. **`/login`, "Create an account" only** (`components/pages/login/EmailSignInForm.tsx`): two optional fields, **Name** and **Age**, after email and password. "Sign in" and "Continue with Google" don't show them.
2. **Saved through the same rules as the profile:** `profile.schema.ts` (10a) validates them; an empty field stores nothing. Age is a whole number in the range of open question 2, stored as that question decides.
3. **How they reach the server:** `auth.controller.signIn(idToken, next)` gains an optional profile argument, validated, and passed to `upsertUser` only when the account's `User` row is created, so signing in again never overwrites a profile edit. Not sent to Firebase (open question 4).
4. **Errors:** a bad age shows next to the field before Firebase creates the account; a server-side rejection after it shows a message and still signs in, the fields being optional.
5. **Accessibility:** both fields labelled, Age as `inputMode="numeric"` with a hint that it's optional; the axe check in `EmailSignInForm.test.tsx` covers the "Create an account" state, and the Playwright tab-order check on `/login` still passes.
6. **Tests:** the form (fields only when creating, sent trimmed, empty sends nothing, bad age blocked), the controller (validated, ignored for an existing user), the service and model (only on create, scoped by `userId`).
7. `/privacy` says the name and age given at sign-up are stored and editable (with 10b's change).

**Done when**

- The reader can change and clear their name, photo and the other fields, and the change shows in the sidebar and survives signing out and back in.
- A new email account can give a name and age, or skip both; they appear in the profile, and signing in again doesn't change them.
- The email can't be changed by any request.
- `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass.

## Open questions

1. **Where does it live?** The existing Profile tab in `/settings` (recommended, no new route), or its own `/profile` page with Settings keeping only the tokens?
2. **Age:** keep `age` (a number that goes stale), replace it with a birth date or birth year (a new column, additive migration), or drop it from the profile? Recommended: replace it with an optional birth year, or remove it if nothing will use it. Since 2026-11-22 the user wants an optional age on sign-up (10c), so it stays in the profile; still open is whether it's stored as `age` or as a birth year worked out from it, and the accepted range (for example 13–120).
3. **Photo:** a typed image address only (no new service), or an upload (Firebase Storage or Supabase Storage, which `/privacy` would then need to mention)? And should signing in keep refreshing the Google photo until the reader changes it?
4. **Sync to Firebase:** should a name change also update the Firebase account's display name, or stay only in Inkwell (recommended)?
5. **More fields:** anything else to add now, for example a reading timezone (useful for Phase 11's goal periods) or a preferred default format for new books?
