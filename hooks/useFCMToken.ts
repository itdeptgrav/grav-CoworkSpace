// hooks/useFCMToken.ts
// ROBUST token registration:
// - Runs on EVERY app open (no tokenSavedRef gate)
// - Stores token per device key (reinstall overwrites stale token)
// - onTokenRefresh handles FCM auto-rotation
// - Works for all cases: reinstall, crash, cache clear, new device
"use client";
import { useEffect } from "react";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "../lib/coworkFirebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

// Stable device key — same device always gets same key
// Uses only alphanumeric chars safe for Firestore field names
function getDeviceKey(): string {
    const ua = navigator.userAgent;
    const screen = `${window.screen.width}x${window.screen.height}`;
    const lang = navigator.language;
    const raw = `${ua}_${screen}_${lang}`;
    // Hash to safe alphanumeric string — no special chars
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }
    return `dev${Math.abs(hash).toString(36)}`;
}

async function saveToken(employeeId: string, token: string): Promise<void> {
    const { arrayUnion } = await import("firebase/firestore");
    const deviceKey = getDeviceKey();
    await setDoc(
        doc(firebaseDb, "cowork_fcm_tokens", employeeId),
        {
            employeeId,
            // Per-device key: reinstall/refresh overwrites old stale token
            [deviceKey]: token,
            // Also keep in array for backward compatibility with backend
            tokens: arrayUnion(token),
            latestToken: token,
            updatedAt: serverTimestamp(),
            platform: "web",
            userAgent: navigator.userAgent.slice(0, 100),
        },
        { merge: true }
    );
    console.log("[FCM] Token saved ✅", token.slice(0, 20) + "...");
}

export function useFCMToken(employeeId: string | null) {

    useEffect(() => {
        if (!employeeId) return;
        if (typeof window === "undefined") return;
        if (!("Notification" in window)) return;
        if (!("serviceWorker" in navigator)) return;
        // Only run if permission already granted or not yet asked
        // Don't re-ask if denied
        if (Notification.permission === "denied") return;

        const setup = async () => {
            try {
                // 1. Request permission if not granted yet
                if (Notification.permission !== "granted") {
                    const permission = await Notification.requestPermission();
                    if (permission !== "granted") {
                        console.log("[FCM] Permission denied");
                        return;
                    }
                }

                // 2. Register service worker
                const swReg = await navigator.serviceWorker.register(
                    "/firebase-messaging-sw.js", { scope: "/" }
                );
                await navigator.serviceWorker.ready;

                // 3. Get fresh FCM token every app open
                const messaging = getMessaging(firebaseAuth.app);
                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: swReg,
                });

                if (!token) {
                    console.warn("[FCM] No token received");
                    return;
                }

                // 4. Save fresh token — overwrites stale token for this device
                await saveToken(employeeId, token);

                // 5. Auto-refresh when FCM rotates token
                // This fires automatically when FCM invalidates old token
                (messaging as any).onTokenRefresh = async () => {
                    try {
                        const newToken = await getToken(messaging, {
                            vapidKey: VAPID_KEY,
                            serviceWorkerRegistration: swReg,
                        });
                        if (newToken) {
                            await saveToken(employeeId, newToken);
                            console.log("[FCM] Token auto-refreshed ✅");
                        }
                    } catch (e: any) {
                        console.warn("[FCM] Token refresh failed:", e?.message);
                    }
                };

                // 6. Foreground handler — in-app bell handles display
                onMessage(messaging, (payload) => {
                    console.log("[FCM] Foreground message:", payload.notification?.title);
                });

            } catch (err: any) {
                console.error("[FCM] Setup error:", err?.message || err);
            }
        };

        setup();
    }, [employeeId]); // runs every time employeeId is available (every app open)
}