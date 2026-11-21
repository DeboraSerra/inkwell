# Phase 9 — Mobile app

[← Plan overview](README.md)

⏳ Planned, not started. Added on 2026-11-21. Starts after [Phase 8](phase-8-mobile-api.md), and only on the `/api/v1` API it builds: the app never talks to the database or the services directly.

## Before this phase

- **Native app or PWA** (Phase 8's first open question). If a PWA is enough, this phase becomes making the web app installable: a manifest, icons, a service worker for the app shell, and checking every page on a phone.
- **Stack**, if native: recommended React Native with Expo. It's TypeScript and React like the web app, it runs on iOS and Android from one codebase, and Firebase Auth and the camera have maintained libraries. Needs your approval, as a new app and new dependencies.
- **Where it lives:** a new top-level folder (for example `mobile/`) next to `inkwell/` and `extension/`. Types the API returns are shared from `inkwell/src/types/` or generated from Phase 8's OpenAPI file, never copied by hand.

## Steps

### 9a — The app shell and sign-in

- Google sign-in (and email and password, as on the web) through Firebase, sending the ID token to `/api/v1` (Phase 8a). The token is kept in the device's secure storage, never in plain storage.
- Tabs matching the web app: Shelves, Add, Settings.
- **Done when:** a reader signs in on iOS and Android, sees their account from `GET /api/v1/me`, and signs out.

### 9b — Browse and move books

- The five lists and "Owned", with search, filters, sort and pagination, as on `/books/shelves`; covers through the same Open Library and Google Books URLs.
- Moving books between lists (with dates for Finished and DNF), changing formats, editing and removing, all through `/api/v1`.
- **Done when:** everything the shelves page does works in the app, and a change made in the app shows on the web and the other way round.

### 9c — Add books

- One add form like `/books/new`: the ISBN lookup at the top, the title search as you type, and adding by hand.
- **Barcode scanning with the phone camera,** using the platform's scanner rather than the browser one. It's the main reason to have an app.
- **Done when:** adding by ISBN, scan, search and by hand all work, and a book already in the library offers only "Add formats".

### 9d — Journal

- The Phase 6 features: reading sessions, reviews, goals and progress by format, built on its `/v1` routes.
- **Done when:** a reader can log a session and see goal progress in the app.

### 9e — Release

- App Store and Google Play listings, the privacy policy linked from both (kept true, as `/privacy` requires), and the stores' privacy forms.
- Crash and error reporting that never records tokens or book details.
- **Done when:** the app is published on both stores and the user has checked it on their own phones.

## Not in this phase

- Offline use and sync (Phase 8's third open question).
- The Kindle import: it stays in the Chrome extension, which reads the Amazon page in a desktop browser.
- Push notifications (for example a reading reminder), which would need their own decision.
