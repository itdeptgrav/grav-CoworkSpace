/**
 * public/sw.js
 * CoWork Service Worker — Advanced push notifications.
 *
 * Features:
 *  - Rich notifications: icon, badge, image (attachment preview), actions
 *  - Sound via AudioContext played in the client (SW cannot play audio directly)
 *  - Deep-link routing: request → /coworking, task → /coworking/tasks, chat → /coworking/tasks
 *  - Action buttons per notification type ("View Request", "Open Task", "Reply" etc.)
 *  - notificationclick routes to the correct page and posts a message to the focused tab
 *  - Handles both postMessage (foreground) and push events (background/FCM)
 *  - renotify: true so each new notification re-alerts even with the same tag
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

/* ── Notification type → icon mapping ─────────────────────────────────────── */
const TYPE_ICONS = {
    request: "/icons/notif-request.png",
    task_assigned: "/icons/notif-task.png",
    task_chat: "/icons/notif-chat.png",
    daily_report: "/icons/notif-report.png",
    completion: "/icons/notif-done.png",
    meeting: "/icons/notif-meeting.png",
    dm: "/icons/notif-dm.png",
};
const DEFAULT_ICON = "/icons/icon-192x192.png"; // Grav app logo
const BADGE_ICON = "/icons/badge-72x72.png";

/* ── Deep-link URL for each notification type ─────────────────────────────── */
function resolveUrl(data) {
    const { type, taskId, conversationId } = data || {};
    if (type === "dm" && conversationId) return `/coworking/direct-messages/${conversationId}`;
    if (type === "meeting") return `/coworking/schedule-meet`;
    if (taskId) return `/coworking/tasks`;
    return "/coworking";
}

/* ── Action buttons by notification type ─────────────────────────────────── */
function resolveActions(type) {
    if (type === "request") return [{ action: "open", title: "View Request" }, { action: "dismiss", title: "Dismiss" }];
    if (type === "task_assigned") return [{ action: "open", title: "Open Task" }, { action: "dismiss", title: "Dismiss" }];
    if (type === "task_chat") return [{ action: "open", title: "Reply" }, { action: "dismiss", title: "Dismiss" }];
    if (type === "daily_report") return [{ action: "open", title: "View Report" }, { action: "dismiss", title: "Dismiss" }];
    if (type === "completion") return [{ action: "open", title: "Review" }, { action: "dismiss", title: "Dismiss" }];
    return [{ action: "open", title: "Open" }, { action: "dismiss", title: "Dismiss" }];
}

/* ── Build full notification options ─────────────────────────────────────── */
function buildOptions(payload) {
    const { title, body, type, tag, data, image } = payload;
    const icon = TYPE_ICONS[type] || DEFAULT_ICON; // always use app/type icon, not sender avatar
    const url = resolveUrl({ type, ...data });
    const actions = resolveActions(type);

    const opts = {
        body: body || "",
        icon,
        badge: BADGE_ICON,
        tag: tag || `cowork-${type || "notif"}-${Date.now()}`,
        renotify: true,
        requireInteraction: false,
        silent: false,          // lets the OS play its default sound
        vibrate: [120, 60, 120, 60, 200],
        timestamp: Date.now(),
        actions,
        data: { url, type, ...data },
    };

    // Attach image preview when an attachment URL is provided
    if (image) opts.image = image;

    return opts;
}

/* ── postMessage from the app (foreground tab) ───────────────────────────── */
self.addEventListener("message", e => {
    const payload = e.data || {};
    if (payload.type !== "SHOW_NOTIFICATION") return;

    e.waitUntil(
        self.registration
            .showNotification(payload.title || "CoWork", buildOptions(payload))
            .then(() => {
                // Ask the originating client to play a sound — SW has no Web Audio API
                e.source?.postMessage({
                    type: "PLAY_NOTIF_SOUND",
                    notifType: payload.notifType || payload.type || "default",
                });
            })
    );
});

/* ── Background push event (FCM / VAPID future support) ─────────────────── */
self.addEventListener("push", e => {
    if (!e.data) return;
    let payload = {};
    try {
        const raw = e.data.json();
        // FCM can wrap payload in different structures:
        // 1. { title, body, data: {...} }        — notification message
        // 2. { data: { title, body, type, ... } } — data-only message (our preferred format)
        // 3. { notification: { title, body }, data: {...} } — combined
        if (raw.data?.title) {
            // data-only message — extract everything from data field
            payload = {
                title: raw.data.title,
                body: raw.data.body || "",
                type: raw.data.type || "",
                tag: raw.data.tag || "",
                data: raw.data,
            };
        } else if (raw.notification?.title) {
            // notification message
            payload = {
                title: raw.notification.title,
                body: raw.notification.body || "",
                type: raw.data?.type || "",
                tag: raw.data?.tag || "",
                data: raw.data || {},
            };
        } else {
            // direct format
            payload = raw;
        }
    } catch { return; }

    const title = payload.title || "CoWork";
    e.waitUntil(
        self.registration.showNotification(title, buildOptions(payload))
    );
});

/* ── Notification click — deep-link routing ──────────────────────────────── */
self.addEventListener("notificationclick", e => {
    e.notification.close();
    if (e.action === "dismiss") return;

    const url = e.notification.data?.url || "/coworking";

    e.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then(clients => {
                const match = clients.find(c => new URL(c.url).pathname.startsWith("/cowork"));
                if (match) {
                    match.focus();
                    match.postMessage({ type: "NOTIF_CLICK", url, data: e.notification.data });
                    if ("navigate" in match) match.navigate(url);
                } else {
                    self.clients.openWindow(url);
                }
            })
    );
});