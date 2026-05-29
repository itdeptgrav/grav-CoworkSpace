import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBY5I-wKODX_TPM31eWW-unPlLiB4YFpqI",
    authDomain: "testing-63656.firebaseapp.com",
    projectId: "testing-63656",
    storageBucket: "testing-63656.firebasestorage.app",
    messagingSenderId: "340164780961",
    appId: "1:340164780961:web:d1d45008ec029fa310a1e0",
};

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

