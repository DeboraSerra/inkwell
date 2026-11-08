import {
  inMemoryPersistence,
  setPersistence,
  signOut as firebaseSignOut,
  type UserCredential,
} from "firebase/auth";
import { signIn } from "@/server/auth/auth.controller";
import { auth } from "./firebase";

// Runs a Firebase sign-in (Google, email and password, …) and swaps the result
// for the server's httpOnly session cookie. The cookie is the source of truth,
// so Firebase's own browser session is kept in memory and dropped right away.
export async function signInWithFirebase(
  firebaseSignIn: () => Promise<UserCredential>,
  next?: string,
) {
  await setPersistence(auth, inMemoryPersistence);
  const { user } = await firebaseSignIn();
  const idToken = await user.getIdToken();
  await firebaseSignOut(auth);
  return signIn(idToken, next);
}
