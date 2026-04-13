// public/firebase-messaging-sw.js
// ⚠️ FILL IN your actual values from cowork frontend/.env below

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

// Fires when app is CLOSED or in background tab
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
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: type || 'cowork',
        data: { url: urlMap[type] || '/coworking', ...payload.data },
        vibrate: [200, 100, 200],
    });
});

// When user clicks the notification — open the right page
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/coworking';
    const fullUrl = self.location.origin + url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            // If a tab with this exact URL already exists, focus it
            const exactMatch = list.find(c => c.url === fullUrl);
            if (exactMatch) { exactMatch.focus(); return; }

            // If any tab of our app is open, navigate it to the right page
            const anyTab = list.find(c => c.url.startsWith(self.location.origin));
            if (anyTab) { anyTab.navigate(fullUrl); anyTab.focus(); return; }

            // No tab open — open a new one
            if (clients.openWindow) return clients.openWindow(fullUrl);
        })
    );
});