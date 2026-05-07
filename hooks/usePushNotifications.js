"use client";
/**
 * hooks/usePushNotifications.js
 *
 * Registers the service worker, requests Notification permission,
 * then listens to cowork_notifications (Firestore) in real time.
 * Any new notification doc triggers a native browser push via the SW.
 *
 * Works on desktop Chrome/Edge/Firefox and mobile Chrome (Android).
 * iOS Safari requires PWA install but works on iOS 16.4+.
 */
import { useEffect, useRef } from "react";
import { firebaseDb } from "../lib/coworkFirebase";
import {
    collection, query, where, orderBy, limit,
    onSnapshot,
} from "firebase/firestore";

/* ── Send a notification to the service worker to display ── */
function showViaServiceWorker(sw, { title, body, icon, tag, url }) {
    if (!sw) return;
    sw.active?.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        body,
        icon: icon || "/icons/icon-192x192.png",
        tag: tag || "cowork-notif-" + Date.now(),
        data: { url: url || "/coworking" },
    });
}

/* ── Fallback: use the Notification API directly (no SW required) ── */
async function showDirect({ title, body, icon, tag, url }) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // On iOS Safari PWA, new Notification() is blocked — must use SW showNotification
    if ("serviceWorker" in navigator) {
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, {
                body,
                icon: icon || "/icon-192.png",
                badge: "/icon-192.png",
                tag: tag || "cowork-" + Date.now(),
                renotify: true,
                requireInteraction: false,
                data: { url: url || "/coworking" },
                vibrate: [200, 100, 200],
            });
            return;
        } catch (e) {
            // fall through to direct Notification below
        }
    }
    try {
        const n = new Notification(title, {
            body,
            icon: icon || "/icon-192.png",
            tag: tag || "cowork-" + Date.now(),
            requireInteraction: false,
        });
        n.onclick = () => { window.focus(); window.location.href = url || "/coworking"; n.close(); };
    } catch (e) { /* Notification blocked */ }
}

export function usePushNotifications(employeeId) {
    const swRef = useRef(null);
    const seenRef = useRef(Date.now()); // initialize immediately to avoid replaying old notifications
    const initialised = useRef(false);

    /* ── 1. Register service worker + request permission ── */
    useEffect(() => {
        if (!employeeId || initialised.current) return;
        initialised.current = true;

        const init = async () => {
            /* Request permission */
            if (typeof Notification === "undefined") return;
            let perm = Notification.permission;
            if (perm === "default") {
                perm = await Notification.requestPermission();
            }
            if (perm !== "granted") return;

            /* Register SW */
            if ("serviceWorker" in navigator) {
                try {
                    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
                    swRef.current = reg;
                    // Wait for SW to be active
                    await navigator.serviceWorker.ready;
                } catch (e) {
                    console.warn("SW registration failed:", e);
                    // Will fall back to direct Notification API
                }
            }

            // Mark the current time so we only notify for future items
            seenRef.current = Date.now();
        };

        init();
    }, [employeeId]);

    /* ── 2. Listen to cowork_notifications and fire push for new ones ── */
    useEffect(() => {
        if (!employeeId) return;

        const q = query(
            collection(firebaseDb, "cowork_notifications"),
            where("recipientEmployeeId", "==", employeeId),
            where("read", "==", false),
            orderBy("createdAt", "desc"),
            limit(20)
        );

        let firstLoad = true;

        const unsub = onSnapshot(q, snap => {
            // Skip the very first snapshot (existing unread items on mount)
            if (firstLoad) {
                firstLoad = false;
                // Seed seenRef with the latest notification time so we don't replay old ones
                if (snap.docs.length > 0) {
                    const latest = snap.docs[0].data().createdAt;
                    const latestMs = latest?.seconds ? latest.seconds * 1000 : Date.now();
                    seenRef.current = latestMs;
                } else {
                    seenRef.current = Date.now();
                }
                return;
            }

            snap.docChanges().forEach(change => {
                if (change.type !== "added") return;
                const data = change.doc.data();

                // Only notify if this doc is newer than our baseline
                const createdMs = data.createdAt?.seconds
                    ? data.createdAt.seconds * 1000
                    : Date.now();
                if (seenRef.current && createdMs <= seenRef.current) return;
                seenRef.current = Math.max(seenRef.current || 0, createdMs);

                const title = data.title || "CoWork";
                const body = data.body || "";
                const url = data.data?.taskId
                    ? `/coworking/tasks`
                    : "/coworking";
                const tag = data.type + "-" + change.doc.id;
                const type = data.type || "";

                // If app is open and visible → show in-app toast (works on ALL devices)
                if (document.visibilityState === "visible") {
                    window.dispatchEvent(new CustomEvent("cowork:notification", {
                        detail: { title, body, url, type }
                    }));
                    return; // don't show OS push when app is open
                }

                // App is in background → show OS push notification
                showDirect({ title, body, tag, url });
                if (swRef.current?.active) {
                    showViaServiceWorker(swRef.current, { title, body, tag, url });
                }
            });
        }, () => { });

        return () => unsub();
    }, [employeeId]);
}