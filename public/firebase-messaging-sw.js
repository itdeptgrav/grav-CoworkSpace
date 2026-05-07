// public/firebase-messaging-sw.js
// ONE unified service worker for ALL push notifications:
// 1. FCM background push (app closed/background) via onBackgroundMessage
// 2. Foreground push (app open) via postMessage SHOW_NOTIFICATION from usePushNotifications
// 3. Click routing — opens correct page

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDpswQ3pSlbxtmc-yWDgJD2GQWjfpK3ZXs",
    authDomain: "grav-cms-38f45.firebaseapp.com",
    projectId: "grav-cms-38f45",
    storageBucket: "grav-cms-38f45.firebasestorage.app",
    messagingSenderId: "51268280312",
    appId: "1:51268280312:web:1667f085583f9fe4b6c00d",
    databaseURL: "https://grav-cms-38f45-default-rtdb.firebaseio.com",
});

const messaging = firebase.messaging();

// ── URL routing map ───────────────────────────────────────────────────────────
const URL_MAP = {
    direct_message: '/coworking/direct-messages',
    group_message: '/coworking/create-group',
    group_added: '/coworking/create-group',
    group_removed: '/coworking/create-group',
    task_assigned: '/coworking/tasks',
    task_update: '/coworking/tasks',
    task_chat: '/coworking/tasks',
    task_confirmed: '/coworking/tasks',
    task_started: '/coworking/tasks',
    task_deleted: '/coworking/tasks',
    completion_submitted: '/coworking/tasks',
    completion_tl_approved: '/coworking/tasks',
    completion_ceo_approved: '/coworking/tasks',
    completion_rejected: '/coworking/tasks',
    completion_ceo_rejected: '/coworking/tasks',
    meet_scheduled: '/coworking/schedule-meet',
    meet_cancelled: '/coworking/schedule-meet',
    meet_updated: '/coworking/schedule-meet',
    meet_reminder: '/coworking/schedule-meet',
    role_changed: '/coworking/settings',
};

function getUrl(type) {
    return URL_MAP[type] || '/coworking';
}

// ── 1. FCM Background/Closed push (Android Chrome + desktop) ─────────────────
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'CoWork';
    const body = payload.notification?.body || payload.data?.body || '';
    const type = payload.data?.type || '';

    self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'cowork-' + (type || 'notif') + '-' + Date.now(),
        renotify: true,
        data: { url: getUrl(type), ...payload.data },
        vibrate: [200, 100, 200],
    });
});

// iOS push handled by onBackgroundMessage above

// ── 2. Foreground push — from usePushNotifications postMessage ────────────────
self.addEventListener('message', (event) => {
    const payload = event.data || {};
    if (payload.type !== 'SHOW_NOTIFICATION') return;

    const { title, body, tag, data } = payload;
    const type = data?.type || '';

    self.registration.showNotification(title || 'CoWork', {
        body: body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: tag || 'cowork-' + (type || 'notif') + '-' + Date.now(),
        renotify: true,
        data: { url: data?.url || getUrl(type), ...data },
        vibrate: [200, 100, 200],
        requireInteraction: false,
    });
});

// ── 3. Notification click — open correct page ─────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/coworking';
    const fullUrl = self.location.origin + url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const exactMatch = list.find(c => c.url === fullUrl);
            if (exactMatch) { exactMatch.focus(); return; }
            const anyTab = list.find(c => c.url.startsWith(self.location.origin));
            if (anyTab) { anyTab.navigate(fullUrl); anyTab.focus(); return; }
            if (clients.openWindow) return clients.openWindow(fullUrl);
        })
    );
});