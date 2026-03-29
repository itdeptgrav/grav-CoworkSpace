import { firebaseAuth } from "./coworkFirebase";
import { signInWithEmailAndPassword, signOut, updatePassword, onAuthStateChanged } from "firebase/auth";

export const coworkSignIn  = async (e,p) => { const c = await signInWithEmailAndPassword(firebaseAuth,e,p); const t = await c.user.getIdTokenResult(true); return { user:c.user, role:t.claims.role }; };
export const coworkSignOut = ()          => signOut(firebaseAuth);
export const onCoworkAuthChange = (cb)   => onAuthStateChanged(firebaseAuth, cb);
