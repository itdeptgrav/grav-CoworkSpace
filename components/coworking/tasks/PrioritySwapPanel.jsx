"use client";
import { useState } from "react";

export default function PrioritySwapPanel({ tasks, onUpdatePriority, onRecalcDueDate, onClose }) {
    const [order, setOrder] = useState(() => [...(tasks || [])].sort((a, b) => Number(a.priority) - Number(b.priority)));
    const [dragIndex, setDragIndex] = useState(null);

    // Re-sync only when the actual set of tasks changes (panel reopened with
    // different data) — not on every render, or a drag-in-progress would reset.
    const taskIds = (tasks || []).map(t => t.taskId).join(",");
    const [lastTaskIds, setLastTaskIds] = useState(taskIds);
    if (taskIds !== lastTaskIds) {
        setLastTaskIds(taskIds);
        setOrder([...(tasks || [])].sort((a, b) => Number(a.priority) - Number(b.priority)));
    }

    // The SAME set of priority numbers that already existed, just reassigned
    // to whatever order the rows are dragged into — not renumbered to 1,2,3...
    const priorities = order.map(t => Number(t.priority)).sort((a, b) => a - b);

    const handleDrop = async (dropIndex) => {
        if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); return; }
        const next = [...order];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(dropIndex, 0, moved);
        setOrder(next);
        setDragIndex(null);

        const changes = next
            .map((t, i) => ({ taskId: t.taskId, oldPriority: Number(t.priority), newPriority: priorities[i] }))
            .filter(c => c.oldPriority !== c.newPriority);

        for (const c of changes) {
            await onUpdatePriority(c.taskId, c.newPriority);
        }
        // Recalc highest actual priority (lowest number) first, so the rest can
        // anchor off a due date that's already been freshly written.
        const toRecalc = [...changes].sort((a, b) => a.newPriority - b.newPriority);
        for (const c of toRecalc) {
            await onRecalcDueDate?.(c.taskId);
        }
    };

    return (
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", marginBottom: 12 }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Change Priority — drag to reorder</span>
                <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#6B7280", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
                {order.length === 0 && (
                    <div style={{ textAlign: "center", padding: 30, color: "#9CA3AF", fontSize: 12 }}>No forwarded tasks with a priority.</div>
                )}
                {order.map((t, i) => (
                    <div
                        key={t.taskId}
                        draggable
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(i)}
                        style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                            borderBottom: "1px solid #F1F5F9",
                            background: dragIndex === i ? "#EBF2FA" : "#fff",
                            cursor: "grab",
                        }}
                    >
                        <span style={{ color: "#9CA3AF", fontSize: 14, flexShrink: 0 }}>⠿</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#1B4F8A", borderRadius: 4, padding: "2px 6px", flexShrink: 0, minWidth: 24, textAlign: "center" }}>
                            P{priorities[i]}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{t.title}</div>
                            <div style={{ fontSize: 10, color: "#94A3B8" }}>{t.taskId} · by {t.assignedByName || t.assignedBy}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}