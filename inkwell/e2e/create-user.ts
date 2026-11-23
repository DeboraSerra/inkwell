import globalSetup from "./global-setup";

// Makes the test user and its library, as before the browser tests
// (npm run e2e:user). Needs the emulator and npm run e2e:serve running; sign in
// at http://localhost:3100 with E2E_USER_EMAIL and E2E_USER_PASSWORD from .env.test.
await globalSetup();
