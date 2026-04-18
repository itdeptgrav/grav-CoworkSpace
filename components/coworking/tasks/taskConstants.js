//components/coworking/tasks/taskConstants.js 

// ─── taskConstants.js ────────────────────────────────────────────────────────
// Shared constants, helpers, and apiFetch used across all task components.
// Import from here instead of redefining in every file.

import { firebaseAuth } from "@/lib/coworkFirebase";

export const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export async function apiFetch(path, opts = {}) {
    const u = firebaseAuth.currentUser;
    if (!u) throw new Error("Not authenticated");
    const token = await u.getIdToken();
    const res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...opts.headers,
        },
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Failed");
    return d;
}

// ── Status constants ──────────────────────────────────────────────────────────
export const STATUS = {
    open: { label: "Not Started", color: "#D97706", bg: "#FEF3C7", dot: "#D97706", glow: "rgba(217,119,6,0.3)" },
    confirmed: { label: "Confirmed", color: "#4F46E5", bg: "#EEF2FF", dot: "#4F46E5", glow: "rgba(79,70,229,0.3)" },
    in_progress: { label: "In Progress", color: "#7C3AED", bg: "#F5F3FF", dot: "#7C3AED", glow: "rgba(124,58,237,0.3)" },
    done: { label: "Done", color: "#16A34A", bg: "#F0FDF4", dot: "#16A34A", glow: "rgba(22,163,74,0.3)" },
    pending_tl_approval: { label: "Pending TL Approval", color: "#7C3AED", bg: "#F5F3FF", dot: "#7C3AED", glow: "rgba(124,58,237,0.3)" },
};

export const COMP = {
    submitted: { label: "Awaiting Review", color: "#D97706", bg: "#FEF3C7", icon: "⏳" },
    tl_approved: { label: "TL Approved · CEO Review", color: "#5B5EF4", bg: "#EDEDFE", icon: "✓" },
    tl_rejected: { label: "Rejected — Revise Work", color: "#EF4444", bg: "#FEF2F2", icon: "✕" },
    tl_final_approved: { label: "Approved — Complete!", color: "#16A34A", bg: "#DCFCE7", icon: "🏆" },
    ceo_approved: { label: "Approved — Complete!", color: "#16A34A", bg: "#DCFCE7", icon: "🏆" },
    ceo_rejected: { label: "CEO Rejected", color: "#EF4444", bg: "#FEF2F2", icon: "✕" },
};

export const PRI = {
    high: { label: "Urgent", color: "#B91C1C", bg: "#FEF2F2", dot: "#B91C1C" },
    medium: { label: "Normal", color: "#92400E", bg: "#FFFBEB", dot: "#D97706" },
    low: { label: "Lowest", color: "#166534", bg: "#F0FDF4", dot: "#16A34A" },
};

export const AVATAR_COLORS = [
    ["#3B4252", "#4C566A"], ["#2563EB", "#3B82F6"], ["#0F766E", "#14B8A6"],
    ["#7C2D12", "#B91C1C"], ["#6D28D9", "#7C3AED"], ["#0E7490", "#06B6D4"],
    ["#9D174D", "#EC4899"], ["#374151", "#6B7280"],
];

export function getAvatarColors(name = "") {
    const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
}

export function groupByDate(messages) {
    const groups = [];
    let lastDate = null;
    messages.forEach(msg => {
        const d = msg.createdAt ? new Date(msg.createdAt) : new Date();
        const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        if (dateStr !== lastDate) {
            groups.push({ type: "date", label: dateStr });
            lastDate = dateStr;
        }
        groups.push({ type: "msg", ...msg });
    });
    return groups;
}