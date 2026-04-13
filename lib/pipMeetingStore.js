/**
 * lib/pipMeetingStore.js
 * 
 * Simple global store for PiP meeting state.
 * Uses a module-level object so it persists across page navigations
 * without losing the LiveKit connection.
 */

// Module-level store — survives React re-renders and Next.js page navigation
const store = {
    token: null,
    meetId: null,
    title: null,
    serverUrl: null,
    userChoices: null,
    isActive: false,
    listeners: new Set(),
};

export function setPipMeeting({ token, meetId, title, serverUrl, userChoices }) {
    store.token = token;
    store.meetId = meetId;
    store.title = title;
    store.serverUrl = serverUrl;
    store.userChoices = userChoices;
    store.isActive = true;
    store.listeners.forEach(fn => fn({ ...store }));
}

export function clearPipMeeting() {
    store.token = null;
    store.meetId = null;
    store.title = null;
    store.serverUrl = null;
    store.userChoices = null;
    store.isActive = false;
    store.listeners.forEach(fn => fn({ ...store }));
}

export function getPipMeeting() {
    return { ...store };
}

export function subscribePip(fn) {
    store.listeners.add(fn);
    return () => store.listeners.delete(fn);
}