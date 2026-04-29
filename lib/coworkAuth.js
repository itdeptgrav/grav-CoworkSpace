import { firebaseAuth, firebaseDb } from "./coworkFirebase";
import { signInWithEmailAndPassword, signOut, updatePassword, onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

export const coworkSignIn = async (email, password) => {
    // Step 1: Firebase Auth sign-in
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const { user } = credential;

    

    // Step 2: Get role from custom claims
    const tokenResult = await user.getIdTokenResult(true);
    const role = tokenResult.claims.role;

    // Step 3: Verify employee exists in Firestore
    // Query by authUid first, fallback to email — mirrors backend verifyEmployeeToken
    let employee = null;
    try {
        const empCol = collection(firebaseDb, "cowork_employees");
        let snap = await getDocs(query(empCol, where("authUid", "==", user.uid)));
        if (snap.empty) {
            snap = await getDocs(query(empCol, where("email", "==", email)));
        }
        if (!snap.empty) employee = snap.docs[0].data();
    } catch (_) {
        // Firestore read failed — block for safety
    }

    // Step 4: Not found in database → sign out + error
    if (!employee) {
        await signOut(firebaseAuth);
        const err = new Error("Account not found in workspace. Contact your administrator.");
        err.code = "cowork/employee-not-found";
        throw err;
    }

    // Step 5: Account deactivated → sign out + error
    if (employee.isActive === false || employee.status === "inactive" || employee.status === "suspended") {
        await signOut(firebaseAuth);
        const err = new Error("Your account has been deactivated. Contact your administrator.");
        err.code = "cowork/account-inactive";
        throw err;
    }

    // Step 6: All good
    return { user, role, employee };
};

export const coworkSignOut = () => signOut(firebaseAuth);
export const onCoworkAuthChange = (cb) => onAuthStateChanged(firebaseAuth, cb);
