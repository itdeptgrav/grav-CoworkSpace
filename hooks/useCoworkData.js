"use client";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    listGroups,
    listTasks,
    listMeets,
    listConversations,
    getGroupMessages,
    getDirectMessages,
    getNotifications,
    sendGroupMessage,
    sendDirectMessage
} from '../lib/coworkApi';
import { useCoworkSocket } from './useCoworkSocket';
import { useEffect, useState, useCallback, useRef } from 'react';

// Cache for optimistic updates
const messageCache = new Map();

// Groups hook with real-time updates
export function useGroups(employeeId) {
    const queryClient = useQueryClient();

    const { data: groups = [], isLoading } = useQuery({
        queryKey: ['groups'],
        queryFn: async () => {
            const data = await listGroups();
            return data.groups || [];
        },
        staleTime: 30 * 1000,
    });

    useCoworkSocket(employeeId, {
        onNewMessage: (data) => {
            if (data.groupId) {
                queryClient.invalidateQueries(['group-messages', data.groupId]);
                queryClient.invalidateQueries(['groups']);
            }
        }
    });

    return { groups, loading: isLoading };
}

// Tasks hook with real-time updates
export function useTasks(employeeId) {
    const queryClient = useQueryClient();

    const { data: tasks = [], isLoading } = useQuery({
        queryKey: ['tasks'],
        queryFn: async () => {
            const data = await listTasks();
            return data.tasks || [];
        },
        staleTime: 30 * 1000,
    });

    useCoworkSocket(employeeId, {
        onNewTask: (data) => {
            queryClient.invalidateQueries(['tasks']);
        },
        onTaskUpdate: (data) => {
            queryClient.invalidateQueries(['tasks']);
        }
    });

    return { tasks, loading: isLoading };
}

// Meetings hook with real-time updates
export function useMeetings(employeeId) {
    const queryClient = useQueryClient();

    const { data: meets = [], isLoading } = useQuery({
        queryKey: ['meets'],
        queryFn: async () => {
            const data = await listMeets();
            return data.meets || [];
        },
        staleTime: 30 * 1000,
    });

    useCoworkSocket(employeeId, {
        onNewMeeting: () => {
            queryClient.invalidateQueries(['meets']);
        }
    });

    return { meets, loading: isLoading };
}

// Conversations hook with real-time updates
export function useConversations(employeeId) {
    const queryClient = useQueryClient();

    const { data: conversations = [], isLoading } = useQuery({
        queryKey: ['conversations'],
        queryFn: async () => {
            const data = await listConversations();
            return data.conversations || [];
        },
        staleTime: 30 * 1000,
    });

    useCoworkSocket(employeeId, {
        onNewMessage: (data) => {
            if (data.conversationId) {
                queryClient.invalidateQueries(['direct-messages', data.conversationId]);
                queryClient.invalidateQueries(['conversations']);
            }
        }
    });

    return { conversations, loading: isLoading };
}

// Group messages hook with optimistic updates
// GRAV-CMS/hooks/useCoworkData.js
// Update the useGroupMessages function

export function useGroupMessages(groupId, employeeId) {
    const queryClient = useQueryClient();
    const [optimisticMessages, setOptimisticMessages] = useState([]);
    const messageCounter = useRef(0);

    const { data: serverMessages = [], isLoading } = useQuery({
        queryKey: ['group-messages', groupId],
        queryFn: async () => {
            if (!groupId) return [];
            const data = await getGroupMessages(groupId, 100);
            return data.messages || [];
        },
        enabled: !!groupId,
        staleTime: 5000,
    });

    const { joinGroup, leaveGroup } = useCoworkSocket(employeeId, {
        onNewMessage: (data) => {
            if (data.groupId === groupId) {
                // When receiving a new message from socket, invalidate to fetch from server
                queryClient.invalidateQueries(['group-messages', groupId]);

                // Also remove any matching optimistic message (if it was ours)
                setOptimisticMessages(prev =>
                    prev.filter(msg => msg.tempId !== data.message.messageId)
                );
            }
        }
    });

    // Join group room when component mounts
    useEffect(() => {
        if (groupId) {
            joinGroup(groupId);
            return () => leaveGroup(groupId);
        }
    }, [groupId, joinGroup, leaveGroup]);

    // Combine server messages with optimistic ones and sort by time
    const allMessages = [...serverMessages, ...optimisticMessages]
        .sort((a, b) => {
            const timeA = a.createdAt?.seconds
                ? a.createdAt.seconds * 1000
                : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.seconds
                ? b.createdAt.seconds * 1000
                : new Date(b.createdAt || 0).getTime();
            return timeA - timeB;
        });

    // Send message with optimistic update
    const sendMessage = useCallback(async (text) => {
        // Create a temporary ID for this message
        const tempId = `temp_${Date.now()}_${messageCounter.current++}`;

        // Create optimistic message object
        const optimisticMessage = {
            messageId: tempId,
            tempId: tempId, // Store temp ID separately for removal
            text,
            senderId: employeeId,
            senderName: 'You', // This will be replaced when server confirms
            createdAt: new Date().toISOString(),
            temp: true, // Flag to identify optimistic messages
            sending: true // Show sending state
        };

        // Add to optimistic messages immediately
        setOptimisticMessages(prev => [...prev, optimisticMessage]);

        try {
            // Send to server
            const result = await sendGroupMessage(groupId, { text });

            // Mark as sent (remove temp flag or update with real data)
            setOptimisticMessages(prev =>
                prev.map(msg =>
                    msg.tempId === tempId
                        ? { ...msg, sending: false, sent: true }
                        : msg
                )
            );

            // After a short delay, remove optimistic message (server will provide real one)
            setTimeout(() => {
                setOptimisticMessages(prev =>
                    prev.filter(msg => msg.tempId !== tempId)
                );
                queryClient.invalidateQueries(['group-messages', groupId]);
            }, 1000);

        } catch (error) {
            // Mark as failed
            setOptimisticMessages(prev =>
                prev.map(msg =>
                    msg.tempId === tempId
                        ? { ...msg, sending: false, error: true }
                        : msg
                )
            );

            // Remove failed message after showing error for 3 seconds
            setTimeout(() => {
                setOptimisticMessages(prev =>
                    prev.filter(msg => msg.tempId !== tempId)
                );
            }, 3000);

            throw error;
        }
    }, [groupId, employeeId, queryClient]);

    return {
        messages: allMessages,
        loading: isLoading,
        sendMessage,
        hasOptimistic: optimisticMessages.length > 0
    };
}

