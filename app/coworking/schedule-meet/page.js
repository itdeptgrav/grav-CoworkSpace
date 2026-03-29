"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import CoworkMeetCard from "../../../components/coworking/meets/CoworkMeetCard";
import { useCoworkMeets } from "../../../hooks/useCoworkMeets";

export default function MeetsPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const { meets, loading: ml } = useCoworkMeets();
  const [tab, setTab] = useState("upcoming");
  useEffect(() => { if (!loading && !user) router.push("/coworking-login"); }, [user, loading]);
  if (loading || !user) return null;
  const now = new Date();
  const upcoming = meets.filter(m => new Date(m.dateTime) >= now && !m.isCancelled);
  const past = meets.filter(m => new Date(m.dateTime) < now || m.isCancelled);
  const displayed = tab === "upcoming" ? upcoming : past;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e8eaed", fontFamily: "'Google Sans',sans-serif" }}>
          {["upcoming", "past"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", border: "none", background: "transparent", fontSize: "14px", fontWeight: 500, cursor: "pointer", color: tab === t ? "#1a73e8" : "#5f6368", borderBottom: `2px solid ${tab === t ? "#1a73e8" : "transparent"}`, marginBottom: "-1px" }}>
              {t === "upcoming" ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
            </button>
          ))}
        </div>
        {role === "ceo" && <button onClick={() => router.push("/coworking/schedule-meet/new")} style={{ padding: "10px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer", fontFamily: "'Google Sans',sans-serif" }}>+ Schedule meeting</button>}
      </div>
      {ml && <p style={{ color: "#80868b" }}>Loading...</p>}
      {!ml && displayed.length === 0 && <div style={{ padding: "60px", textAlign: "center", color: "#80868b", background: "#fff", borderRadius: "8px", border: "1px solid #e8eaed" }}><div style={{ fontSize: "48px", marginBottom: "12px" }}>📅</div>No {tab} meetings</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: "14px" }}>
        {displayed.map(m => <CoworkMeetCard key={m.meetId} meet={m} />)}
      </div>
    </>
  );
}