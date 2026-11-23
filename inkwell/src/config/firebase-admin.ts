import "server-only";
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// FIREBASE_AUTH_EMULATOR_HOST makes the Admin SDK accept unsigned tokens from
// the local emulator (the browser tests in e2e/), so it must never reach a deploy.
if (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.VERCEL) {
  throw new Error("FIREBASE_AUTH_EMULATOR_HOST must not be set on a deployment.");
}

const projectId =
  process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Env vars can't hold real newlines on most hosts, so the key is stored with "\n".
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replaceAll(String.raw`\n`, "\n");

const serviceAccount =
  clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey }) : null;

if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.warn(
    "[firebase-admin] FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set, " +
      "so sign-in will fail. Add them to .env.local (see .env.example).",
  );
}

const app = getApps().length
  ? getApp()
  : initializeApp({
      projectId,
      credential: serviceAccount ?? applicationDefault(),
    });

export const adminAuth = getAuth(app);
