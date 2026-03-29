/**
 * GRAV-CMS/lib/coworkUtils.js
 * Utility functions used by CoworkShared components.
 */

const AVATAR_COLORS = [
    "#1a73e8", "#e8710a", "#1e8e3e", "#d93025", "#9334e9",
    "#0d9488", "#b45309", "#be185d", "#0891b2", "#4f46e5",
];

export function initials(name = "") {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

export function avatarColor(name = "") {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function timeAgo(ts) {
    if (!ts) return "";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatTime(ts) {
    if (!ts) return "";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ADD THIS MISSING FUNCTION
export function formatDate(date) {
    if (!date) return "";
    const d = date?.seconds ? new Date(date.seconds * 1000) : new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

// Optional: Add a shorter date format if needed
export function formatShortDate(date) {
    if (!date) return "";
    const d = date?.seconds ? new Date(date.seconds * 1000) : new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}