// GRAV-CMS/components/coworking/tasks/CoworkTaskCard.jsx
"use client";
import { useState } from "react";
import { updateTaskProgress } from "../../../lib/coworkApi";
import { GwStatusBadge } from "../shared/CoworkShared";

export default function CoworkTaskCard({ task, currentEmployeeId, onUpdate, isGroupTask }) {
  const [exp, setExp] = useState(false);
  const [pct, setPct] = useState(task.progressPercent || 0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Check if user can update this task
  const canUpdate = task.assigneeIds?.includes(currentEmployeeId) || isGroupTask;

  const barColor = task.status === "done" ? "#1e8e3e" : pct >= 50 ? "#1a73e8" : "#f9ab00";

  const save = async () => {
    setBusy(true);
    try {
      await updateTaskProgress(task.taskId, { progressPercent: pct, note });
      setNote("");
      setExp(false);
      onUpdate?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s.card}>
      <div style={s.top}>
        <div style={{ flex: 1 }}>
          <div style={s.titleRow}>
            <span style={s.taskId}>{task.taskId}</span>
            <GwStatusBadge status={task.status} />
            {isGroupTask && (
              <span style={s.groupBadge}>👥 Group</span>
            )}
          </div>
          <h4 style={s.title}>{task.title}</h4>
          {task.description && <p style={s.desc}>{task.description}</p>}
        </div>
      </div>
      <div style={s.progressRow}>
        <div style={s.bar}>
          <div style={{ ...s.fill, width: `${task.progressPercent || 0}%`, background: barColor }} />
        </div>
        <span style={s.pctLabel}>{task.progressPercent || 0}%</span>
      </div>
      <div style={s.meta}>
        {task.dueDate && (
          <span style={s.metaItem}>
            📆 Due: {new Date(task.dueDate).toLocaleDateString("en-IN")}
          </span>
        )}
        <span style={s.metaItem}>
          👥 {task.assigneeIds?.length} assignee{task.assigneeIds?.length !== 1 ? 's' : ''}
        </span>
        {isGroupTask && (
          <span style={s.metaItem}>
            🌐 Group task
          </span>
        )}
      </div>

      {canUpdate && task.status !== "done" && (
        <div>
          <button onClick={() => setExp(!exp)} style={s.updateBtn}>
            {exp ? "Cancel" : "Update progress"}
          </button>

          {exp && (
            <div style={s.updatePanel}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", color: "#5f6368" }}>Progress</span>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#1a73e8" }}>{pct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={pct}
                onChange={e => setPct(Number(e.target.value))}
                style={{ width: "100%", marginBottom: "10px", accentColor: "#1a73e8" }}
              />
              <textarea
                style={s.noteInput}
                rows={2}
                placeholder="Add a note (optional)"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <button onClick={save} disabled={busy} style={s.saveBtn}>
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  card: { background: "#fff", borderRadius: "8px", padding: "16px", border: "1px solid #e8eaed", display: "flex", flexDirection: "column", gap: "10px", fontFamily: "'Google Sans','Roboto',sans-serif" },
  top: { display: "flex", gap: "12px" },
  titleRow: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" },
  taskId: { fontSize: "11px", fontFamily: "monospace", color: "#80868b", background: "#f1f3f4", padding: "1px 6px", borderRadius: "4px" },
  groupBadge: { fontSize: "11px", color: "#1a73e8", background: "#e8f0fe", padding: "1px 6px", borderRadius: "4px", fontWeight: 500 },
  title: { margin: 0, fontSize: "14px", fontWeight: 500, color: "#202124" },
  desc: { margin: "4px 0 0", fontSize: "13px", color: "#5f6368" },
  progressRow: { display: "flex", alignItems: "center", gap: "10px" },
  bar: { flex: 1, height: "6px", background: "#e8eaed", borderRadius: "10px", overflow: "hidden" },
  fill: { height: "100%", borderRadius: "10px", transition: "width 0.4s" },
  pctLabel: { fontSize: "12px", fontWeight: 500, color: "#5f6368", minWidth: "32px", textAlign: "right" },
  meta: { display: "flex", gap: "12px", flexWrap: "wrap" },
  metaItem: { fontSize: "12px", color: "#80868b" },
  updateBtn: { padding: "6px 14px", border: "1px solid #dadce0", borderRadius: "4px", background: "#fff", color: "#1a73e8", fontSize: "13px", fontWeight: 500, cursor: "pointer" },
  updatePanel: { marginTop: "10px", padding: "14px", background: "#f8f9fa", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "8px" },
  noteInput: { padding: "8px 12px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "13px", resize: "none", fontFamily: "'Roboto',sans-serif", width: "100%", boxSizing: "border-box" },
  saveBtn: { padding: "8px 20px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "13px", fontWeight: 500, cursor: "pointer", alignSelf: "flex-end" },
};