"use client";
import { useState, useEffect, useCallback } from "react";
import { listTasks } from "../lib/coworkApi";
export function useCoworkTasks() {
  const [tasks,   setTasks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { try { setLoading(true); const d=await listTasks(); setTasks(d.tasks||[]); } catch(_){} finally{setLoading(false);} }, []);
  useEffect(() => { fetch(); }, [fetch]);
  return { tasks, loading, refetch: fetch };
}
