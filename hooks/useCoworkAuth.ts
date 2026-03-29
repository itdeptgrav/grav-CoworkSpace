"use client";
import { useState, useEffect } from "react";
import { onCoworkAuthChange } from "../lib/coworkAuth";
import { getMe } from "../lib/coworkApi";

export function useCoworkAuth() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(true);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onCoworkAuthChange(async (u: any) => {
      if (u) {
        setUser(u);
        const t = await u.getIdTokenResult(true);
        setRole(t.claims.role as string || "");
        try {
          const me = await getMe();
          setEmployeeId(me.employeeId);
          setEmployeeName(me.name || u.displayName || u.email?.split("@")[0] || "User");
          setPasswordChanged(me.passwordChanged ?? true);
          setTempPassword(me.tempPassword || null);
        } catch (_) {
          setEmployeeName(u.displayName || u.email?.split("@")[0] || "User");
        }
      } else {
        setUser(null); setRole(""); setEmployeeId(""); setEmployeeName("");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, role, employeeId, employeeName, passwordChanged, tempPassword, loading };
}
