import { firebaseAuth, firebaseDb } from "./coworkFirebase";
import { signInWithEmailAndPassword, signOut, updatePassword, onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

/**
 * coworkSignIn — Firebase Auth login + Firestore employee check.
 *
 * Flow:
 *  1. Sign in with Firebase Auth (email/password)
 *  2. Get ID token → read role custom claim
 *  3. Query cowork_employees for this UID
 *  4. If employee not found in Firestore → sign out + throw "not found" error
 *  5. If employee found but inactive → sign out + throw "inactive" error
 *  6. Return { user, role, employee }
 */
export const coworkSignIn = async (email, password) => {
    // Step 1: Firebase Auth
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const { user } = credential;

    // Step 2: Get role from custom claims
    const tokenResult = await user.getIdTokenResult(true);
    const role = tokenResult.claims.role;

    // Step 3: Verify employee exists in Firestore
    let employee = null;
    try {
        const snap = await getDocs(
            query(collection(firebaseDb, "cowork_employees"), where("uid", "==", user.uid))
        );
        if (!snap.empty) employee = snap.docs[0].data();
    } catch (_) {
        // Firestore read failed — still block login, don't let unknown users in
    }

    // Step 4: Employee not found in database
    if (!employee) {
        await signOut(firebaseAuth);   // ← CRITICAL: sign them out of Firebase Auth too
        const err = new Error("Your account was not found. Please contact your administrator.");
        err.code = "cowork/employee-not-found";
        throw err;
    }

    // Step 5: Employee exists but is deactivated / suspended
    if (employee.isActive === false || employee.status === "inactive" || employee.status === "suspended") {
        await signOut(firebaseAuth);
        const err = new Error("Your account has been deactivated. Contact your administrator.");
        err.code = "cowork/account-inactive";
        throw err;
    }

    // Step 6: All checks passed
    return { user, role, employee };
};

export const coworkSignOut = () => signOut(firebaseAuth);
export const onCoworkAuthChange = (cb) => onAuthStateChanged(firebaseAuth, cb);