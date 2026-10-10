import "server-only";
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId =
  process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Env vars can't hold real newlines on most hosts, so the key is stored with "\n".
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replaceAll(String.raw`\n`, "\n");

const serviceAccount =
  clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey }) : null;

if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
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
