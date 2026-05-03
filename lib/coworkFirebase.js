/**
 * GRAV-CMS/lib/coworkFirebase.js
 * Firebase client SDK — Auth + Firestore
 *
 * UPDATED: Added `getCoworkToken` — force-refreshes token on every call.
 * If the token is revoked (CEO reset password or changed role),
 * Firebase throws → we auto sign-out → redirect to /coworking-login.
 */
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,  // ← Added for RTDB
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firebaseDb = getFirestore(app);
export const firestore = getFirestore(app);

/**
 * getCoworkToken()
 *
 * Use this instead of firebaseAuth.currentUser.getIdToken() everywhere.
 *
 * - Always force-refreshes the token (forceRefresh: true)
 *   so revoked sessions are caught immediately.
 * - If token is revoked (CEO changed role / reset password):
 *     → Firebase throws "auth/user-token-expired"
 *     → We sign out the user
 *     → Redirect to /coworking-login
 *
 * Usage (replace your old getToken calls):
 *   const token = await getCoworkToken();
 */
export async function getCoworkToken() {
  const user = firebaseAuth.currentUser;

  if (!user) {
    // Not logged in — redirect
    if (typeof window !== "undefined") {
      window.location.href = "/coworking-login";
    }
    throw new Error("Not authenticated");
  }

  try {
    // forceRefresh: true — checks with Firebase server every time
    // If CEO revoked this session, this call will throw
    const token = await user.getIdToken(true);
    return token;
  } catch (err) {
    console.warn("[getCoworkToken] Token revoked or expired:", err.code || err.message);

    // Sign out and redirect to login
    try { await signOut(firebaseAuth); } catch (_) { }

    if (typeof window !== "undefined") {
      window.location.href = "/coworking-login";
    }

    throw new Error("Session expired. Please log in again.");
  }
}