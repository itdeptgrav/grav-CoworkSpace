// lib/livekitApi.js
// Matches backend livekit.routes.js exactly

import { firebaseAuth } from "./coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function lkFetch(path, opts = {}) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const token = await user.getIdToken();
    const res = await fetch(`${BASE}/cowork${path}`, {
        ...opts,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(opts.headers || {}),
        },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}

// CEO/TL: Start a meeting → returns { token, url, roomName, joinCode }
export const startMeeting = (meetId) =>
    lkFetch("/livekit/start", { method: "POST", body: JSON.stringify({ meetId }) });

// Anyone: Join by 6-digit code → returns { token, url, roomName, meetTitle }
export const joinByCode = (joinCode) =>
    lkFetch("/livekit/join", { method: "POST", body: JSON.stringify({ joinCode }) });

// Get live room info (participant count, join code for host, status)
export const getMeetingInfo = (meetId) =>
    lkFetch(`/livekit/info/${meetId}`);

// CEO/TL: End meeting for everyone
export const endMeeting = (meetId) =>
    lkFetch("/livekit/end", { method: "POST", body: JSON.stringify({ meetId }) });

// DM Audio call — get a LiveKit token for a 1:1 audio call room
export const getCallToken = (convId) =>
    lkFetch("/livekit/call-token", { method: "POST", body: JSON.stringify({ convId }) });

