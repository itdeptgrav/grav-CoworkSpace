import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const OM_APP_NAME = "office-monitor";

const omConfig = {
    apiKey: "AIzaSyBY5I-wKODX_TPM31eWW-unPlLiB4YFpqI",
    authDomain: "testing-63656.firebaseapp.com",
    projectId: "testing-63656",
    storageBucket: "testing-63656.firebasestorage.app",
    messagingSenderId: "340164780961",
    appId: "1:340164780961:web:d1d45008ec029fa310a1e0",
};

const omApp = getApps().find((a) => a.name === OM_APP_NAME)
    ? getApp(OM_APP_NAME)
    : initializeApp(omConfig, OM_APP_NAME);

export const omDb = getFirestore(omApp);
export const omStorage = getStorage(omApp);