"use client";
import React from "react";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createTask, listAllEmployees, uploadImage, uploadPDF } from "../../../lib/mediaUploadApi";
import { getC2Config, validateC2Weightage } from "../../../lib/coworkApi";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { collection, doc, setDoc, updateDoc, serverTimestamp, increment, getDocs, query, where, orderBy, getDoc } from "firebase/firestore";


const emptySubtask = () => ({
  title: "",
  description: "",
  notes: "",
  assigneeIds: [],
  hasTimer: true,
  deadline: "",
  deadlineTime: "",
  priority: 5,
  attachments: [],
});

function SliderPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const TASK_TYPES = [
  { value: "normal", label: "Standard Task", desc: "A regular task assigned to one or more team members. Supports timer tracking or a fixed deadline." },
  { value: "folder", label: "Folder", desc: "An organisational container. Holds subtasks only — no assignees, chat, or reports." },
  { value: "repeat", label: "Repeat Task", desc: "Recurs automatically on a daily, weekly, or custom schedule. Each slot has its own deadline time." },
  { value: "thirdparty", label: "Third-party Task", desc: "Tracks progress on an external vendor dependency. Progress is logged via update entries." },
  { value: "goal", label: "Goal Task", desc: "A target-driven task with measurable milestones. Ideal for KPIs, sales targets, or long-term objectives." },
];

const TYPE_COPY = {
  normal: { titlePlaceholder: "e.g. Prepare Q3 Sales Report", descPlaceholder: "Briefly describe what this task involves and its expected outcome.", notesPlaceholder: "List specific requirements, deliverables, or acceptance criteria the assignee must meet.", notesLabel: "Requirements / Deliverables" },
  folder: { titlePlaceholder: "e.g. Marketing Campaign — June 2025", descPlaceholder: "Describe the purpose of this folder. Subtasks will be created inside it.", notesPlaceholder: "", notesLabel: "" },
  repeat: { titlePlaceholder: "e.g. Daily Task & KPI Update", descPlaceholder: "Describe what the assignee must complete each time this task recurs.", notesPlaceholder: "List what the assignee must submit for each occurrence.", notesLabel: "Submission Requirements (per occurrence)" },
  thirdparty: { titlePlaceholder: "e.g. Machine Spare Parts — Vendor Follow-up", descPlaceholder: "Describe what is being sourced or resolved through this external vendor.", notesPlaceholder: "List what information or documents are expected from the vendor.", notesLabel: "Expected Deliverable from Vendor" },
  goal: { titlePlaceholder: "e.g. Achieve ₹5 Crore Revenue — Q2 2025", descPlaceholder: "Describe the goal, its context, and why it matters to the organisation.", notesPlaceholder: "List the strategy, key actions, or sub-objectives the assignee should pursue.", notesLabel: "Strategy / Key Actions" },
};

