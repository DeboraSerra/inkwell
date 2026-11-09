# Phase 7 — Quality and deploy

[← Plan overview](README.md)

- zod validation on any input the MVP didn't cover. Every query is scoped by `userId` (write a test for this). Rate-limit the import and AI endpoints.
- Playwright for one happy path (Vitest and the domain-logic tests already exist).
- GitHub Actions: lint, typecheck, test, `npm audit --audit-level=high`. Dependabot for npm.
- Vercel deploy with a Neon branch per preview deployment.

## Publishing the extension

The extension (`extension/`) talks to whichever Inkwell address is saved in its options, using an API token. Nothing in it is tied to localhost except the manifest's permissions and the options page's placeholder.

### To use it with the deployed site (no store needed)

1. **Deploy the app first,** with `npx prisma migrate deploy` run against Neon and every variable from `.env.example` set on Vercel.
2. **Create an API token on the deployed site,** at `https://<your-domain>/settings`. Tokens live in each database, so a local one won't work in production.
3. **In the extension's options,** set the App URL to `https://<your-domain>` and paste the token. Chrome asks once for permission to reach that address; "Save and test" should then say "Connected as …".

The extension can stay loaded unpacked (`chrome://extensions` → Developer mode → Load unpacked). Point Chrome at a folder with only the extension's files, not `firebase-project/` (see below).

### To publish on the Chrome Web Store

Changes to make first:

- **Permissions:**
  - Replace `optional_host_permissions: ["https://*/*"]` with the deployed origin in `host_permissions`, for example `"https://<your-domain>/*"`. The store asks for a justification for broad host access and reviews it more slowly. A fixed origin also removes the permission prompt in the options page.
  - Remove `http://localhost/*` and `http://127.0.0.1/*` from the store build. They only matter for development.
- **Options:**
  - Default the App URL to the deployed origin in `options.html` (the placeholder) and `options.js`. Then a new install only needs the token.
  - With a fixed origin, drop `chrome.permissions.request` from `options.js`, or keep it only for other addresses.
- **Icons:** add an `icons` entry with 16, 48 and 128 px PNGs. Today there's only a 512 px `icon.png` used as the toolbar icon. The store also needs a 128 px icon for the listing.
- **Package:** zip only `manifest.json`, `app.js`, `background.js`, `options.html`, `options.js` and the icons. **Leave out `firebase-project/`:** it's a legacy, unused project of 158 MB, with `node_modules`, inside the extension folder. Moving it out of `extension/` would make this automatic.
- **Version:** bump `version` in `manifest.json` for every upload.

Store requirements outside the code:

- A developer account: a one-time fee, then registration.
- **A privacy policy URL.** The extension reads the Amazon content list and sends titles, authors, covers and ASINs to Inkwell, and stores an API token. The listing's data-use form must declare both. A short page on the Inkwell site is enough.
- A single-purpose description, a justification for each permission (`activeTab`, `scripting`, `storage`, the host permission), and at least one 1280×800 screenshot.
- **Visibility:** "Unlisted" keeps it out of search but installable from its link, which suits a personal app. "Private" limits it to testers you name.
