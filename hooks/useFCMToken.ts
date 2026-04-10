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
        if (!employeeId || tokenSavedRef.current) return;
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

                // 3. Get FCM token
                const messaging = getMessaging(firebaseAuth.app);
                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: swReg,
                });

                if (!token) {
                    console.warn("[FCM] No token received — check VAPID key");
                    return;
                }

                console.log("[FCM] Token obtained:", token.slice(0, 20) + "...");

                // 4. Save token to Firestore cowork_fcm_tokens/{employeeId}
                await setDoc(
                    doc(firebaseDb, "cowork_fcm_tokens", employeeId),
                    {
                        employeeId,
                        token,
                        updatedAt: serverTimestamp(),
                        platform: "web",
                        userAgent: navigator.userAgent.slice(0, 100),
                    },
                    { merge: true }
                );

                tokenSavedRef.current = true;
                console.log("[FCM] Token saved to Firestore ✅");

                // 5. Foreground message handler
                // When app IS open, FCM delivers here via onMessage.
                // We log it but do NOT call new Notification() manually —
                // the in-app badge/bell system (useCoworkNotifications) already
                // shows alerts via Firestore. Showing a browser popup on top
                // would double-notify the user.
                onMessage(messaging, (payload) => {
                    console.log("[FCM] Foreground message received (app is open):", payload.notification?.title);
                    // In-app notification bell handles this automatically via Firestore.
                    // No manual browser Notification needed here.
                });

            } catch (err: any) {
                console.error("[FCM] Setup error:", err?.message || err);
            }
        };

        setup();
    }, [employeeId]);
}