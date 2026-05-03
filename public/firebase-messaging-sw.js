// public/firebase-messaging-sw.js

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

// ── Background/Closed: FCM push from backend ─────────────────────────────────
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'CoWork';
    const body = payload.notification?.body || payload.data?.body || '';
    const type = payload.data?.type || '';

    const urlMap = {
        task_assigned: '/coworking/tasks',
        task_update: '/coworking/tasks',
        task_chat: '/coworking/tasks',
        direct_message: '/coworking/direct-messages',
        group_message: '/coworking/create-group',
        meet_scheduled: '/coworking/schedule-meet',
        meet_cancelled: '/coworking/schedule-meet',
        meet_updated: '/coworking/schedule-meet',
    };

    self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: type || 'cowork',
        data: { url: urlMap[type] || '/coworking', ...payload.data },
        vibrate: [200, 100, 200],
    });
});

// ── Foreground: postMessage from usePushNotifications.js ─────────────────────
// Handles SHOW_NOTIFICATION sent by the app when it's open
self.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
    const { title, body, icon, tag, data } = event.data;
    self.registration.showNotification(title, {
        body: body || '',
        icon: icon || '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: tag || 'cowork-' + Date.now(),
        data: data || { url: '/coworking' },
        vibrate: [200, 100, 200],
        requireInteraction: false,
    });
});

// ── Click handler ─────────────────────────────────────────────────────────────
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