// lib/coworkPushNotifications.js — cowork variant of pushNotifications.js,
// pointed at the Firebase-authed /api/cowork/notifications/* routes.
import { firebaseAuth } from "./coworkFirebase"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function authHeaders() {
  const token = await firebaseAuth.currentUser?.getIdToken()
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }
}

export async function initPushNotifications() {
  try {
    if (typeof window === "undefined") return { ok: false, reason: "ssr" }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "unsupported" }

    const reg = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready

    const permission = await Notification.requestPermission()
    if (permission !== "granted") return { ok: false, reason: "denied" }

    const headers = await authHeaders()
    const keyRes = await fetch(`${API_URL}/api/cowork/notifications/vapid-public-key`, { headers })
    const keyJson = await keyRes.json()
    if (!keyJson.success) return { ok: false, reason: "server-not-configured" }

    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey),
      })
    }

    const subRes = await fetch(`${API_URL}/api/cowork/notifications/subscribe`, {
      method: "POST", headers,
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })
    const subJson = await subRes.json()
    return { ok: !!subJson.success, reason: subJson.success ? "subscribed" : subJson.message }
  } catch (err) {
    console.error("[cowork-push] init failed:", err)
    return { ok: false, reason: err.message }
  }
}