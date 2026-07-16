"use client";
/**
 * app/coworking/pmp/page.js
 * PMP Score Dashboard — dark theme, fully functional
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { getPmpEmployees, getPmpDashboard } from "../../../lib/coworkApi";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
    bgPage: "#F5F7FA", bgCard: "#FFFFFF", bgInner: "#F8FAFC", bgElev: "#E2E8F0",
    border: "#E2E8F0", borderSub: "#EDF2F7", borderStrong: "#CBD5E0",
    textPri: "#1A202C", textSec: "#4A5568", textMut: "#718096",
    textHint: "#A0ADB8", textLabel: "#718096",
    blue: "#2B7BE0", blueHi: "#1A5EBB", blueTint: "#EBF4FF", blueBorder: "#93C5FD",
    green: "#0D8F69", greenHi: "#065F46", greenTint: "#ECFDF5", greenBorder: "#6EE7B7",
    amber: "#B45309", amberTint: "#FFFBEB", amberBorder: "#FCD34D",
    red: "#DC2626", redTint: "#FEF2F2", redBorder: "#FCA5A5",
    purple: "#5B4ECC", purpleTint: "#F5F3FF",
};

const RATING_MAP = {
    exceptional: { color: "#5B4ECC", bg: "#F5F3FF" },
    strong: { color: "#1A5EBB", bg: "#EBF4FF" },
    solid: { color: "#0D8F69", bg: "#ECFDF5" },
    developing: { color: "#B45309", bg: "#FFFBEB" },
    critical: { color: "#DC2626", bg: "#FEF2F2" },
    none: { color: "#718096", bg: "#F8FAFC" },
};

const COMP = {
    c1: { val: "#1A5EBB", bar: "#2B7BE0" },
    c2: { val: "#0D8F69", bar: "#0D8F69" },
    c3: { val: "#DC2626", bar: "#DC2626" },
    c4: { val: "#B45309", bar: "#B45309" },
};

const Q_WEIGHTS = { 1: "10%", 2: "20%", 3: "30%", 4: "40%" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const MONO = "'SF Mono','Fira Code','Courier New',monospace";

const fmt = (v, d = 1) => (v !== null && v !== undefined) ? Number(v).toFixed(d) : "—";
const pct = (v) => v !== null ? `${Number(v).toFixed(1)}%` : "—";
const rs = (cls) => RATING_MAP[cls] || RATING_MAP.none;

function currentQ() { return Math.ceil((new Date().getMonth() + 1) / 3); }
function currentY() { return new Date().getFullYear(); }

// ── Small reusable pieces ─────────────────────────────────────────────────────

function RatingPill({ rating, small }) {
    if (!rating || rating.class === "none") return null;
    const s = rs(rating.class);
    return (
        <span style={{
            display: "inline-block", padding: small ? "2px 8px" : "3px 10px",
            borderRadius: 4, fontSize: small ? 10 : 11, fontWeight: 600,
            background: s.bg, color: s.color,
        }}>
            {rating.label}
        </span>
    );
}

function ThinBar({ pct: p, color, height = 3 }) {
    return (
        <div style={{ height, borderRadius: 2, background: C.borderSub, marginTop: 6, overflow: "hidden" }}>
            <div style={{
                height: "100%", borderRadius: 2, background: color,
                width: `${Math.min(Math.max(p || 0, 0), 100)}%`, transition: "width 0.3s"
            }} />
        </div>
    );
}

function FlagBadge({ flag }) {
    const styles = {
        critical: { bg: C.redTint, color: C.red },
        warning: { bg: C.amberTint, color: C.amber },
        ok: { bg: C.greenTint, color: C.greenHi },
        info: { bg: C.blueTint, color: C.blueHi },
    };
    const s = styles[flag.type] || styles.info;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 4, fontSize: 10, fontWeight: 600,
            background: s.bg, color: s.color
        }}>
            {flag.label}
        </span>
    );
}

function Skeleton({ w = "100%", h = 16, r = 4 }) {
    return <div style={{
        width: w, height: h, borderRadius: r,
        background: "#E2E8F0", animation: "pulse 1.5s infinite"
    }} />;
}

// ── Component card (C1/C2/C3/C4) ─────────────────────────────────────────────
function CompCard({ label, value, max, sub, barPct, color, barColor, loading }) {
    return (
        <div style={{
            background: C.bgCard, border: `0.5px solid ${C.border}`,
            borderTop: `3px solid ${color || C.border}`,
            borderRadius: 12, padding: "14px 14px 12px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
        }}>
            <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                textTransform: "uppercase", color: C.textLabel, marginBottom: 3
            }}>
                {label}
            </div>
            {loading ? <Skeleton h={24} w="60%" /> : (
                <div style={{ fontSize: 19, fontWeight: 600, color: color || C.textSec, marginTop: 3 }}>
                    {value}
                </div>
            )}
            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{sub}</div>
            <ThinBar pct={barPct} color={barColor} />
        </div>
    );
}
// ── Pace bar — centre-zero ────────────────────────────────────────────────────
function PaceBar({ pace, ratingColor }) {
    const pos = pace !== null && pace > 0 ? Math.min(pace / 2, 50) : 0;
    const neg = pace !== null && pace < 0 ? Math.min(Math.abs(pace) / 2, 50) : 0;

    return (
        <div>
            <div style={{ position: "relative", height: 10 }}>
                {/* Track */}
                <div style={{
                    position: "absolute", width: "100%", height: 10,
                    borderRadius: 5, background: C.bgElev
                }} />
                {/* Positive fill */}
                {pos > 0 && <div style={{
                    position: "absolute", height: 10,
                    borderRadius: "0 5px 5px 0", left: "50%",
                    width: `${pos}%`, background: ratingColor, transition: "width 0.3s"
                }} />}
                {/* Negative fill */}
                {neg > 0 && <div style={{
                    position: "absolute", height: 10,
                    borderRadius: "5px 0 0 5px", right: "50%",
                    width: `${neg}%`, background: C.red, transition: "width 0.3s"
                }} />}
                {/* Zero marker */}
                <div style={{
                    position: "absolute", top: -3, left: "50%",
                    transform: "translateX(-50%)", width: 2, height: 16,
                    background: C.borderStrong, borderRadius: 1
                }} />
            </div>
            <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 9, color: C.textHint, marginTop: 4
            }}>
                {["−100%", "−50%", "0%", "+50%", "+100%"].map(l => (
                    <span key={l}>{l}</span>
                ))}
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PMPDashboard() {
    const { user, role, loading: authLoading } = useCoworkAuth();
    const router = useRouter();

    const [employees, setEmployees] = useState([]);
    const [selectedEmp, setSelectedEmp] = useState("");
    const [quarter, setQuarter] = useState(currentQ());
    const [year, setYear] = useState(currentY());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [empLoading, setEmpLoading] = useState(true);

    // Auth guard
    useEffect(() => {
        if (!authLoading && !user) router.push("/");
    }, [user, authLoading]);

    // Fetch employee list
    useEffect(() => {
        if (!user) return;
        setEmpLoading(true);
        getPmpEmployees()
            .then(res => {
                const list = res.employees || [];
                setEmployees(list);
                if (list.length > 0) setSelectedEmp(list[0].employeeId);
            })
            .catch(e => setError(e.message))
            .finally(() => setEmpLoading(false));
    }, [user]);

    // Fetch dashboard data
    const fetchDashboard = useCallback(() => {
        if (!selectedEmp) return;
        setLoading(true);
        setError(null);
        getPmpDashboard(selectedEmp, quarter, year)
            .then(res => setData(res))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [selectedEmp, quarter, year]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    if (authLoading || !user) return null;

    const d = data;
    const paceRating = d?.pace?.rating;
    const paceColor = paceRating ? rs(paceRating.class).color : C.blueHi;
    const c1Net = d?.c1?.net;
    const c1Max = d?.c1?.max || 50;
    const c1SopPts = d?.c1?.sopPts ?? 0;
    const c2Net = d?.c2?.net;
    const c2Max = d?.c2?.max || 50;
    const c2SopPts = d?.c2?.sopPts ?? 0;
    const c3Net = d?.c3?.net ?? 0;
    const c3BreachCount = d?.c3?.breachCount ?? 0;
    const c3SopPts = d?.c3?.sopPts ?? 0;
    const c4Net = d?.c4?.net ?? 0;
    const c4BreachCount = d?.c4?.breachCount ?? 0;
    const c4SopPts = d?.c4?.sopPts ?? 0;
    const pace = d?.pace?.score;
    const annualLive = d?.annual?.live;
    const annualProj = d?.annual?.projected;
    const annualRat = d?.annual?.rating;
    const quarters = d?.annual?.quarters || [];
    const flags = d?.flags || [];
    const gap = d?.gap;

    // Annual breakdown averages from quarters
    const closedQs = quarters.filter(q => q.status === "closed");
    const liveQs = quarters.filter(q => q.status === "live");
    const allSoFar = [...closedQs, ...liveQs];
    const avgC1 = allSoFar.length > 0
        ? allSoFar.reduce((s, q) => s + (q.c1 || 0), 0) / allSoFar.length : null;
    const avgC2 = allSoFar.length > 0
        ? allSoFar.reduce((s, q) => s + (q.c2 || 0), 0) / allSoFar.length : null;

    const yearOptions = [currentY(), currentY() - 1];

    return (
        <div style={{
            background: C.bgPage, minHeight: "100vh", overflowX: "hidden",
            fontFamily: FONT, padding: "20px 16px 48px", color: C.textPri
        }}>

            <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        select:focus { outline:none; }
        button { cursor:pointer; }
      `}</style>

            <div style={{ maxWidth: "100%", margin: 0 }}>

                {/* ── Control Bar ── */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    flexWrap: "wrap", marginBottom: 14
                }}>

                    {/* Employee selector */}
                    <select
                        value={selectedEmp}
                        onChange={e => setSelectedEmp(e.target.value)}
                        disabled={empLoading}
                        style={{
                            flex: 1, minWidth: 180, padding: "8px 12px",
                            background: C.bgCard, border: `0.5px solid ${C.border}`,
                            borderRadius: 8, color: C.textPri, fontSize: 13, fontFamily: FONT
                        }}>
                        {empLoading
                            ? <option>Loading...</option>
                            : employees.map(e => (
                                <option key={e.employeeId} value={e.employeeId}>
                                    {e.name} — {e.department}
                                </option>
                            ))
                        }
                    </select>

                    {/* Quarter buttons */}
                    <div style={{ display: "flex", gap: 5 }}>
                        {[1, 2, 3, 4].map(q => (
                            <button key={q} onClick={() => setQuarter(q)}
                                style={{
                                    padding: "6px 14px", borderRadius: 6, fontSize: 12,
                                    fontFamily: FONT, fontWeight: 600,
                                    background: quarter === q ? C.blueTint : "transparent",
                                    border: quarter === q
                                        ? `1px solid ${C.blueBorder}`
                                        : `0.5px solid ${C.border}`,
                                    color: quarter === q ? C.blueHi : C.textLabel
                                }}>
                                Q{q}
                            </button>
                        ))}
                    </div>

                    {/* Year selector */}
                    <select
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        style={{
                            padding: "8px 12px", background: C.bgCard,
                            border: `0.5px solid ${C.border}`, borderRadius: 8,
                            color: C.textPri, fontSize: 13, fontFamily: FONT
                        }}>
                        {yearOptions.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    {/* Refresh */}
                    <button onClick={fetchDashboard}
                        style={{
                            padding: "7px 14px", background: "transparent",
                            border: `0.5px solid ${C.border}`, borderRadius: 6,
                            color: C.textLabel, fontSize: 12, fontFamily: FONT
                        }}>
                        ↺
                    </button>
                </div>

                {/* Employee name watermark */}
                {d?.employee && (
                    <div style={{
                        fontSize: 9, color: C.textHint, textAlign: "center",
                        marginBottom: 10
                    }}>
                        {d.employee.name} · {d.employee.designation || d.employee.role} · Q{quarter} {year} · Day {d.dayInQuarter} of quarter
                    </div>
                )}

                {/* Error state */}
                {error && (
                    <div style={{
                        background: C.redTint, border: `1px solid ${C.redBorder}`,
                        borderRadius: 10, padding: "14px 16px", color: C.red,
                        fontSize: 13, marginBottom: 14
                    }}>
                        ⚠ {error}
                    </div>
                )}

                {/* ── Row 1: C1 / C2 / C3 / C4 cards ── */}
                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(4,1fr)",
                    gap: 8, marginBottom: 14
                }}>
                    <CompCard
                        label="C1 This Quarter"
                        value={loading ? null : c1SopPts > 0 ? `${fmt(c1SopPts)} pts` : "—"}
                        sub={loading ? "..." : c1SopPts > 0 ? "" : "no closed tasks yet"}
                        barPct={c1Max > 0 ? (c1SopPts / c1Max) * 100 : 0}
                        color={COMP.c1.val}
                        barColor={COMP.c1.bar}
                        loading={loading}
                    />

                    <CompCarda
                        label="C2 This Quarter"
                        value={loading ? null : c2SopPts > 0 ? `${fmt(c2SopPts)} pts` : "—"}
                        sub={loading ? "..." : c2SopPts > 0 ? "" : "no goals past deadline"}
                        barPct={c2Max > 0 ? (c2SopPts / c2Max) * 100 : 0}
                        color={COMP.c2.val}
                        barColor={COMP.c2.bar}
                        loading={loading}
                    />

                    <CompCard
                        label="C3 This Quarter"
                        value={loading ? null : c3SopPts !== 0 ? `${fmt(c3SopPts)} pts` : "0.0 pts"}
                        sub={loading ? "..." : c3BreachCount > 0
                            ? `${c3BreachCount} breach${c3BreachCount > 1 ? "es" : ""}`
                            : "no breaches"}
                        barPct={0}
                        color={c3SopPts < 0 ? COMP.c3.val : C.textMut}
                        barColor={COMP.c3.bar} loading={loading} />

                    <CompCard
                        label="C4 This Quarter"
                        value={loading ? null : c4SopPts !== 0 ? `${fmt(c4SopPts)} pts` : "0.0 pts"}
                        sub={loading ? "..." : c4BreachCount > 0
                            ? `${c4BreachCount} event${c4BreachCount > 1 ? "s" : ""}`
                            : "no attendance events"}
                        barPct={0}
                        color={c4SopPts < 0 ? COMP.c4.val : C.textMut}
                        barColor={COMP.c4.bar} loading={loading} />
                </div>

                {/* ── Row 2: Pace Hero Block ── */}
                <div style={{
                    background: C.bgCard, border: `0.5px solid ${C.border}`,
                    borderRadius: 16, padding: 24, marginBottom: 14,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.07)"
                }}>

                    {/* Top two-col */}
                    <div style={{
                        display: "grid", gridTemplateColumns: "1fr auto",
                        gap: 24, alignItems: "flex-start", marginBottom: 14
                    }}>

                        {/* Left */}
                        <div>
                            <div style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                                textTransform: "uppercase", color: C.textLabel, marginBottom: 5
                            }}>
                                Pace Score — This Quarter ✦ Primary Metric
                            </div>

                            {loading ? <Skeleton h={64} w="40%" r={8} /> : (
                                <div style={{
                                    fontSize: 58, fontWeight: 600, lineHeight: 1,
                                    color: pace !== null ? paceColor : C.textHint
                                }}>
                                    {pace !== null ? `${fmt(pace, 0)}%` : "—"}
                                </div>
                            )}

                            <div style={{ marginTop: 7 }}>
                                {!loading && <RatingPill rating={paceRating} />}
                            </div>

                            <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>
                                {loading ? <Skeleton h={12} w="70%" /> : (
                                    d?.pace?.numerator !== undefined
                                        ? `${fmt(d.pace.numerator, 1)} pts achieved out of ${fmt(d.pace.denominator, 1)} pts achievable today`
                                        : "Waiting for first task completion"
                                )}
                            </div>

                            <div style={{
                                fontFamily: MONO, fontSize: 9, color: C.textHint,
                                marginTop: 3
                            }}>
                                {!loading && d?.pace?.formula}
                            </div>
                        </div>

                        {/* Right */}
                        <div style={{ textAlign: "right", minWidth: 140 }}>
                            <div>
                                <div style={{ fontSize: 9, color: C.textLabel }}>Achieved</div>
                                <div style={{ fontSize: 17, fontWeight: 600, color: C.textSec }}>
                                    {loading ? "—" : `${fmt(d?.pace?.numerator, 1)} pts`}
                                </div>
                            </div>
                            <div style={{ marginTop: 7 }}>
                                <div style={{ fontSize: 9, color: C.textLabel }}>of achievable</div>
                                <div style={{ fontSize: 17, fontWeight: 600, color: C.textSec }}>
                                    {loading ? "—" : `${fmt(d?.pace?.denominator, 1)} pts`}
                                </div>
                            </div>
                            {!loading && gap?.gap > 0 && (
                                <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, padding: "3px 10px",
                                        borderRadius: 4, background: C.amberTint, color: C.amber
                                    }}>
                                        {fmt(gap.gap, 1)} pts to {gap.nextRating}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pace bar */}
                    {loading
                        ? <Skeleton h={10} r={5} />
                        : <PaceBar pace={pace} ratingColor={paceColor} />
                    }

                    {/* 3-block support row */}
                    <div style={{
                        display: "grid", gridTemplateColumns: "repeat(3,1fr)",
                        gap: 12, marginTop: 14
                    }}>

                        {/* Live Annual — highlighted */}
                        <div style={{
                            background: C.blueTint, border: `1.5px solid ${C.blueBorder}`,
                            borderRadius: 12, padding: 14,
                            boxShadow: "0 0 0 4px rgba(43,123,224,0.06)"
                        }}>
                            <div style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                                textTransform: "uppercase", color: C.blueHi, marginBottom: 3
                            }}>
                                Live Annual Score
                            </div>
                            <div style={{
                                fontSize: 26, fontWeight: 600,
                                color: loading ? C.textHint : C.blueHi
                            }}>
                                {loading ? "—" : fmt(annualLive)}
                            </div>
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                                {quarters.filter(q => q.status === "closed").length} closed
                                + Q{quarter} live
                            </div>
                            {!loading && <div style={{ marginTop: 5 }}>
                                <RatingPill rating={annualRat} small />
                            </div>}
                        </div>

                        {/* Projected Annual */}
                        <div style={{
                            background: C.bgCard, border: `0.5px solid ${C.border}`,
                            borderTop: `3px solid ${C.border}`,
                            borderRadius: 12, padding: "14px 14px 12px",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
                        }}>
                            <div style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                                textTransform: "uppercase", color: C.textLabel, marginBottom: 3
                            }}>
                                Projected Annual
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 600, color: C.textSec }}>
                                {loading ? "—" : fmt(annualProj)}
                            </div>
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                                {quarters.filter(q => q.status === "closed").length} closed
                                + Q{quarter} projected
                            </div>
                            {!loading && annualProj !== null && (
                                <div style={{ marginTop: 5 }}>
                                    <RatingPill rating={{
                                        ...rs(
                                            annualProj >= 95 ? "exceptional" : annualProj >= 85 ? "strong" :
                                                annualProj >= 70 ? "solid" : annualProj >= 50 ? "developing" : "critical"
                                        ), label:
                                            annualProj >= 95 ? "Exceptional" : annualProj >= 85 ? "Strong" :
                                                annualProj >= 70 ? "Solid" : annualProj >= 50 ? "Developing" : "Critical",
                                        class:
                                            annualProj >= 95 ? "exceptional" : annualProj >= 85 ? "strong" :
                                                annualProj >= 70 ? "solid" : annualProj >= 50 ? "developing" : "critical"
                                    }} small />
                                </div>
                            )}
                        </div>

                        {/* Gap to next rating */}
                        <div style={{
                            background: C.bgCard, border: `0.5px solid ${C.border}`,
                            borderTop: `3px solid ${C.border}`,
                            borderRadius: 12, padding: "14px 14px 12px",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
                        }}>
                            <div style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                                textTransform: "uppercase", color: C.textLabel, marginBottom: 3
                            }}>
                                Gap to Next Rating
                            </div>
                            <div style={{
                                fontSize: 26, fontWeight: 600,
                                color: gap?.gap === 0 ? C.purple : C.blueHi
                            }}>
                                {loading ? "—" :
                                    gap?.gap === 0 ? "Peak ✓" :
                                        gap?.gap != null ? `+${fmt(gap?.gap, 1)} pts` : "—"}
                            </div>
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                                needed in live annual score
                            </div>
                            {!loading && gap?.nextRating && gap.gap > 0 && (
                                <div style={{ marginTop: 5 }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 600, padding: "2px 8px",
                                        borderRadius: 4, background: C.blueTint, color: C.blueHi
                                    }}>
                                        to reach {gap.nextRating}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Flags */}
                    {!loading && flags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                            {flags.map(f => <FlagBadge key={f.key} flag={f} />)}
                        </div>
                    )}
                </div>

                {/* ── Row 3: Quarter cards ── */}
                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(4,1fr)",
                    gap: 8, marginBottom: 14
                }}>
                    {[1, 2, 3, 4].map(q => {
                        const qData = quarters.find(x => x.quarter === q);
                        const status = qData?.status || "future";
                        const isLive = status === "live";
                        const isClosed = status === "closed";
                        const isFuture = status === "future";
                        const score = qData?.score !== null && qData?.score !== undefined
                            ? fmt(qData.score) : "?";

                        const liveColor = [C.blueHi, C.greenHi, C.amber, "#5ECFCF"][q - 1];
                        const liveTint = [C.blueTint, C.greenTint, C.amberTint, "#061f1f"][q - 1];
                        const liveBorder = [C.blueBorder, C.greenBorder, C.amberBorder, "#0a3333"][q - 1];

                        return (
                            <div key={q} style={{
                                background: isLive ? liveTint : C.bgCard,
                                border: isLive ? `1.5px solid ${liveBorder}` : `0.5px solid ${C.border}`,
                                borderLeft: isLive ? `4px solid ${liveColor}` : isClosed ? `4px solid ${C.green}` : `4px solid ${C.border}`,
                                borderRadius: 12, padding: 12, textAlign: "center",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                            }}>
                                <div style={{
                                    fontSize: 9, color: isLive ? liveColor : C.textHint,
                                    marginBottom: 3
                                }}>
                                    Q{q} {isClosed ? "✓" : isLive ? "live" : ""}
                                </div>
                                <div style={{
                                    fontSize: 16, fontWeight: 600,
                                    color: isLive ? liveColor : isFuture ? C.textHint : C.textSec
                                }}>
                                    {loading ? "—" : isFuture ? "?" : score}
                                </div>
                                <div style={{ fontSize: 9, color: C.textHint, marginTop: 2 }}>
                                    weight {Q_WEIGHTS[q]}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── Row 4: Annual breakdown ── */}
                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(4,1fr)",
                    gap: 8
                }}>

                    {/* C1 Annual */}
                    <div style={{
                        background: C.bgCard, border: `0.5px solid ${C.border}`,
                        borderTop: `3px solid ${COMP.c1.bar}`,
                        borderRadius: 12, padding: "14px 14px 12px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
                    }}>
                        <div style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: C.textLabel, marginBottom: 5
                        }}>
                            C1 Annual
                        </div>
                        <div>
                            <span style={{ fontSize: 17, fontWeight: 600, color: C.blueHi }}>
                                {loading ? "—" : avgC1 !== null ? fmt(avgC1) : "—"}
                            </span>
                            <span style={{ fontSize: 13, color: C.textHint }}> / {c1Max}</span>
                        </div>
                        <div style={{ fontSize: 9, color: C.textHint, marginTop: 2 }}>
                            avg {allSoFar.length}Q
                        </div>
                        <ThinBar
                            pct={avgC1 !== null ? (avgC1 / c1Max) * 100 : 0}
                            color={COMP.c1.bar} />
                    </div>

                    {/* C2 Annual */}
                    <div style={{
                        background: C.bgCard, border: `0.5px solid ${C.border}`,
                        borderTop: `3px solid ${COMP.c2.bar}`,
                        borderRadius: 12, padding: "14px 14px 12px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
                    }}>
                        <div style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: C.textLabel, marginBottom: 5
                        }}>
                            C2 Annual
                        </div>
                        <div>
                            <span style={{ fontSize: 17, fontWeight: 600, color: C.green }}>
                                {loading ? "—" : avgC2 !== null ? fmt(avgC2) : "—"}
                            </span>
                            <span style={{ fontSize: 13, color: C.textHint }}> / {c2Max}</span>
                        </div>
                        <div style={{ fontSize: 9, color: C.textHint, marginTop: 2 }}>
                            avg {allSoFar.length}Q
                        </div>
                        <ThinBar
                            pct={avgC2 !== null ? (avgC2 / c2Max) * 100 : 0}
                            color={COMP.c2.bar} />
                    </div>

                    {/* C3 Annual */}
                    <div style={{
                        background: C.bgCard, border: `0.5px solid ${C.border}`,
                        borderTop: `3px solid ${COMP.c3.bar}`,
                        borderRadius: 12, padding: "14px 14px 12px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
                    }}>
                        <div style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: C.textLabel, marginBottom: 5
                        }}>
                            C3 Annual
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 600, color: C.textMut }}>
                            0.0
                        </div>
                        <div style={{ fontSize: 9, color: C.textHint, marginTop: 2 }}>
                            0.0 pts (annual avg)
                        </div>
                        <ThinBar pct={0} color={COMP.c3.bar} />
                    </div>

                    {/* C4 Annual */}
                    <div style={{
                        background: C.bgCard, border: `0.5px solid ${C.border}`,
                        borderTop: `3px solid ${COMP.c4.bar}`,
                        borderRadius: 12, padding: "14px 14px 12px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
                    }}>
                        <div style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: C.textLabel, marginBottom: 5
                        }}>
                            C4 Annual
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 600, color: C.textMut }}>
                            0.0
                        </div>
                        <div style={{ fontSize: 9, color: C.textHint, marginTop: 2 }}>
                            0.0 pts (annual avg)
                        </div>
                        <ThinBar pct={0} color={COMP.c4.bar} />
                    </div>
                </div>

            </div>
        </div>
    );
}