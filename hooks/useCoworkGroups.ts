"use client";
import { useState, useEffect, useCallback } from "react";
import { listGroups } from "../lib/coworkApi";
export function useCoworkGroups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { try { setLoading(true); const d = await listGroups(); setGroups(d.groups || []); } catch (_) { } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  return { groups, loading, refetch: fetch };
}
