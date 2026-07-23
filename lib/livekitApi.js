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
  lkFetch("/livekit/start", {
    method: "POST",
    body: JSON.stringify({ meetId }),
  });

// Anyone: Join by 6-digit code → returns { token, url, roomName, meetTitle }
export const joinByCode = (joinCode) =>
  lkFetch("/livekit/join", {
    method: "POST",
    body: JSON.stringify({ joinCode }),
  });

// Get live room info (participant count, join code for host, status)
export const getMeetingInfo = (meetId) => lkFetch(`/livekit/info/${meetId}`);

// CEO/TL: End meeting for everyone
export const endMeeting = (meetId) =>
  lkFetch("/livekit/end", { method: "POST", body: JSON.stringify({ meetId }) });

// DM Audio call — get a LiveKit token for a 1:1 audio call room
export const getCallToken = (convId) =>
  lkFetch("/livekit/call-token", {
    method: "POST",
    body: JSON.stringify({ convId }),
  });

// ── Guest-safe fetch — NO Firebase auth, for unauthenticated public calls ────
async function guestFetch(path, opts = {}) {
  const res = await fetch(`${BASE}/cowork${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// CEO/TL: create (or fetch existing) public shareable guest-join link
export const createPublicLink = (meetId) =>
  lkFetch("/livekit/public-link", {
    method: "POST",
    body: JSON.stringify({ meetId }),
  });

// CEO/TL: kill switch — revoke before the meeting ends
export const revokePublicLink = (meetId) =>
  lkFetch("/livekit/public-link/revoke", {
    method: "POST",
    body: JSON.stringify({ meetId }),
  });

// Guest (no login): resolve a public token to meeting state
export const getPublicMeetingInfo = (token) =>
  guestFetch(`/public/meeting-info/${token}`);

// Guest (no login): join → { token, url, roomName, guestId, guestSessionId, meetId, meetTitle }
export const guestJoin = (token, guestName) =>
  guestFetch("/public/guest-join", {
    method: "POST",
    body: JSON.stringify({ token, guestName }),
  });

// Guest (no login): view the generated summary via the same share token
export const getPublicSummary = (meetId, token) =>
  guestFetch(
    `/audio/summary/${meetId}/public?token=${encodeURIComponent(token)}`,
  );
