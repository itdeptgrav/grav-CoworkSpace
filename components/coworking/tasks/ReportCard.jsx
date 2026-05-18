"use client";
/**
 * GRAV-CMS/components/coworking/tasks/ReportCard.jsx
 *
 * Daily-report card + collapsible date-group wrapper. Used in the detail-panel
 * reports tab. Pure rendering, depends only on props + GwAvatar from shared.
 *
 * Extracted from app/coworking/tasks/page.js — pure relocation, no behavior change.
 */
import { useState } from "react";
import { GwAvatar } from "../shared/CoworkShared";

export function ReportCard({ report }) {
    const pct = report.progressPercent || 0;
    const pctColor = pct >= 100 ? "#16A34A" : pct >= 50 ? "var(--p,#5B5EF4)" : "#F59E0B";
    const pctBg = pct >= 100 ? "#DCFCE7" : pct >= 50 ? "var(--p-lt,#EDEDFE)" : "#FEF3C7";
    return (
        <div className="gv-report-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <GwAvatar name={report.employeeName} size={30} />
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1,#0C0E1A)" }}>{report.employeeName}</div>
                        <div style={{ fontSize: 10, color: "var(--text-4,#A8AFCC)", marginTop: 1, fontFamily: "var(--mono,monospace)" }}>{report.reportDate}</div>
                    </div>
                </div>
                <span style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: pctColor, background: pctBg, fontFamily: "var(--mono,monospace)" }}>{pct}%</span>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--text-2,#3D4060)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{report.message}</p>
            {report.imageUrls?.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(56px,1fr))", gap: 4, marginTop: 6 }}>
                    {report.imageUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="" style={{ width: "100%", height: 56, objectFit: "cover", borderRadius: 7, border: "1px solid var(--border,rgba(0,0,0,0.07))", display: "block" }} />
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── ReportDateGroup — collapsible date group for daily reports ─── */
export function ReportDateGroup({ dateLabel, reports = [] }) {
    const [open, setOpen] = useState(true);
    if (!reports || !Array.isArray(reports)) return null;
    return (
        <div style={{ marginBottom: 2 }}>
            {/* Date header */}
            <button onClick={() => setOpen(v => !v)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#F8FAFC", border: "none", borderTop: "1px solid #E5E7EB", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
                    <path d="M2.5 1.5l5 3.5-5 3.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.04em" }}>📅 {dateLabel}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>{reports.length} report{reports.length !== 1 ? "s" : ""}</span>
            </button>
            {open && (
                <div style={{ padding: "4px 0" }}>
                    {reports.map((r, i) => <ReportCard key={r.id || i} report={r} />)}
                </div>
            )}
        </div>
    );
}