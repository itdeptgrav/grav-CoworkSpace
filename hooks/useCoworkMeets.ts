"use client";
import { useState, useEffect, useCallback } from "react";
import { listMeets } from "../lib/coworkApi";
export function useCoworkMeets() {
  const [meets,   setMeets]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { try { setLoading(true); const d=await listMeets(); setMeets(d.meets||[]); } catch(_){} finally{setLoading(false);} }, []);
  useEffect(() => { fetch(); }, [fetch]);
  return { meets, loading, refetch: fetch };
}
