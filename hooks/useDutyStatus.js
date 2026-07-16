"use client";
import { useEffect, useState } from "react";

export function useDutyStatus(employeeId) {
  const [isOnline, setIsOnline] = useState(null); // null = loading
  

  useEffect(() => {
    if (!employeeId) return;
    let unsub = () => {};
    (async () => {
      const { firebaseDb } = await import("../lib/coworkFirebase");
      const { doc, onSnapshot } = await import("firebase/firestore");
      unsub = onSnapshot(
        doc(firebaseDb, "cowork_duty_status", employeeId),
        (snap) => setIsOnline(snap.exists() ? !!snap.data().isOnline : false),
        (e) => console.error("[useDutyStatus] snapshot:", e.message)
      );
    })();
    return () => unsub();
  }, [employeeId]);

  return isOnline;
}