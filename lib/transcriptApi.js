// lib/transcriptApi.js
// Frontend functions to save and fetch meeting transcripts from backend.

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

/**
 * Save full meeting transcript to backend (which saves to Firestore with 24h TTL).
 * Call this when:
 *   - Meeting ends (CEO clicks "End for All")
 *   - CEO clicks "Download .docx" (save before generating file)
 *
 * @param {string} meetId
 * @param {string} meetTitle
 * @param {string} meetDate        - e.g. "April 2, 2026"
 * @param {Array}  lines           - [{ name, text, time }]
 * @param {string} coworkToken     - auth token from localStorage/cookie
 */
export async function saveTranscript(meetId, meetTitle, meetDate, lines, coworkToken) {
    if (!lines || lines.length === 0) return { success: false, error: "No lines to save" };

    const res = await fetch(`${BASE}/cowork/transcript/save`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${coworkToken}`,
        },
        body: JSON.stringify({ meetId, meetTitle, meetDate, lines }),
    });

    return res.json();
}

/**
 * Fetch transcript for a meeting from backend.
 * Returns null if not found or expired.
 */
export async function getTranscript(meetId, coworkToken) {
    const res = await fetch(`${BASE}/cowork/transcript/${meetId}`, {
        headers: { "Authorization": `Bearer ${coworkToken}` },
    });

    if (res.status === 404) return null;
    const data = await res.json();
    return data.transcript || null;
}