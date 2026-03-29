"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getGroupMessages, getDirectMessages } from "../lib/coworkApi";
import { getCoworkSocket } from "../lib/coworkSocket";

export function useCoworkMessages(threadType: "group" | "direct", threadId: string, employeeId: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);

  const loadMessages = useCallback(async () => {
    if (!threadId) return;
    try {
      const d = threadType === "group" ? await getGroupMessages(threadId) : await getDirectMessages(threadId);
      setMessages(d.messages || []);
      loaded.current = true;
    } catch (_) { }
    finally { setLoading(false); }
  }, [threadType, threadId]);

  useEffect(() => {
    loaded.current = false;
    setMessages([]);
    loadMessages();
  }, [loadMessages]);

  // ⚡ Socket.io real-time
  useEffect(() => {
    if (!employeeId || !threadId) return;
    const socket = getCoworkSocket(employeeId);

    const handleGroupMsg = (data: any) => {
      if (data.groupId === threadId) {
        setMessages(prev => {
          if (prev.some(m => m.messageId === data.message.messageId)) return prev;
          return [...prev, data.message];
        });
      }
    };
    const handleDirectMsg = (data: any) => {
      if (data.conversationId === threadId) {
        setMessages(prev => {
          if (prev.some(m => m.messageId === data.message.messageId)) return prev;
          return [...prev, data.message];
        });
      }
    };

    socket.on("new_group_message", handleGroupMsg);
    socket.on("new_direct_message", handleDirectMsg);
    return () => { socket.off("new_group_message", handleGroupMsg); socket.off("new_direct_message", handleDirectMsg); };
  }, [threadId, employeeId]);

  const addOptimistic = (msg: any) => setMessages(prev => [...prev, msg]);

  return { messages, loading, addOptimistic, reload: loadMessages };
}