// Direct messages hook with optimistic updates
// GRAV-CMS/hooks/useCoworkData.js
// Update the useDirectMessages function

export function useDirectMessages(conversationId, employeeId) {
    const queryClient = useQueryClient();
    const [optimisticMessages, setOptimisticMessages] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const messageCounter = useRef(0);
    const typingTimeoutRef = useRef(null);

    const { data: serverMessages = [], isLoading } = useQuery({
        queryKey: ['direct-messages', conversationId],
        queryFn: async () => {
            if (!conversationId) return [];
            const data = await getDirectMessages(conversationId, 100);
            return data.messages || [];
        },
        enabled: !!conversationId,
        staleTime: 5000,
    });

    const { joinDM, leaveDM, emitTyping: socketEmitTyping } = useCoworkSocket(employeeId, {
        onNewMessage: (data) => {
            if (data.conversationId === conversationId) {
                // When receiving a new message, invalidate to fetch from server
                queryClient.invalidateQueries(['direct-messages', conversationId]);

                // Remove any matching optimistic message
                setOptimisticMessages(prev =>
                    prev.filter(msg => msg.tempId !== data.message.messageId)
                );
            }
        },
        onTyping: (data) => {
            if (data.conversationId === conversationId) {
                setIsTyping(data.isTyping);

                if (data.isTyping) {
                    if (typingTimeoutRef.current) {
                        clearTimeout(typingTimeoutRef.current);
                    }
                    typingTimeoutRef.current = setTimeout(() => {
                        setIsTyping(false);
                    }, 3000);
                }
            }
        }
    });

    // Join DM room when component mounts
    useEffect(() => {
        if (conversationId) {
            joinDM(conversationId);
            return () => {
                leaveDM(conversationId);
                if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                }
            };
        }
    }, [conversationId, joinDM, leaveDM]);

    // Combine server messages with optimistic ones
    const allMessages = [...serverMessages, ...optimisticMessages]
        .sort((a, b) => {
            const timeA = a.createdAt?.seconds
                ? a.createdAt.seconds * 1000
                : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.seconds
                ? b.createdAt.seconds * 1000
                : new Date(b.createdAt || 0).getTime();
            return timeA - timeB;
        });

    // Send message with optimistic update
    const sendMessage = useCallback(async (text) => {
        // Create a temporary ID
        const tempId = `temp_${Date.now()}_${messageCounter.current++}`;

        // Create optimistic message
        const optimisticMessage = {
            messageId: tempId,
            tempId: tempId,
            text,
            senderId: employeeId,
            senderName: 'You',
            createdAt: new Date().toISOString(),
            temp: true,
            sending: true
        };

        // Show immediately
        setOptimisticMessages(prev => [...prev, optimisticMessage]);

        try {
            const otherId = conversationId?.split("_").find(id => id !== employeeId);

            const result = await sendDirectMessage({
                toEmployeeId: otherId,
                text,
                conversationId
            });

            // Mark as sent
            setOptimisticMessages(prev =>
                prev.map(msg =>
                    msg.tempId === tempId
                        ? { ...msg, sending: false, sent: true }
                        : msg
                )
            );

            // Remove optimistic message after server confirms
            setTimeout(() => {
                setOptimisticMessages(prev =>
                    prev.filter(msg => msg.tempId !== tempId)
                );
                queryClient.invalidateQueries(['direct-messages', conversationId]);
            }, 1000);

        } catch (error) {
            // Mark as failed
            setOptimisticMessages(prev =>
                prev.map(msg =>
                    msg.tempId === tempId
                        ? { ...msg, sending: false, error: true }
                        : msg
                )
            );

            // Remove failed message after showing error
            setTimeout(() => {
                setOptimisticMessages(prev =>
                    prev.filter(msg => msg.tempId !== tempId)
                );
            }, 3000);

            throw error;
        }
    }, [conversationId, employeeId, queryClient]);

    // Emit typing indicator
    const emitTyping = useCallback((isTyping) => {
        if (socketEmitTyping && conversationId) {
            socketEmitTyping(conversationId, isTyping);
        }
    }, [socketEmitTyping, conversationId]);

    return {
        messages: allMessages,
        loading: isLoading,
        sendMessage,
        isTyping,
        emitTyping,
        hasOptimistic: optimisticMessages.length > 0
    };
}

// Notifications hook with real-time updates
export function useNotifications(employeeId) {
    const queryClient = useQueryClient();

    const { data: notifications = [], isLoading } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const data = await getNotifications();
            return data.notifications || [];
        },
        staleTime: 10 * 1000,
    });

    useCoworkSocket(employeeId, {
        onNotification: () => {
            queryClient.invalidateQueries(['notifications']);
        }
    });

    const unreadCount = notifications.filter(n => !n.read).length;

    return { notifications, unreadCount, loading: isLoading };
}