// ── TimeTrackingSection — MODULE SCOPE ───────────────────────────────────────
// MUST be outside CreateTaskModal. If defined inside, React sees a new function
// reference on every render → unmounts + remounts the input DOM node → focus
// lost mid-keystroke → deadline field appears to auto-disable.
function TimeTrackingSection({ hasTimer, deadline, deadlineTime, onSet, timerDurationVal, timerDurationUnit }) {
  const _inp = { padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: "inherit", color: "#111827", background: "#fff", boxSizing: "border-box", width: "100%", outline: "none", transition: "border-color 0.12s" };
  const _lbl = { fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };
  // Local date string avoids UTC midnight drift for IST / UTC+ users
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  return (
    <div>
      <label style={_lbl}>Time Tracking</label>
      <div style={{ display: "flex", gap: 6, marginBottom: hasTimer ? 0 : 10 }}>
        {[{ val: true, label: "Timer — Start / Pause" }, { val: false, label: "Fixed Deadline" }].map(opt => (
          <button key={String(opt.val)} type="button" onClick={() => onSet("hasTimer", opt.val)}
            style={{ flex: 1, padding: "8px 6px", border: `1px solid ${hasTimer === opt.val ? "#1B4F8A" : "#E5E7EB"}`, borderRadius: 6, background: hasTimer === opt.val ? "#EBF2FA" : "#fff", color: hasTimer === opt.val ? "#1B4F8A" : "#6B7280", fontSize: 11, fontWeight: hasTimer === opt.val ? 600 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s", textAlign: "center" }}>
            {opt.label}
          </button>
        ))}
      </div>
      {hasTimer && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ padding: "7px 10px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
            The assignee will start a timer when beginning work. Time worked is recorded automatically.
          </div>
          <div>
            <label style={_lbl}>Your Estimated Duration <span style={{ fontWeight: 400, textTransform: "none", color: "#9CA3AF" }}>(optional — assignee can negotiate)</span></label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="ctm-inp" style={{ ..._inp, width: 80 }} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 3"
                value={timerDurationVal || ""}
                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); onSet("timerDurationVal", v); }} />
              <select className="ctm-inp" style={{ ..._inp, flex: 1, cursor: "pointer" }}
                value={timerDurationUnit || "hours"} onChange={e => onSet("timerDurationUnit", e.target.value)}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>
        </div>
      )}
      {!hasTimer && (
        <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
          <div style={{ flex: 2 }}>
            <label style={_lbl}>Deadline Date *</label>
            <input className="ctm-inp" style={_inp} type="date"
              value={deadline || ""} min={todayStr}
              onChange={e => onSet("deadline", e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={_lbl}>Time *</label>
            <input className="ctm-inp" style={_inp} type="time"
              value={deadlineTime || ""}
              onChange={e => onSet("deadlineTime", e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Working hours calculator (ETC auto-calc) ─────────────────────────────────
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function _calcWorkingHours(start, end, schedule) {
  let totalMins = 0;
  const cur = new Date(start);
  // Move to minute boundary
  cur.setSeconds(0, 0);
  while (cur < end) {
    const dayName = DAY_NAMES[cur.getDay()];
    const dayCfg = schedule?.[dayName];
    if (!dayCfg?.isOff) {
      const [inH, inM] = (dayCfg?.inTime || "09:30").split(":").map(Number);
      const [outH, outM] = (dayCfg?.outTime || "18:30").split(":").map(Number);
      const dayIn = new Date(cur); dayIn.setHours(inH, inM, 0, 0);
      const dayOut = new Date(cur); dayOut.setHours(outH, outM, 0, 0);
      const effStart = new Date(Math.max(cur.getTime(), dayIn.getTime()));
      const effEnd = new Date(Math.min(end.getTime(), dayOut.getTime()));
      if (effEnd > effStart) totalMins += (effEnd - effStart) / 60000;
    }
    // Jump to next calendar day at midnight
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
  }
  return +((totalMins / 60).toFixed(2));
}

export default function CreateTaskModal({
  onClose, onSuccess,
  currentEmployeeId, currentEmployeeName, currentRole,
  parentTask = null, initialIsGoal = false,
  editTask = null,
}) {
  const isEditMode = !!editTask;
  const isMultiMode = !!parentTask && (currentRole === "ceo" || currentRole === "tl");

  const [isGoalUrl, setIsGoalUrl] = useState(false);
  const [reqInput, setReqInput] = useState("");

  // ── C2 Band (Gold Task) state ─────────────────────────────────────────────
  const [isGoldTask, setIsGoldTask] = useState(false);
  const [c2WeightPct, setC2WeightPct] = useState("");
  const [c2GlobalMaxPts, setC2GlobalMaxPts] = useState(0);
  const [c2Remaining, setC2Remaining] = useState(100);
  const [c2TaskMaxPts, setC2TaskMaxPts] = useState(0);
  const [c2WeightError, setC2WeightError] = useState("");
  const [c2Validating, setC2Validating] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsGoalUrl(params.get("filter") === "goal");
    }
  }, []);

  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  const handleClose = () => { setVisible(false); setTimeout(onClose, 260); };

  const defaultType = editTask?.isGoal ? "goal" : editTask?.isRepeat ? "repeat" : editTask?.isThirdParty ? "thirdparty" : editTask?.isFolder ? "folder" : (initialIsGoal || isGoalUrl) ? "goal" : "normal";
  const [taskType, setTaskType] = useState(defaultType);
  useEffect(() => { if (isGoalUrl && !isEditMode) setTaskType("goal"); }, [isGoalUrl, isEditMode]);

  // Live-recalculate taskMaxPoints whenever weightage input changes
  useEffect(() => {
    const w = parseFloat(c2WeightPct) || 0;
    const g = c2GlobalMaxPts;
    setC2TaskMaxPts(g > 0 && w > 0 ? +((w * g) / 100).toFixed(2) : 0);
    setC2WeightError(""); // clear previous error on change
  }, [c2WeightPct, c2GlobalMaxPts]);


  const isFolder = taskType === "folder";
  const isRepeat = taskType === "repeat";
  const isThirdParty = taskType === "thirdparty";
  const isGoal = taskType === "goal";
  const copy = TYPE_COPY[taskType] || TYPE_COPY.normal;

  // Fetch C2 config directly from Firestore — same source as SOP Settings panel.
  // MUST be after `const isGoal` — hooks cannot reference a const before its declaration.
  // Do NOT use the backend API here: c2Band.routes may not be deployed yet,
  // and a silent 404 would leave c2GlobalMaxPts=0 and block task creation.
  useEffect(() => {
    if (!isGoal) return;
    getDoc(doc(firebaseDb, "cowork_sop_settings", "task_events"))
      .then(snap => {
        if (!snap.exists()) return;
        const maxPts = Number(snap.data().c2GlobalMaxPoints) || 0;
        setC2GlobalMaxPts(maxPts);
        // Best-effort: also try backend for remaining pool % (non-blocking)
        if (maxPts > 0) {
          getC2Config()
            .then(d => { if (d?.remaining != null) setC2Remaining(d.remaining); })
            .catch(() => { /* backend not deployed yet — remaining stays at 100 */ });
        }
      })
      .catch(() => { });
  }, [isGoal]);

  // ── Single-mode state ──
  const [step, setStep] = useState(1);
  const _fixedDL = editTask?.fixedDeadline ? new Date(editTask.fixedDeadline) : null;
  const [form, setForm] = useState({
    title: editTask?.title || "",
    description: editTask?.description || "",
    notes: editTask?.notes || "",
    requirements: editTask?.requirements || [],
    hasTimer: editTask ? (editTask.hasTimer ?? true) : true,
    deadline: _fixedDL ? _fixedDL.toISOString().split("T")[0] : "",
    deadlineTime: _fixedDL ? _fixedDL.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
    priority: editTask?.priority || 5,
    timerDurationVal: editTask?.timerDurationVal || "",
    timerDurationUnit: editTask?.timerDurationUnit || "hours",
  });

  // Per-assignee priority: queries only tasks that include these specific people,
  // so Person A's P1 stays P1 regardless of how many tasks other people have.
  const fetchNextPriorityForAssignees = async (assigneeIds) => {
    if (!assigneeIds?.length) return 1;
    try {
      const snapshots = await Promise.all(
        assigneeIds.map(aid =>
          getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", aid)))
        )
      );
      const allPriorities = snapshots
        .flatMap(snap => snap.docs.map(d => Number(d.data().priority) || 0))
        .filter(p => p > 0);
      return allPriorities.length > 0 ? Math.max(...allPriorities) + 1 : 1;
    } catch {
      return 1;
    }
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const [repeatConfig, setRepeatConfig] = useState({
    frequency: "daily", activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    timesPerDay: 1, deadlineTimes: ["10:00"],
    startDate: "", endDate: "", missedAction: "lock",
    hasDailyReport: false, hasTimer: false,
  });
  const setRC = (k, v) => setRepeatConfig(prev => ({ ...prev, [k]: v }));

  // ── Auto-calculate ETC from working schedule + deadline ───────────────────
  const [workSchedule, setWorkSchedule] = useState(null);
  const [autoEtcHours, setAutoEtcHours] = useState(0);

  useEffect(() => {
    import("../../../lib/coworkFirebase").then(({ firebaseDb }) => {
      import("firebase/firestore").then(({ getDoc, doc }) => {
        getDoc(doc(firebaseDb, "cowork_settings", "office")).then(snap => {
          if (snap.exists() && snap.data().schedule) setWorkSchedule(snap.data().schedule);
        }).catch(() => { });
      });
    });
  }, []);

  useEffect(() => {
    if (!workSchedule || !form.deadline) { setAutoEtcHours(0); return; }
    const deadline = new Date(`${form.deadline}T${form.deadlineTime || "23:59"}`);
    if (isNaN(deadline) || deadline <= new Date()) { setAutoEtcHours(0); return; }
    setAutoEtcHours(_calcWorkingHours(new Date(), deadline, workSchedule));
  }, [form.deadline, form.deadlineTime, workSchedule]);

  const toggleDay = (day) => setRC("activeDays",
    repeatConfig.activeDays.includes(day)
      ? repeatConfig.activeDays.filter(d => d !== day)
      : [...repeatConfig.activeDays, day]
  );
  const setTimesPerDay = (n) => {
    const count = Math.max(1, Math.min(10, Number(n) || 1));
    const updated = Array.from({ length: count }, (_, i) => repeatConfig.deadlineTimes[i] || "10:00");
    setRepeatConfig(prev => ({ ...prev, timesPerDay: count, deadlineTimes: updated }));
  };
  const setDeadlineTime = (i, val) => {
    const updated = [...repeatConfig.deadlineTimes]; updated[i] = val;
    setRC("deadlineTimes", updated);
  };

  const [thirdPartyConfig, setThirdPartyConfig] = useState({
    vendorName: "", vendorCategory: "Machine", hasVendorContact: false,
    vendorContact: "", estimatedDate: "", updateIntervalDays: 2,
  });
  const setTPC = (k, v) => setThirdPartyConfig(prev => ({ ...prev, [k]: v }));

  // Goal config — milestones removed
  const [goalConfig, setGoalConfig] = useState({ goalDescription: "", deadline: "" });
  const setGC = (k, v) => setGoalConfig(prev => ({ ...prev, [k]: v }));

  // ── Multi-mode state ──
  const [subtaskRows, setSubtaskRows] = useState([emptySubtask()]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [rowUploading, setRowUploading] = useState([false]);
  const rowImageInputRef = useRef(null);
  const rowPdfInputRef = useRef(null);

  const updateRow = (i, k, v) =>
    setSubtaskRows(prev => prev.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const toggleRowAssignee = (rowIdx, empId) => {
    setSubtaskRows(prev => prev.map((r, j) => {
      if (j !== rowIdx) return r;
      const has = r.assigneeIds.includes(empId);
      return { ...r, assigneeIds: has ? r.assigneeIds.filter(x => x !== empId) : [...r.assigneeIds, empId] };
    }));
  };

  const addSubtaskRow = () => {
    setSubtaskRows(prev => [...prev, emptySubtask()]);
    setRowUploading(prev => [...prev, false]);
    setActiveRowIndex(subtaskRows.length);
  };

  const removeSubtaskRow = (i) => {
    if (subtaskRows.length === 1) return;
    setSubtaskRows(prev => prev.filter((_, j) => j !== i));
    setRowUploading(prev => prev.filter((_, j) => j !== i));
    setActiveRowIndex(prev => Math.max(0, prev >= i ? prev - 1 : prev));
  };

  // ── Shared employee state ──
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState(editTask?.assigneeIds || []);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Single-mode attachments ──
  const [attachments, setAttachments] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const imageInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    listAllEmployees()
      .then(emps => setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId)))
      .catch(() => { });
  }, [currentEmployeeId]);

  const toggle = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
  const toggleDept = (dept) => setSelectedDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  const visibleEmployees = selectedDepts.length === 0 ? employees : employees.filter(e => selectedDepts.includes(e.department));
  const assignedToTL = selectedIds.some(id => employees.find(e => e.employeeId === id)?.role === "tl");
  const needsApproval = currentRole === "employee" && assignedToTL;

  const empDisplayName = (emp) => {
    if (emp.role === "tl" && emp.department) return `${emp.name} (${emp.department} TL)`;
    if (emp.role === "tl") return `${emp.name} (TL)`;
    return emp.name;
  };

  // ── File handlers ──
  const handleImagePick = async (e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    setUploadingFiles(true); setError("");
    try {
      const results = await Promise.all(files.map(async (file) => {
        const localUrl = URL.createObjectURL(file);
        const result = await uploadImage(file, "cowork-task-attachments");
        return { type: "image", url: result.url, name: file.name, localUrl };
      }));
      setAttachments(prev => [...prev, ...results]);
    } catch (err) { setError("Image upload failed: " + err.message); }
    finally { setUploadingFiles(false); if (imageInputRef.current) imageInputRef.current.value = ""; }
  };

  const handlePdfPick = async (e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    setUploadingFiles(true); setError("");
    try {
      const results = await Promise.all(files.map(async (file) => {
        const result = await uploadPDF(file);
        return { type: "pdf", url: result.url || result.webViewLink || result.fileUrl, name: result.name || file.name };
      }));
      setAttachments(prev => [...prev, ...results]);
    } catch (err) { setError("PDF upload failed: " + err.message); }
    finally { setUploadingFiles(false); if (pdfInputRef.current) pdfInputRef.current.value = ""; }
  };

  const removeAttachment = (idx) => {
    setAttachments(prev => {
      const updated = [...prev];
      if (updated[idx]?.localUrl) URL.revokeObjectURL(updated[idx].localUrl);
      updated.splice(idx, 1);
      return updated;
    });
  };

  const handleRowImagePick = async (e, rowIdx) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    setRowUploading(prev => { const u = [...prev]; u[rowIdx] = true; return u; });
    setError("");
    try {
      const results = await Promise.all(files.map(async (file) => {
        const localUrl = URL.createObjectURL(file);
        const result = await uploadImage(file, "cowork-task-attachments");
        return { type: "image", url: result.url, name: file.name, localUrl };
      }));
      updateRow(rowIdx, "attachments", [...(subtaskRows[rowIdx].attachments || []), ...results]);
    } catch (err) { setError("Image upload failed: " + err.message); }
    finally {
      setRowUploading(prev => { const u = [...prev]; u[rowIdx] = false; return u; });
      if (rowImageInputRef.current) rowImageInputRef.current.value = "";
    }
  };

  const handleRowPdfPick = async (e, rowIdx) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    setRowUploading(prev => { const u = [...prev]; u[rowIdx] = true; return u; });
    setError("");
    try {
      const results = await Promise.all(files.map(async (file) => {
        const result = await uploadPDF(file);
        return { type: "pdf", url: result.url || result.webViewLink || result.fileUrl, name: result.name || file.name };
      }));
      updateRow(rowIdx, "attachments", [...(subtaskRows[rowIdx].attachments || []), ...results]);
    } catch (err) { setError("PDF upload failed: " + err.message); }
    finally {
      setRowUploading(prev => { const u = [...prev]; u[rowIdx] = false; return u; });
      if (rowPdfInputRef.current) rowPdfInputRef.current.value = "";
    }
  };

  const removeRowAttachment = (rowIdx, attIdx) => {
    const row = subtaskRows[rowIdx];
    const updated = [...(row.attachments || [])];
    if (updated[attIdx]?.localUrl) URL.revokeObjectURL(updated[attIdx].localUrl);
    updated.splice(attIdx, 1);
    updateRow(rowIdx, "attachments", updated);
  };

  // ── Chat helpers ──
  const postSubtaskNotification = async (parentTaskId, subtaskTitle, subtaskId) => {
    try {
      const messageId = crypto.randomUUID();
      const msgsRef = collection(firebaseDb, "cowork_tasks", parentTaskId, "chat");
      const taskRef = doc(firebaseDb, "cowork_tasks", parentTaskId);
      await setDoc(doc(msgsRef, messageId), {
        messageId, taskId: parentTaskId,
        senderId: currentEmployeeId, senderName: currentEmployeeName || "System",
        text: `Subtask "${subtaskTitle}" has been created under this task`,
        attachments: [], messageType: "system", mention: null,
        createdAt: serverTimestamp(), subtaskId,
      });
      await updateDoc(taskRef, {
        chatMessageCount: increment(1), lastChatAt: serverTimestamp(),
        lastChatPreview: `Subtask "${subtaskTitle}" created`, updatedAt: serverTimestamp(),
      });
    } catch (err) { console.error("postSubtaskNotification:", err); }
  };

  const postAttachmentsToChat = async (taskId, atts) => {
    if (!atts?.length) return;
    try {
      const messageId = crypto.randomUUID();
      const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
      const taskRef = doc(firebaseDb, "cowork_tasks", taskId);
      const clean = atts.map(a => ({ url: a.url || "", name: a.name || "Attachment", type: a.type || "file", mimeType: a.mimeType || "", originalName: a.name || "" }));
      await setDoc(doc(msgsRef, messageId), {
        messageId, taskId, senderId: currentEmployeeId, senderName: currentEmployeeName || "System",
        text: `${atts.length} attachment${atts.length > 1 ? "s" : ""} added at task creation`,
        attachments: clean, messageType: "attachment", mention: null, createdAt: serverTimestamp(),
      });
      await updateDoc(taskRef, {
        chatMessageCount: increment(1), lastChatAt: serverTimestamp(),
        lastChatPreview: `${atts.length} file${atts.length > 1 ? "s" : ""} attached`, updatedAt: serverTimestamp(),
      });
    } catch (err) { console.error("postAttachmentsToChat:", err); }
  };

  // ── Submit ──
  const handleSubmit = async (asDraft = false) => {
    setError(""); setSubmitting(true);
    try {

      // ── Edit mode: update existing draft task ──────────────────────────────
      if (isEditMode) {
        if (!form.title.trim()) { setError("Title is required."); setSubmitting(false); return; }
        const fixedDeadlineISO = (!form.hasTimer && form.deadline)
          ? new Date(`${form.deadline}T${form.deadlineTime || "23:59"}`).toISOString() : null;
        const taskRef = doc(firebaseDb, "cowork_tasks", editTask.taskId);
        await updateDoc(taskRef, {
          title: form.title.trim(),
          description: form.description,
          notes: form.notes,
          hasTimer: form.hasTimer,
          fixedDeadline: fixedDeadlineISO || null,
          priority: form.priority || 1,
          assigneeIds: selectedIds,
          status: asDraft ? "draft" : "open",
          updatedAt: serverTimestamp(),
        });
        onSuccess?.();
        return;
      }

      if (isMultiMode) {
        const validRows = subtaskRows.filter(r => r.title.trim() && r.assigneeIds.length > 0);
        if (!validRows.length) { setError("At least one subtask must have a title and an assignee."); setSubmitting(false); return; }
        // priorityCache prevents same-person subtasks in one batch getting the same priority
        const priorityCache = {};
        for (const row of validRows) {
          const fixedDL = (!row.hasTimer && row.deadline)
            ? new Date(`${row.deadline}T${row.deadlineTime || "23:59"}`).toISOString() : null;
          const cacheKey = [...row.assigneeIds].sort().join(",") || "__empty__";
          let rowPriority;
          if (priorityCache[cacheKey] !== undefined) {
            rowPriority = priorityCache[cacheKey];
          } else {
            rowPriority = await fetchNextPriorityForAssignees(row.assigneeIds);
          }
          priorityCache[cacheKey] = rowPriority + 1; // bump for any next row with same assignees
          const newTask = await createTask({
            title: row.title.trim(), description: row.description, notes: row.notes,
            assigneeIds: row.assigneeIds, dueDate: null, priority: rowPriority,
            hasTimer: row.hasTimer, fixedDeadline: fixedDL,
            parentTaskId: parentTask?.taskId || null,
            createdByRole: currentRole, createdBy: currentEmployeeId,
            createdByCeo: currentRole === "ceo", createdByTl: currentRole === "tl",
          });
          if (parentTask?.taskId && newTask?.taskId) await postSubtaskNotification(parentTask.taskId, row.title.trim(), newTask.taskId);
          if (newTask?.taskId && row.attachments?.length > 0) await postAttachmentsToChat(newTask.taskId, row.attachments);
        }
        onSuccess?.();
      } else {
        if (!form.title.trim()) { setError("Title is required."); setSubmitting(false); return; }
        if (!isFolder && !selectedIds.length) { setError("Assign to at least one person."); setSubmitting(false); return; }
        const isSpecialType = isFolder || isRepeat || isThirdParty || isGoal;
        const timerOn = isSpecialType ? undefined : form.hasTimer;
        const fixedDeadlineISO = (!isSpecialType && !form.hasTimer && form.deadline)
          ? new Date(`${form.deadline}T${form.deadlineTime || "23:59"}`).toISOString() : null;
        // ── Sender-preset timer: convert timerDurationVal/Unit → seconds ──
        let _senderTimerSecs = 0;
        if (!isSpecialType && form.hasTimer && form.timerDurationVal) {
          const val = Number(form.timerDurationVal) || 0;
          const unit = form.timerDurationUnit || "hours";
          _senderTimerSecs = val * (unit === "minutes" ? 60 : unit === "days" ? 86400 : 3600);
        }

        // ── C2 Band hard-block validation ────────────────────────────────────
        // Runs before any DB write. Reads c2GlobalMaxPts from Firestore directly
        // as a fallback in case the useEffect fetch hasn't resolved yet.
        if (isGoal && isGoldTask) {
          if (!c2WeightPct || parseFloat(c2WeightPct) <= 0) {
            setError("C2 Gold Task requires a weightage % (1–100).");
            setSubmitting(false); return;
          }
          // If c2GlobalMaxPts is still 0 (useEffect not yet resolved),
          // do a synchronous Firestore read right here before blocking the user.
          let resolvedMaxPts = c2GlobalMaxPts;
          if (resolvedMaxPts <= 0) {
            try {
              const snap = await getDoc(doc(firebaseDb, "cowork_sop_settings", "task_events"));
              if (snap.exists()) {
                resolvedMaxPts = Number(snap.data().c2GlobalMaxPoints) || 0;
                if (resolvedMaxPts > 0) setC2GlobalMaxPts(resolvedMaxPts);
              }
            } catch (_) { }
          }
          if (resolvedMaxPts <= 0) {
            setError("C2 Band Global Max Points is not configured. Ask your Admin to set it in SOP Settings.");
            setSubmitting(false); return;
          }
          setC2Validating(true);
          let valResult = { valid: true };
          try {
            valResult = await validateC2Weightage({ weightagePercent: parseFloat(c2WeightPct) });
          } catch (_) {
            // Backend not deployed — allow optimistic proceed
          } finally { setC2Validating(false); }
          if (!valResult.valid) {
            setC2WeightError(valResult.error || "Weightage validation failed.");
            setError(valResult.error || "C2 Band weightage exceeds available pool.");
            setSubmitting(false); return;
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        const computedPriority = isFolder ? 5 : await fetchNextPriorityForAssignees(selectedIds);
        const newTask = await createTask({
          title: form.title.trim(), description: form.description,
          notes: isFolder ? "" : form.notes,
          requirements: isFolder ? [] : (form.requirements || []),
          assigneeIds: isFolder ? [] : selectedIds,
          dueDate: null, priority: computedPriority,
          parentTaskId: parentTask?.taskId || null,
          createdByRole: currentRole, createdBy: currentEmployeeId,
          createdByCeo: currentRole === "ceo" && !parentTask, createdByTl: currentRole === "tl",
          status: "open", isFolder: isFolder || false, hasTimer: timerOn, fixedDeadline: fixedDeadlineISO,
          isRepeat: isRepeat || false, repeatConfig: isRepeat ? repeatConfig : null,
          isThirdParty: isThirdParty || false, thirdPartyConfig: isThirdParty ? thirdPartyConfig : null,
          isGoal: isGoal || false, goalConfig: isGoal ? goalConfig : null,
          etcHours: (!isGoal && !isFolder && !isRepeat && !isThirdParty) ? autoEtcHours : 0,
          isGoldTask: (isGoal && isGoldTask) || false,
          c2Config: (isGoal && isGoldTask && c2WeightPct && c2GlobalMaxPts > 0) ? {
            weightagePercent: parseFloat(c2WeightPct),
            taskMaxPoints: c2TaskMaxPts,
            globalMaxPointsAtCreation: c2GlobalMaxPts,
          } : null,
          senderTimerWindowSecs: _senderTimerSecs,
        });
        if (parentTask?.taskId && newTask?.taskId) await postSubtaskNotification(parentTask.taskId, form.title.trim(), newTask.taskId);
        if (newTask?.taskId && attachments.length > 0) await postAttachmentsToChat(newTask.taskId, attachments);
        onSuccess?.(newTask);
      }
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const canAdvance = () => {
    if (!form.title.trim()) { setError("Title is required."); return false; }
    if (!isFolder && !isRepeat && !isThirdParty && !isGoal && !form.hasTimer) {
      if (!form.deadline) { setError("Deadline date is required."); return false; }
      if (!form.deadlineTime) { setError("Deadline time is required."); return false; }
    }
    if (isRepeat && !repeatConfig.deadlineTimes?.[0]) { setError("Deadline time is required for at least one slot."); return false; }
    if (isRepeat && !repeatConfig.startDate) { setError("Start date is required."); return false; }
    setError(""); return true;
  };

  const canAdvanceRow = (rowIdx) => {
    const row = subtaskRows[rowIdx];
    if (!row.title.trim()) { setError("Title is required for this subtask."); return false; }
    if (!row.hasTimer && !row.deadline) { setError("Deadline date is required."); return false; }
    if (!row.hasTimer && !row.deadlineTime) { setError("Deadline time is required."); return false; }
    if (!row.assigneeIds.length) { setError("Assign this subtask to at least one person."); return false; }
    setError(""); return true;
  };

  const panelTitle = (() => {
    if (isEditMode) return editTask.status === "draft" ? "Edit Draft Task" : "View Task";
    if (parentTask) return isMultiMode ? "Add Subtasks" : "Add Subtask";
    if (isGoal || isGoalUrl) return "Create Goal Task";
    return "Create Task";
  })();

  const selectedTypeInfo = TASK_TYPES.find(t => t.value === taskType);

  const inp = {
    padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6,
    fontSize: 12, fontFamily: "inherit", color: "#111827", background: "#fff",
    boxSizing: "border-box", width: "100%", outline: "none", transition: "border-color 0.12s",
  };
  const lbl = {
    fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase",
    letterSpacing: "0.05em", display: "block", marginBottom: 5,
  };
  const sectionBox = (color) => ({
    border: `1px solid ${color}`, borderRadius: 7, padding: "13px",
    display: "flex", flexDirection: "column", gap: 11,
    background: color === "#BFDBFE" ? "#FAFCFF" : color === "#DDD6FE" ? "#FAFAFF" : color === "#E9D5FF" ? "#FDFAFF" : "#F9FAFB",
  });
  const sectionTitle = (color) => ({
    fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em",
  });

  // ── AssigneePicker ──
  const AssigneePicker = ({ selectedIds: selIds, onToggle, rowVisibleEmployees }) => (
    <div>
      <label style={lbl}>
        Assign to *
        {selIds.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, background: "#EBF2FA", color: "#1B4F8A", border: "1px solid #BFDBFE", marginLeft: 6 }}>
            {selIds.length} selected
          </span>
        )}
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 170, overflowY: "auto", padding: "2px 0" }}>
        {(rowVisibleEmployees || visibleEmployees).length === 0
          ? <span style={{ fontSize: 12, color: "#9CA3AF" }}>{employees.length === 0 ? "Loading employees…" : "No employees found."}</span>
          : (rowVisibleEmployees || visibleEmployees).map(emp => {
            const sel = selIds.includes(emp.employeeId);
            return (
              <button key={emp.employeeId} type="button" onClick={() => onToggle(emp.employeeId)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${sel ? "#1B4F8A" : "#E5E7EB"}`, borderRadius: 5, background: sel ? "#EBF2FA" : "#fff", cursor: "pointer", fontSize: 12, color: sel ? "#1B4F8A" : "#374151", fontWeight: sel ? 600 : 400, fontFamily: "inherit", transition: "all 0.1s" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: sel ? "#1B4F8A" : "#E5E7EB", color: sel ? "#fff" : "#6B7280", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{emp.name?.[0]?.toUpperCase()}</span>
                <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{empDisplayName(emp)}</span>
                {emp.role === "tl" && <span style={{ fontSize: 8, fontWeight: 700, background: "#064E3B", color: "#fff", borderRadius: 3, padding: "1px 4px" }}>TL</span>}
                {sel && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}><path d="M2 6l3 3 5-5" stroke="#1B4F8A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            );
          })
        }
      </div>
    </div>
  );

  // ── AttachmentSection ──
  const AttachmentSection = ({ atts, onImagePick, onPdfPick, onRemove, uploading, imgRef, pdfRef }) => (
    <div>
      <label style={lbl}>Attachments <span style={{ fontWeight: 400, textTransform: "none", color: "#9CA3AF", marginLeft: 6 }}>(optional)</span></label>
      <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onImagePick} />
      <input ref={pdfRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" multiple style={{ display: "none" }} onChange={onPdfPick} />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => imgRef.current?.click()} disabled={uploading}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1px dashed #BBF7D0", borderRadius: 5, background: "transparent", color: "#065F46", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          + Images
        </button>
        <button type="button" onClick={() => pdfRef.current?.click()} disabled={uploading}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1px dashed #FECDD3", borderRadius: 5, background: "transparent", color: "#9F1239", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          + PDF / Docs
        </button>
        {uploading && <span style={{ fontSize: 11, color: "#9CA3AF", alignSelf: "center" }}>Uploading…</span>}
      </div>
      {atts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
          {atts.map((att, idx) => (
            <div key={idx} style={{ position: "relative", flexShrink: 0 }}>
              {att.type === "image"
                ? <img src={att.localUrl || att.url} alt={att.name} style={{ width: 70, height: 50, objectFit: "cover", borderRadius: 5, border: "1px solid #E5E7EB", display: "block" }} />
                : <div style={{ width: 70, height: 50, border: "1px solid #E5E7EB", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", background: "#F9FAFB", fontSize: 9, color: "#6B7280", textAlign: "center", padding: 4, overflow: "hidden" }}>{att.name}</div>
              }
              <button type="button" onClick={() => onRemove(idx)}
                style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, borderRadius: "50%", background: "#EF4444", color: "#fff", border: "none", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── TimeTrackingSection ──


  // ── Multi-mode render ──
  const [rowStep, setRowStep] = useState(1);
  const activeRow = subtaskRows[activeRowIndex] || emptySubtask();
  const setActiveRowField = (k, v) => updateRow(activeRowIndex, k, v);

  const renderMultiMode = () => (
    <>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
        {subtaskRows.map((row, i) => (
          <button key={i} type="button" onClick={() => { setActiveRowIndex(i); setRowStep(1); setError(""); }}
            style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${activeRowIndex === i ? "#1B4F8A" : "#E5E7EB"}`, background: activeRowIndex === i ? "#EBF2FA" : "#F9FAFB", color: activeRowIndex === i ? "#1B4F8A" : "#6B7280", fontSize: 11, fontWeight: activeRowIndex === i ? 700 : 400, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            Subtask {i + 1}
            {row.title.trim() && row.assigneeIds.length > 0 && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </button>
        ))}
        <button type="button" onClick={addSubtaskRow}
          style={{ padding: "5px 12px", borderRadius: 6, border: "1px dashed #D1D5DB", background: "#fff", color: "#6B7280", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Subtask
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0 4px", borderBottom: "1px solid #F3F4F6", marginBottom: 4 }}>
        {[{ n: 1, label: "Task Details" }, { n: 2, label: "Assign & Attachments" }].map((s, i) => (
          <React.Fragment key={s.n}>
            {i > 0 && <div style={{ flex: 1, height: 1, background: rowStep > 1 ? "#1B4F8A" : "#E5E7EB", maxWidth: 36 }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 19, height: 19, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, background: rowStep > s.n ? "#16A34A" : rowStep === s.n ? "#1B4F8A" : "#F3F4F6", color: rowStep >= s.n ? "#fff" : "#9CA3AF" }}>
                {rowStep > s.n ? "✓" : s.n}
              </div>
              <span style={{ fontSize: 11, color: rowStep === s.n ? "#1B4F8A" : "#6B7280", fontWeight: rowStep === s.n ? 600 : 400 }}>{s.label}</span>
            </div>
          </React.Fragment>
        ))}
        {subtaskRows.length > 1 && (
          <button type="button" onClick={() => removeSubtaskRow(activeRowIndex)}
            style={{ marginLeft: "auto", fontSize: 11, color: "#DC2626", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Remove this subtask
          </button>
        )}
      </div>

      {rowStep === 1 && (
        <>
          <div>
            <label style={lbl}>Title *</label>
            <input className="ctm-inp" style={inp} value={activeRow.title} onChange={e => setActiveRowField("title", e.target.value)} placeholder="Enter a clear, action-oriented subtask title" autoFocus />
          </div>
          <div>
            <label style={lbl}>Description</label>
            <textarea className="ctm-inp" style={{ ...inp, height: 60, resize: "vertical" }} value={activeRow.description} onChange={e => setActiveRowField("description", e.target.value)} placeholder="Briefly describe what this subtask involves." />
          </div>
          <div>
            <label style={lbl}>Requirements / Deliverables</label>
            {/* Point list */}
            {(activeRow.requirements || []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                {(activeRow.requirements || []).map((req, ri) => (
                  <div key={ri} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 9px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 5 }}>
                    <span style={{ color: "#1B4F8A", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>•</span>
                    <span style={{ flex: 1, fontSize: 12, color: "#111827", lineHeight: 1.5 }}>{req}</span>
                    <button onClick={() => setActiveRowField("requirements", (activeRow.requirements || []).filter((_, i) => i !== ri))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {/* Input row */}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="ctm-inp"
                style={{ ...inp, flex: 1 }}
                value={reqInput}
                onChange={e => setReqInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && reqInput.trim()) {
                    e.preventDefault();
                    setActiveRowField("requirements", [...(activeRow.requirements || []), reqInput.trim()]);
                    setReqInput("");
                  }
                }}
                placeholder="Type a requirement and press Enter"
              />
              <button
                onClick={() => {
                  if (!reqInput.trim()) return;
                  setActiveRowField("requirements", [...(activeRow.requirements || []), reqInput.trim()]);
                  setReqInput("");
                }}
                style={{ padding: "0 12px", border: "1px solid #1B4F8A", borderRadius: 5, background: "#EBF2FA", color: "#1B4F8A", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                + Add
              </button>
            </div>
          </div>
          <TimeTrackingSection hasTimer={activeRow.hasTimer} deadline={activeRow.deadline} deadlineTime={activeRow.deadlineTime} onSet={(k, v) => setActiveRowField(k, v)} />
        </>
      )}

      {rowStep === 2 && (
        <>
          {allDepts.length > 0 && (
            <div style={{ padding: "8px 10px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                Filter by department
                {selectedDepts.length > 0 && <button type="button" onClick={() => setSelectedDepts([])} style={{ fontSize: 11, color: "#1B4F8A", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Clear filter</button>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {allDepts.map(dept => {
                  const active = selectedDepts.includes(dept);
                  const cnt = employees.filter(e => e.department === dept).length;
                  return (
                    <button key={dept} type="button" onClick={() => toggleDept(dept)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", border: `1px solid ${active ? "#1B4F8A" : "#E5E7EB"}`, borderRadius: 4, background: active ? "#EBF2FA" : "#fff", color: active ? "#1B4F8A" : "#374151", fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                      {dept} <span style={{ fontSize: 9, background: active ? "rgba(27,79,138,0.15)" : "#F3F4F6", color: active ? "#1B4F8A" : "#6B7280", borderRadius: 99, padding: "0 4px" }}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <AssigneePicker selectedIds={activeRow.assigneeIds} onToggle={(empId) => toggleRowAssignee(activeRowIndex, empId)} />
          <input ref={rowImageInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleRowImagePick(e, activeRowIndex)} />
          <input ref={rowPdfInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" multiple style={{ display: "none" }} onChange={e => handleRowPdfPick(e, activeRowIndex)} />
          <AttachmentSection atts={activeRow.attachments || []} onImagePick={e => handleRowImagePick(e, activeRowIndex)} onPdfPick={e => handleRowPdfPick(e, activeRowIndex)} onRemove={(attIdx) => removeRowAttachment(activeRowIndex, attIdx)} uploading={rowUploading[activeRowIndex] || false} imgRef={rowImageInputRef} pdfRef={rowPdfInputRef} />
        </>
      )}
    </>
  );

  const totalValidRows = subtaskRows.filter(r => r.title.trim() && r.assigneeIds.length > 0).length;

  return (
    <SliderPortal>
      <style>{`
        @keyframes slide-in  { from { transform:translateX(100%); opacity:.7 } to { transform:translateX(0); opacity:1 } }
        @keyframes slide-out { from { transform:translateX(0); opacity:1 } to { transform:translateX(100%); opacity:0 } }
        @keyframes ctm-spin  { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        .ctm-inp:focus { border-color:#1B4F8A !important; box-shadow:0 0 0 2px rgba(27,79,138,0.08); }
      `}</style>

      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.32)", zIndex: 6999, backdropFilter: "blur(2px)" }} />

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 7000,
        width: "min(500px,100vw)", background: "#fff",
        boxShadow: "-4px 0 28px rgba(0,0,0,0.13)",
        display: "flex", flexDirection: "column",
        fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif",
        animation: `${visible ? "slide-in" : "slide-out"} 0.25s cubic-bezier(0.32,0.72,0,1) both`,
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{panelTitle}</div>
            {parentTask && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Under: <strong style={{ color: "#374151" }}>{parentTask.title}</strong></div>}
          </div>
          <button onClick={handleClose} style={{ width: 28, height: 28, border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Step indicator (single mode) */}
        {!isMultiMode && (
          <div style={{ display: "flex", alignItems: "center", padding: "9px 20px", borderBottom: "1px solid #F3F4F6", gap: 8, flexShrink: 0, background: "#FAFAFA" }}>
            {[{ n: 1, label: "Task Details" }, { n: 2, label: "Assign & Create" }].map((s2, i) => (
              <React.Fragment key={s2.n}>
                {i > 0 && <div style={{ flex: 1, height: 1, background: step > 1 ? "#1B4F8A" : "#E5E7EB", maxWidth: 36 }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 19, height: 19, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, background: step > s2.n ? "#16A34A" : step === s2.n ? "#1B4F8A" : "#F3F4F6", color: step >= s2.n ? "#fff" : "#9CA3AF" }}>
                    {step > s2.n ? "✓" : s2.n}
                  </div>
                  <span style={{ fontSize: 11, color: step === s2.n ? "#1B4F8A" : "#6B7280", fontWeight: step === s2.n ? 600 : 400 }}>{s2.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {needsApproval && (
            <div style={{ padding: "8px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 12, color: "#1E40AF" }}>
              This task is assigned to a Team Lead and will require <strong>TL approval</strong> before it proceeds.
            </div>
          )}
          {error && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: "#991B1B" }}>{error}</div>}

          {isMultiMode && renderMultiMode()}

          {!isMultiMode && (
            <>
              {step === 1 && (
                <>
                  {!parentTask && !initialIsGoal && !isGoalUrl && (
                    <div>
                      <label style={lbl}>Task Type</label>
                      <select className="ctm-inp" value={taskType} onChange={e => { setTaskType(e.target.value); setError(""); setStep(1); }} style={{ ...inp, cursor: "pointer" }}>
                        {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <div style={{ marginTop: 5, padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, color: "#6B7280", lineHeight: 1.55 }}>
                        {selectedTypeInfo?.desc}
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={lbl}>Title *</label>
                    <input className="ctm-inp" style={inp} value={form.title} onChange={e => set("title", e.target.value)} placeholder={copy.titlePlaceholder} autoFocus />
                  </div>

                  <div>
                    <label style={lbl}>Description</label>
                    <textarea className="ctm-inp" style={{ ...inp, height: 60, resize: "vertical" }} value={form.description} onChange={e => set("description", e.target.value)} placeholder={copy.descPlaceholder} />
                  </div>

                  {!isFolder && copy.notesLabel && (
                    <div>
                      <label style={lbl}>{copy.notesLabel}</label>
                      {(form.requirements || []).length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                          {(form.requirements || []).map((req, ri) => (
                            <div key={ri} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 9px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 5 }}>
                              <span style={{ color: "#1B4F8A", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>•</span>
                              <span style={{ flex: 1, fontSize: 12, color: "#111827", lineHeight: 1.5 }}>{req}</span>
                              <button onClick={() => set("requirements", (form.requirements || []).filter((_, i) => i !== ri))}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          className="ctm-inp"
                          style={{ ...inp, flex: 1 }}
                          value={reqInput}
                          onChange={e => setReqInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && reqInput.trim()) {
                              e.preventDefault();
                              set("requirements", [...(form.requirements || []), reqInput.trim()]);
                              setReqInput("");
                            }
                          }}
                          placeholder="Type a requirement and press Enter"
                        />
                        <button
                          onClick={() => {
                            if (!reqInput.trim()) return;
                            set("requirements", [...(form.requirements || []), reqInput.trim()]);
                            setReqInput("");
                          }}
                          style={{ padding: "0 12px", border: "1px solid #1B4F8A", borderRadius: 5, background: "#EBF2FA", color: "#1B4F8A", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                          + Add
                        </button>
                      </div>
                    </div>
                  )}

                  {!isFolder && !isRepeat && !isThirdParty && !isGoal && (
                    <>
                      <TimeTrackingSection hasTimer={form.hasTimer} deadline={form.deadline} deadlineTime={form.deadlineTime} onSet={set} timerDurationVal={form.timerDurationVal} timerDurationUnit={form.timerDurationUnit} />
                      {/* ── ETC auto-calculated (C1 scoring) ── */}
                      {autoEtcHours > 0 && (
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6 }}>
                          <span style={{ fontSize: 10, color: "#15803D", fontWeight: 700 }}>⏱ ETC</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>
                            {autoEtcHours >= 1 ? `${autoEtcHours}h` : `${Math.round(autoEtcHours * 60)} min`}
                          </span>
                          <span style={{ fontSize: 10, color: "#6B7280" }}>working hours until deadline · used for C1 scoring</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Repeat config */}
                  {isRepeat && (
                    <div style={sectionBox("#BFDBFE")}>
                      <div style={sectionTitle("#1D4ED8")}>Recurrence Schedule</div>
                      <div>
                        <label style={lbl}>Frequency</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[{ v: "daily", l: "Daily" }, { v: "weekly", l: "Weekly" }, { v: "custom", l: "Custom" }].map(f => (
                            <button key={f.v} type="button" onClick={() => setRC("frequency", f.v)}
                              style={{ flex: 1, padding: "7px", borderRadius: 5, border: `1px solid ${repeatConfig.frequency === f.v ? "#1B4F8A" : "#E5E7EB"}`, background: repeatConfig.frequency === f.v ? "#EBF2FA" : "#fff", color: repeatConfig.frequency === f.v ? "#1B4F8A" : "#374151", fontSize: 11, fontWeight: repeatConfig.frequency === f.v ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                              {f.l}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(repeatConfig.frequency === "weekly" || repeatConfig.frequency === "custom") && (
                        <div>
                          <label style={lbl}>Active Days</label>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => {
                              const on = repeatConfig.activeDays.includes(d);
                              return (
                                <button key={d} type="button" onClick={() => toggleDay(d)}
                                  style={{ padding: "4px 9px", borderRadius: 4, border: `1px solid ${on ? "#1B4F8A" : "#E5E7EB"}`, background: on ? "#EBF2FA" : "#fff", color: on ? "#1B4F8A" : "#374151", fontSize: 11, fontWeight: on ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div>
                        <label style={lbl}>How many times per day? *</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input className="ctm-inp" style={{ ...inp, width: 65 }} type="number" min="1" max="10" value={repeatConfig.timesPerDay} onChange={e => setTimesPerDay(e.target.value)} />
                          <span style={{ fontSize: 11, color: "#6B7280" }}>occurrence{repeatConfig.timesPerDay > 1 ? "s" : ""} per day</span>
                        </div>
                      </div>
                      <div>
                        <label style={lbl}>Deadline time{repeatConfig.timesPerDay > 1 ? "s" : ""} *</label>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {repeatConfig.deadlineTimes.map((t, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "#6B7280", minWidth: 60 }}>Slot {i + 1}</span>
                              <input className="ctm-inp" style={{ ...inp, flex: 1 }} type="time" value={t} onChange={e => setDeadlineTime(i, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={lbl}>Start Date *</label>
                          <input className="ctm-inp" style={inp} type="date" value={repeatConfig.startDate} onChange={e => setRC("startDate", e.target.value)} />
                        </div>
                        <div>
                          <label style={lbl}>End Date (optional)</label>
                          <input className="ctm-inp" style={inp} type="date" value={repeatConfig.endDate} onChange={e => setRC("endDate", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label style={lbl}>If the deadline is missed</label>
                        <select className="ctm-inp" style={{ ...inp, cursor: "pointer" }} value={repeatConfig.missedAction} onChange={e => setRC("missedAction", e.target.value)}>
                          <option value="lock">Mark as Missed — lock the submission for that slot</option>
                          <option value="late">Allow late submission — accept after deadline with a late flag</option>
                        </select>
                      </div>

                    </div>
                  )}

                  {/* Third-party config */}
                  {isThirdParty && (
                    <div style={sectionBox("#DDD6FE")}>
                      <div style={sectionTitle("#6D28D9")}>Vendor Information</div>
                      <div>
                        <label style={lbl}>Vendor / Supplier Name</label>
                        <input className="ctm-inp" style={inp} type="text" placeholder="e.g. TechNova Solutions" value={thirdPartyConfig.vendorName} onChange={e => setTPC("vendorName", e.target.value)} />
                      </div>
                      <div>
                        <label style={lbl}>Dependency Category</label>
                        <select className="ctm-inp" style={{ ...inp, cursor: "pointer" }} value={thirdPartyConfig.vendorCategory} onChange={e => setTPC("vendorCategory", e.target.value)}>
                          <option value="Machine">Machine / Equipment</option>
                          <option value="Material">Raw Material / Consumable</option>
                          <option value="Service">Service / Labour</option>
                          <option value="Software">Software / Licence</option>
                          <option value="Logistics">Logistics / Shipping</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#374151" }}>
                        <input type="checkbox" checked={thirdPartyConfig.hasVendorContact} onChange={e => setTPC("hasVendorContact", e.target.checked)} style={{ width: 13, height: 13, accentColor: "#6D28D9", cursor: "pointer" }} />
                        Add vendor contact details
                      </label>
                      {thirdPartyConfig.hasVendorContact && (
                        <input className="ctm-inp" style={inp} type="text" placeholder="Phone or email" value={thirdPartyConfig.vendorContact} onChange={e => setTPC("vendorContact", e.target.value)} />
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={lbl}>Expected Resolution Date</label>
                          <input className="ctm-inp" style={inp} type="date" value={thirdPartyConfig.estimatedDate} onChange={e => setTPC("estimatedDate", e.target.value)} />
                        </div>
                        <div>
                          <label style={lbl}>Follow-up Interval</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input className="ctm-inp" style={{ ...inp, width: 65 }} type="number" min="1" max="30" value={thirdPartyConfig.updateIntervalDays} onChange={e => setTPC("updateIntervalDays", Number(e.target.value))} />
                            <span style={{ fontSize: 11, color: "#6B7280" }}>day{thirdPartyConfig.updateIntervalDays > 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Goal config — milestones removed */}
                  {isGoal && (
                    <div style={sectionBox("#E9D5FF")}>
                      <div style={sectionTitle("#7E22CE")}>Goal Configuration</div>
                      <div style={{ padding: "7px 10px", background: "rgba(255,255,255,0.7)", border: "1px solid #EDE9FE", borderRadius: 5, fontSize: 11, color: "#7E22CE", lineHeight: 1.5 }}>
                        Define the goal parameters. After creation, break it into components in the Goal Roadmap.
                      </div>
                      <div>
                        <label style={lbl}>Goal Statement</label>
                        <textarea className="ctm-inp" style={{ ...inp, height: 56, resize: "vertical" }}
                          placeholder="e.g. Achieve ₹5 crore in net sales by end of Q2 2025."
                          value={goalConfig.goalDescription} onChange={e => setGC("goalDescription", e.target.value)} />
                      </div>
                      <div>
                        <label style={lbl}>Hard Deadline *</label>
                        <input className="ctm-inp" style={inp} type="date" value={goalConfig.deadline} onChange={e => setGC("deadline", e.target.value)} />
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>This sets the deadline for the final goal node in the roadmap.</div>
                      </div>

                      {/* ── C2 Band (Gold Task) section ──────────────────────── */}
                      <div style={{
                        marginTop: 12,
                        border: isGoldTask ? "1px solid #FCD34D" : "1px dashed #E5E7EB",
                        borderRadius: 7,
                        overflow: "hidden",
                        transition: "border-color 0.15s",
                      }}>
                        {/* Toggle header */}
                        <div
                          onClick={() => { setIsGoldTask(p => !p); setC2WeightPct(""); setC2WeightError(""); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 12px", cursor: "pointer",
                            background: isGoldTask
                              ? "linear-gradient(135deg, #D97706, #B45309)"
                              : "#F9FAFB",
                          }}
                        >
                          {/* Custom toggle pill */}
                          <div style={{
                            width: 32, height: 18, borderRadius: 9, flexShrink: 0,
                            background: isGoldTask ? "#FFF" : "#D1D5DB",
                            position: "relative", transition: "background 0.2s",
                          }}>
                            <div style={{
                              position: "absolute", top: 2, left: isGoldTask ? 16 : 2,
                              width: 14, height: 14, borderRadius: "50%",
                              background: isGoldTask ? "#B45309" : "#fff",
                              transition: "left 0.2s",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                            }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: isGoldTask ? "#fff" : "#374151" }}>
                              🥇 Mark as C2 Band Gold Task
                            </div>
                            <div style={{ fontSize: 10, color: isGoldTask ? "rgba(255,255,255,0.8)" : "#9CA3AF", marginTop: 1 }}>
                              Points are earned based on global weightage pool
                            </div>
                          </div>
                          {c2GlobalMaxPts <= 0 && isGoldTask && (
                            <div style={{ marginLeft: "auto", fontSize: 10, color: "#FEF3C7", background: "rgba(0,0,0,0.15)", padding: "2px 8px", borderRadius: 4 }}>
                              Configure in SOP Settings first
                            </div>
                          )}
                        </div>

                        {/* Expanded C2 config — only when toggled on */}
                        {isGoldTask && (
                          <div style={{ padding: "12px 12px 14px", background: "#FFFBEB", display: "flex", flexDirection: "column", gap: 10 }}>

                            {/* Pool status bar */}
                            <div style={{
                              padding: "8px 10px",
                              background: "#FEF3C7",
                              border: "1px solid #FCD34D",
                              borderRadius: 6,
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                            }}>
                              <div style={{ fontSize: 11, color: "#92400E" }}>
                                <strong>Global Max: {c2GlobalMaxPts} pts</strong>
                                {" · "}Pool remaining: <strong>{c2Remaining}%</strong>
                              </div>
                              {c2Remaining <= 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", padding: "2px 7px", borderRadius: 4 }}>
                                  POOL FULL
                                </span>
                              )}
                            </div>

                            {/* Weightage % input */}
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                                Task Weightage (%)
                              </div>
                              <input
                                type="number"
                                min="1"
                                max={c2Remaining > 0 ? c2Remaining : 100}
                                step="1"
                                value={c2WeightPct}
                                onChange={e => setC2WeightPct(e.target.value)}
                                placeholder={`e.g. 60  (max: ${c2Remaining}%)`}
                                style={{
                                  display: "block", width: "100%",
                                  padding: "8px 10px",
                                  border: `1px solid ${c2WeightError ? "#FECACA" : "#E5E7EB"}`,
                                  borderRadius: 6,
                                  fontSize: 13, fontFamily: "inherit",
                                  color: "#111827", background: "#fff",
                                  outline: "none", boxSizing: "border-box",
                                }}
                                onFocus={e => e.target.style.borderColor = "#D97706"}
                                onBlur={e => e.target.style.borderColor = c2WeightError ? "#FECACA" : "#E5E7EB"}
                              />
                              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                                The % of the global C2 pool this task owns.
                                Total active weightages must equal 100%.
                              </div>
                            </div>

                            {/* Live calculation preview */}
                            {c2TaskMaxPts > 0 && c2GlobalMaxPts > 0 && (
                              <div style={{
                                padding: "9px 12px",
                                background: "#D97706",
                                borderRadius: 6,
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                              }}>
                                <div style={{ fontSize: 12, color: "#fff" }}>
                                  Task Max Points =
                                  <span style={{ fontFamily: "monospace", marginLeft: 6, marginRight: 6 }}>
                                    ({c2WeightPct}% × {c2GlobalMaxPts}) / 100
                                  </span>
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                                  = {c2TaskMaxPts} pts
                                </div>
                              </div>
                            )}

                            {/* Hard block error */}
                            {c2WeightError && (
                              <div style={{
                                padding: "8px 10px",
                                background: "#FEF2F2", border: "1px solid #FECACA",
                                borderRadius: 6, fontSize: 11, color: "#B91C1C",
                              }}>
                                🚫 {c2WeightError}
                              </div>
                            )}

                            {c2Validating && (
                              <div style={{ fontSize: 11, color: "#B45309", display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 10, height: 10, border: "2px solid #B45309", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                Validating C2 pool…
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* ── end C2 Band section ──────────────────────────────── */}

                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  {!isFolder && (
                    <>
                      {allDepts.length > 0 && (
                        <div style={{ padding: "8px 10px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                            Filter by department
                            {selectedDepts.length > 0 && <button type="button" onClick={() => setSelectedDepts([])} style={{ fontSize: 11, color: "#1B4F8A", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Clear filter</button>}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {allDepts.map(dept => {
                              const active = selectedDepts.includes(dept);
                              const cnt = employees.filter(e => e.department === dept).length;
                              return (
                                <button key={dept} type="button" onClick={() => toggleDept(dept)}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", border: `1px solid ${active ? "#1B4F8A" : "#E5E7EB"}`, borderRadius: 4, background: active ? "#EBF2FA" : "#fff", color: active ? "#1B4F8A" : "#374151", fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                                  {dept} <span style={{ fontSize: 9, background: active ? "rgba(27,79,138,0.15)" : "#F3F4F6", color: active ? "#1B4F8A" : "#6B7280", borderRadius: 99, padding: "0 4px" }}>{cnt}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <AssigneePicker selectedIds={selectedIds} onToggle={toggle} />
                    </>
                  )}
                  {!isFolder && (
                    <AttachmentSection atts={attachments} onImagePick={handleImagePick} onPdfPick={handlePdfPick} onRemove={removeAttachment} uploading={uploadingFiles} imgRef={imageInputRef} pdfRef={pdfInputRef} />
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "13px 20px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", flexShrink: 0 }}>

          {/* Edit mode footer */}
          {isEditMode && (
            <>
              <button type="button" onClick={handleClose} style={{ padding: "8px 16px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>

              <button type="button" onClick={() => handleSubmit(false)} disabled={submitting} style={{ padding: "8px 20px", background: "#1B4F8A", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {submitting ? "Submitting…" : "Submit to Assignee"}
              </button>
            </>
          )}

          {!isEditMode && isMultiMode && (
            <>
              {rowStep === 2
                ? <button type="button" onClick={() => { setRowStep(1); setError(""); }} style={{ padding: "8px 16px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                : <button type="button" onClick={handleClose} style={{ padding: "8px 16px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              }
              {rowStep === 1
                ? <button type="button" onClick={() => { if (!activeRow.title.trim()) { setError("Title is required."); return; } setError(""); setRowStep(2); }} style={{ padding: "8px 20px", background: "#1B4F8A", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Next →</button>
                : <button type="button" onClick={handleSubmit} disabled={submitting || rowUploading.some(Boolean)} style={{ padding: "8px 20px", background: submitting ? "#9CA3AF" : "#1B4F8A", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: submitting || rowUploading.some(Boolean) ? 0.7 : 1 }}>
                  {submitting ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "ctm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Creating…</> : `Create ${totalValidRows || 1} Subtask${(totalValidRows || 1) !== 1 ? "s" : ""}`}
                </button>
              }
            </>
          )}
          {!isEditMode && !isMultiMode && (
            <>
              {step === 2
                ? <button type="button" onClick={() => setStep(1)} style={{ padding: "8px 16px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                : <button type="button" onClick={handleClose} style={{ padding: "8px 16px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              }
              {step === 1
                ? <button type="button" onClick={() => { if (canAdvance()) setStep(2); }} style={{ padding: "8px 20px", background: "#1B4F8A", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Next →</button>
                : <button type="button" onClick={handleSubmit} disabled={submitting || uploadingFiles} style={{ padding: "8px 20px", background: submitting ? "#9CA3AF" : "#1B4F8A", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: submitting || uploadingFiles ? 0.7 : 1 }}>
                  {submitting
                    ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "ctm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Creating…</>
                    : isRepeat ? "Create Repeat Task" : isGoal ? "Create Goal Task" : isThirdParty ? "Create Third-party Task" : isFolder ? "Create Folder" : parentTask ? "Create Subtask" : "Create Task"
                  }
                </button>
              }
            </>
          )}
        </div>
      </div>
    </SliderPortal>
  );
}