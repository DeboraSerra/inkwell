# Phase 7 — Quality and deploy

[← Plan overview](README.md)

- zod validation on any input the MVP didn't cover. Every query is scoped by `userId` (write a test for this). Rate-limit the import and AI endpoints.
- Playwright for one happy path (Vitest and the domain-logic tests already exist).
- GitHub Actions: lint, typecheck, test, `npm audit --audit-level=high`. Dependabot for npm.
- Vercel deploy. Preview deployments use their own Supabase database, never production's.

## Publishing the extension

The extension (`extension/`) talks to whichever Inkwell address is saved in its options, using an API token. Nothing in it is tied to localhost except the manifest's permissions and the options page's placeholder.

### To use it with the deployed site (no store needed)

1. **Deploy the app first,** with `npx prisma migrate deploy` run against the Supabase database and every variable from `.env.example` set on Vercel.
2. **Create an API token on the deployed site,** at `https://<your-domain>/settings`. Tokens live in each database, so a local one won't work in production.
3. **In the extension's options,** set the App URL to `https://<your-domain>` and paste the token. Chrome asks once for permission to reach that address; "Save and test" should then say "Connected as …".

The extension can stay loaded unpacked (`chrome://extensions` → Developer mode → Load unpacked), from `extension/` for local use or from `extension/dist/package/` for the deployed site (see below).

### To publish on the Chrome Web Store

**Built (2026-11-08):**

- **Icons:** `extension/icons/icon.svg` is the app's logo (`inkwell/public/assets/logo-dark.svg`) on the app's navy, rendered to 16, 48 and 128 px PNGs that the manifest uses. The old `extension/icon.png` is no longer referenced.
- **Default address:** `extension/config.js` holds it. It's localhost in the source folder, and the build writes the deployed address in. The options page starts from it and only asks Chrome for permission for an address the manifest doesn't already allow.
- **`extension/build.mjs`:** builds the store package from the source folder, which stays set up for development. In the package:
  - `host_permissions` is just the deployed origin, with no localhost and no `optional_host_permissions`.
  - It contains only the extension's own files, about 16 KB zipped.
  - The output is in `extension/dist/`, which git ignores.
- **Privacy policy:** a public page at `/privacy` (`inkwell/src/app/privacy/page.tsx`), linked from the login page. It covers sign-in, the library, book lookups, what the extension reads and sends, where data is kept (Vercel, Supabase, Firebase Authentication), and deletion. **Update it whenever any of that changes,** for example with Phase 5's AI.
- **Version:** 2.1.0. Bump it in `extension/manifest.json` before every upload.
- **Tested:**
  - The build refuses a missing, `http`, or path-bearing address, and with a stand-in domain it wrote the right manifest, config and zip contents.
  - The real options page, in both builds, with a stand-in for Chrome's API:
    - **Development build:** connects to localhost with no prompt, asks before using another `https` address, and refuses plain `http`.
    - **Store build:** starts on the deployed address and connects with no prompt. It refuses any other address and saves nothing.
- **Not tested:** loading either build in real Chrome, and a run against the deployed site.

**To build and upload:**

```bash
node extension/build.mjs https://<your-domain>
```

1. Load `extension/dist/package/` unpacked in `chrome://extensions` and run an import once against the deployed site.
2. Upload `extension/dist/inkwell-kindle-import-<version>.zip` in the Chrome Web Store developer dashboard.

**Listing text, ready to paste:**

- **Single purpose:** "Imports the books and personal documents listed on Amazon's Manage Your Content and Devices page into the user's own Inkwell reading journal."
- **Permission justifications:**
  - `activeTab` and `scripting`: "Reads the Amazon content list only in the tab where the user clicks the extension, by injecting the import script into that tab at that moment."
  - `storage`: "Keeps the user's Inkwell address and API token on their computer."
  - **Host permission** (`https://<your-domain>/*`): "Sends the imported list to the user's Inkwell site, and nowhere else."
- **Data use form:** declare "Website content" (titles, authors, cover addresses and ASINs read from the Amazon page) and "Authentication information" (the Inkwell API token, stored locally). Then confirm that data isn't sold, isn't used for unrelated purposes, and isn't used for creditworthiness.
- **Privacy policy URL:** `https://<your-domain>/privacy`.
- **Also needed:** a developer account (a one-time fee), at least one 1280×800 screenshot, a 128 px store icon (`extension/icons/icon-128.png`), and the visibility setting. "Unlisted" suits a personal app.
