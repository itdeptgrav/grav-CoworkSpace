/**
 * GRAV-CMS/hooks/useCoworkNotifications.ts
 *
 * UPGRADED: Now uses Firestore onSnapshot for REAL-TIME notifications.
 * Every notification written to cowork_notifications/{id} for this employee
 * appears instantly — task assigned, chat, daily report, completion, forward,
 * deadline change, group message, DM, meeting — everything.
 *
 * Fields from Firestore:
 *   recipientEmployeeId, type, title, body, data, read, createdAt
 */
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, writeBatch, getDocs, doc, DocumentData,
  QuerySnapshot, Unsubscribe,
} from "firebase/firestore";
import { firebaseDb, firebaseAuth } from "../lib/coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Notification type definition
export interface CoworkNotification {
  id: string;
  recipientEmployeeId: string;
  type: string;
  title: string;
  body: string;
  data?: any;
  read: boolean;
  createdAt: string;
}

interface UseCoworkNotificationsReturn {
  notifications: CoworkNotification[];
  unread: number;
  markRead: () => Promise<void>;
}

export function useCoworkNotifications(employeeId: string | null): UseCoworkNotificationsReturn {
  const [notifications, setNotifications] = useState<CoworkNotification[]>([]);
  const [unread, setUnread] = useState<number>(0);
  const unsubRef = useRef<Unsubscribe | null>(null);

  // ── Real-time listener on cowork_notifications ────────────
  useEffect(() => {
    if (!employeeId) return;

    const q = query(
      collection(firebaseDb, "cowork_notifications"),
      where("recipientEmployeeId", "==", employeeId),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(q,
      (snap: QuerySnapshot<DocumentData>) => {
        const notifs: CoworkNotification[] = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            recipientEmployeeId: data.recipientEmployeeId,
            type: data.type,
            title: data.title,
            body: data.body,
            data: data.data,
            read: data.read || false,
            // normalise Firestore Timestamp → ISO string
            createdAt: data.createdAt?.seconds
              ? new Date(data.createdAt.seconds * 1000).toISOString()
              : data.createdAt || new Date().toISOString(),
          };
        });
        setNotifications(notifs);
        setUnread(notifs.filter(n => !n.read).length);
      },
      (err: Error) => {
        // Firestore index not ready or rules issue — fall back to REST
        console.warn("Notifications onSnapshot failed, falling back:", err.message);
        _loadFromREST(employeeId, setNotifications, setUnread);
      }
    );

    unsubRef.current = unsub;
    return () => {
      if (unsubRef.current) {
        unsubRef.current();
      }
    };
  }, [employeeId]);

  // ── Mark all read (updates Firestore + REST fallback) ─────
  const markRead = useCallback(async () => {
    if (!employeeId) return;
    try {
      // Optimistic UI first
      setUnread(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));

      // Write to Firestore directly
      const q = query(
        collection(firebaseDb, "cowork_notifications"),
        where("recipientEmployeeId", "==", employeeId),
        where("read", "==", false)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(firebaseDb);
        snap.docs.forEach(d => batch.update(d.ref, { read: true }));
        await batch.commit();
      }
    } catch (e) {
      // Fallback to REST
      try {
        const u = firebaseAuth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        await fetch(`${BASE}/cowork/notifications/read-all`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error("Failed to mark notifications as read:", err);
      }
    }
  }, [employeeId]);

  return { notifications, unread, markRead };
}

// ── REST fallback (used if Firestore index missing) ───────────
async function _loadFromREST(
  employeeId: string,
  setNotifications: React.Dispatch<React.SetStateAction<CoworkNotification[]>>,
  setUnread: React.Dispatch<React.SetStateAction<number>>
): Promise<void> {
  try {
    const u = firebaseAuth.currentUser;
    if (!u) return;
    const token = await u.getIdToken();
    const res = await fetch(`${BASE}/cowork/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const notifs: CoworkNotification[] = data.notifications || [];
    setNotifications(notifs);
    setUnread(notifs.filter(n => !n.read).length);
  } catch (err) {
    console.error("Failed to load notifications from REST:", err);
  }
}