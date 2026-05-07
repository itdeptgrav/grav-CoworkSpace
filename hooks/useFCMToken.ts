// hooks/useFCMToken.ts
// Registers device for FCM push notifications.
// - Background/closed: service worker shows native push (firebase-messaging-sw.js)
// - Foreground: onMessage fires but we do NOT show browser Notification manually
//   (the in-app bell/badge system already handles this via Firestore onSnapshot)
"use client";
import { useEffect, useRef } from "react";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "../lib/coworkFirebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

export function useFCMToken(employeeId: string | null) {
    const tokenSavedRef = useRef(false);

    useEffect(() => {
        if (!employeeId) return;
        if (typeof window === "undefined") return;
        if (!("Notification" in window)) return;
        if (!("serviceWorker" in navigator)) return;

        const setup = async () => {
            try {
                // 1. Request permission
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    console.log("[FCM] Notification permission denied");
                    return;
                }

                // 2. Register service worker
                const swReg = await navigator.serviceWorker.register(
                    "/firebase-messaging-sw.js",
                    { scope: "/" }
                );
                await navigator.serviceWorker.ready;
                console.log("[FCM] Service worker registered:", swReg.scope);

                // 3. Detect iOS Safari — Firebase Messaging getToken does NOT work on iOS
                const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
                    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                const isIOSSafari = isIOS || isSafari;

                let token: string | null = null;

                if (isIOSSafari) {
                    // iOS Safari: use Web Push API directly with VAPID key
                    // Firebase getToken() does not work on iOS — use pushManager.subscribe instead
                    console.log("[FCM] iOS/Safari detected — using Web Push API directly");
                    try {
                        // Convert VAPID key to Uint8Array
                        const vapidBytes = urlBase64ToUint8Array(VAPID_KEY).buffer as ArrayBuffer;
                        const existing = await swReg.pushManager.getSubscription();
                        const sub = existing || await swReg.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: vapidBytes,
                        });
                        // Use endpoint as token identifier for iOS
                        token = JSON.stringify(sub.toJSON());
                        console.log("[FCM] iOS Web Push subscription obtained ✅");
                    } catch (e: any) {
                        console.warn("[FCM] iOS push subscribe failed:", e?.message);
                        return;
                    }
                } else {
                    // Android/Chrome/Desktop: use Firebase Messaging getToken
                    const messaging = getMessaging(firebaseAuth.app);
                    const fcmToken = await getToken(messaging, {
                        vapidKey: VAPID_KEY,
                        serviceWorkerRegistration: swReg,
                    });
                    if (!fcmToken) {
                        console.warn("[FCM] No token received — check VAPID key");
                        return;
                    }
                    token = fcmToken;
                    console.log("[FCM] FCM token obtained:", token.slice(0, 20) + "...");

                    // Foreground message handler (Android/Chrome only)
                    onMessage(messaging, (payload) => {
                        console.log("[FCM] Foreground message:", payload.notification?.title);
                    });
                }

                // 4. Check if token changed vs what's stored
                const deviceKey = `${isIOSSafari ? "ios" : "web"}_${navigator.userAgent.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "_")}`;
                const existingDoc = await import("firebase/firestore").then(({ getDoc }) =>
                    getDoc(doc(firebaseDb, "cowork_fcm_tokens", employeeId))
                );
                const existingToken = existingDoc.exists()
                    ? (existingDoc.data()[`device_${deviceKey}`] || existingDoc.data().latestToken)
                    : null;
                const tokenChanged = existingToken && existingToken !== token;

                // Save new token to Firestore
                await setDoc(
                    doc(firebaseDb, "cowork_fcm_tokens", employeeId),
                    {
                        employeeId,
                        [`device_${deviceKey}`]: token,
                        latestToken: token,
                        updatedAt: serverTimestamp(),
                        platform: isIOSSafari ? "ios-web" : "web",
                        userAgent: navigator.userAgent.slice(0, 100),
                    },
                    { merge: true }
                );

                // If token changed → show update banner so user knows notifications are refreshed
                if (tokenChanged && typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("cowork:fcm-token-updated"));
                }

                console.log("[FCM] Token saved/refreshed to Firestore ✅", tokenChanged ? "(token changed)" : "(same token)");

            } catch (err: any) {
                console.error("[FCM] Setup error:", err?.message || err);
            }
        };

        setup();
    }, [employeeId]);
}

// Helper: convert VAPID base64 key to Uint8Array for Web Push API
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
