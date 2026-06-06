import { initializeApp, getApps, getApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"

const LIVE_APP_NAME = "office-monitor-live"

const liveConfig = {
    apiKey: "AIzaSyB2GAz05d4Bh0cnLN0aJ8grmSxz-04gKl4",
    authDomain: "grav-office-monitor.firebaseapp.com",
    projectId: "grav-office-monitor",
    storageBucket: "grav-office-monitor.firebasestorage.app",
    messagingSenderId: "552939875121",
    appId: "1:552939875121:web:98f24ed46b5c8c865d1e10"
}

const liveApp = getApps().find(a => a.name === LIVE_APP_NAME)
    ? getApp(LIVE_APP_NAME)
    : initializeApp(liveConfig, LIVE_APP_NAME)

export const liveDb = getFirestore(liveApp)