"use client";
import { useEffect, useState } from "react";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";

export default function FixPrioritiesPage() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const runFix = async () => {
    setRunning(true);
    setLog([]);
    try {
      // 1. Load all tasks
      addLog("Loading all tasks from Firestore…");
      const snap = await getDocs(collection(firebaseDb, "cowork_tasks"));
      const allTasks = snap.docs.map(d => ({ taskId: d.id, ...d.data() }));
      addLog(`Found ${allTasks.length} total tasks.`);

      // 2. Group by first assignee (primary assignee)
      // Tasks with no assignees (folders etc.) are skipped
      const groups = {}; // assigneeId -> task[]
      let skipped = 0;
      allTasks.forEach(t => {
        const ids = t.assigneeIds || [];
        if (!ids.length) { skipped++; return; }
        const primary = ids[0]; // group by the first assignee
        if (!groups[primary]) groups[primary] = [];
        groups[primary].push(t);
      });
      addLog(`Skipped ${skipped} tasks with no assignees (folders etc.).`);
      addLog(`Found ${Object.keys(groups).length} unique assignees to fix.`);

      // 3. For each assignee, sort tasks and re-number priority
      const updates = []; // { taskId, newPriority }
      Object.entries(groups).forEach(([empId, tasks]) => {
        // Sort: by existing priority ASC, then createdAt ASC as tiebreaker
        const sorted = [...tasks].sort((a, b) => {
          const pa = Number(a.priority) || 999;
          const pb = Number(b.priority) || 999;
          if (pa !== pb) return pa - pb;
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return ta - tb;
        });
        sorted.forEach((t, idx) => {
          const newPriority = idx + 1;
          if (Number(t.priority) !== newPriority) {
            updates.push({ taskId: t.taskId, newPriority });
          }
        });
        addLog(`Assignee ${empId}: ${sorted.length} tasks → re-numbered 1…${sorted.length}`);
      });

      addLog(`Total tasks needing an update: ${updates.length}`);
      if (updates.length === 0) {
        addLog("✅ Nothing to fix — priorities are already correct!");
        setDone(true);
        setRunning(false);
        return;
      }

      // 4. Write in Firestore batches (max 500 per batch)
      const BATCH_SIZE = 400;
      let written = 0;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const chunk = updates.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(firebaseDb);
        chunk.forEach(({ taskId, newPriority }) => {
          batch.update(doc(firebaseDb, "cowork_tasks", taskId), {
            priority: newPriority,
            order: (newPriority - 1) * 10, // keep order field consistent
          });
        });
        await batch.commit();
        written += chunk.length;
        addLog(`Batch committed: ${written} / ${updates.length} tasks written…`);
      }

      addLog(`✅ Done! ${written} tasks re-prioritised successfully.`);
      addLog("You can now delete this page (app/coworking/fix-priorities/page.js).");
      setDone(true);
    } catch (err) {
      addLog(`❌ Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 20px", fontFamily: "inherit" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
        One-time Priority Fix
      </h1>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 24, lineHeight: 1.6 }}>
        Re-numbers task priorities per assignee (P1, P2, P3…) based on their existing order.
        Tasks are sorted by current priority then <code>createdAt</code> before re-numbering.
        <strong> Delete this page after running.</strong>
      </p>

      <button
        onClick={runFix}
        disabled={running || done}
        style={{
          padding: "10px 24px", borderRadius: 8, border: "none",
          background: done ? "#16A34A" : running ? "#9CA3AF" : "#1B4F8A",
          color: "#fff", fontSize: 13, fontWeight: 600,
          cursor: running || done ? "not-allowed" : "pointer",
          fontFamily: "inherit", marginBottom: 20,
        }}
      >
        {done ? "✅ Complete" : running ? "Running…" : "Run Priority Fix"}
      </button>

      {log.length > 0 && (
        <div style={{
          background: "#0F172A", borderRadius: 8, padding: "14px 16px",
          fontFamily: "monospace", fontSize: 12, lineHeight: 1.7,
          maxHeight: 360, overflowY: "auto",
        }}>
          {log.map((line, i) => (
            <div key={i} style={{
              color: line.startsWith("✅") ? "#4ADE80"
                   : line.startsWith("❌") ? "#F87171"
                   : line.startsWith("Batch") ? "#93C5FD"
                   : "#E2E8F0"
            }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}