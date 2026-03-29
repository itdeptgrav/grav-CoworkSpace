// GRAV-CMS/hooks/useSimpleMessages.js
"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { sendGroupMessage, sendDirectMessage, getGroupMessages, getDirectMessages } from '../lib/coworkApi';
import { getCoworkSocket } from '../lib/coworkSocket';

export function useSimpleGroupMessages(groupId, currentUserId) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const socketRef = useRef(null);

    // Load initial messages
    useEffect(() => {
        if (!groupId) return;

        const loadMessages = async () => {
            try {
                setLoading(true);
                const data = await getGroupMessages(groupId, 100);
                setMessages(data.messages || []);
            } catch (error) {
                console.error('Failed to load messages:', error);
            } finally {
                setLoading(false);
            }
        };

        loadMessages();
    }, [groupId]);

    // Setup socket for real-time messages
    useEffect(() => {
        if (!groupId || !currentUserId) return;

        const socket = getCoworkSocket(currentUserId);
        socketRef.current = socket;

        // Join group room
        socket.emit('join_group', groupId);

        // Listen for new messages
        const handleNewMessage = (data) => {
            if (data.groupId === groupId) {
                setMessages(prev => [...prev, data.message]);
            }
        };

        socket.on('new_group_message', handleNewMessage);

        return () => {
            socket.off('new_group_message', handleNewMessage);
            socket.emit('leave_group', groupId);
        };
    }, [groupId, currentUserId]);

    // Send message - THIS IS THE KEY PART - shows immediately
    const sendMessage = useCallback(async (text) => {
        if (!text.trim()) return;

        // Create temporary message (shows immediately)
        const tempMessage = {
            messageId: `temp_${Date.now()}`,
            text: text,
            senderId: currentUserId,
            senderName: 'You',
            createdAt: new Date().toISOString(),
            temp: true
        };

        // Add to UI immediately
        setMessages(prev => [...prev, tempMessage]);

        try {
            // Send to server
            await sendGroupMessage(groupId, { text });

            // Mark temp message as sent (optional)
            setMessages(prev =>
                prev.map(msg =>
                    msg.messageId === tempMessage.messageId
                        ? { ...msg, temp: false, sent: true }
                        : msg
                )
            );

        } catch (error) {
            console.error('Failed to send message:', error);

            // Mark as failed
            setMessages(prev =>
                prev.map(msg =>
                    msg.messageId === tempMessage.messageId
                        ? { ...msg, error: true }
                        : msg
                )
            );

            // Remove failed message after 3 seconds
            setTimeout(() => {
                setMessages(prev =>
                    prev.filter(msg => msg.messageId !== tempMessage.messageId)
                );
            }, 3000);
        }
    }, [groupId, currentUserId]);

    return { messages, loading, sendMessage };
}

export function useSimpleDirectMessages(conversationId, currentUserId, otherUserId) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const socketRef = useRef(null);

    // Load initial messages
    useEffect(() => {
        if (!conversationId) return;

        const loadMessages = async () => {
            try {
                setLoading(true);
                const data = await getDirectMessages(conversationId, 100);
                setMessages(data.messages || []);
            } catch (error) {
                console.error('Failed to load messages:', error);
            } finally {
                setLoading(false);
            }
        };

        loadMessages();
    }, [conversationId]);

    // Setup socket for real-time messages
    useEffect(() => {
        if (!conversationId || !currentUserId) return;

        const socket = getCoworkSocket(currentUserId);
        socketRef.current = socket;

        // Join DM room
        socket.emit('join_dm', conversationId);

        // Listen for new messages
        const handleNewMessage = (data) => {
            if (data.conversationId === conversationId) {
                setMessages(prev => [...prev, data.message]);
            }
        };

        socket.on('new_direct_message', handleNewMessage);

        return () => {
            socket.off('new_direct_message', handleNewMessage);
            socket.emit('leave_dm', conversationId);
        };
    }, [conversationId, currentUserId]);

    // Send message - THIS IS THE KEY PART - shows immediately
    const sendMessage = useCallback(async (text) => {
        if (!text.trim()) return;

        // Create temporary message (shows immediately)
        const tempMessage = {
            messageId: `temp_${Date.now()}`,
            text: text,
            senderId: currentUserId,
            senderName: 'You',
            createdAt: new Date().toISOString(),
            temp: true
        };

        // Add to UI immediately
        setMessages(prev => [...prev, tempMessage]);

        try {
            // Send to server
            await sendDirectMessage({
                toEmployeeId: otherUserId,
                text: text,
                conversationId
            });

            // Mark temp message as sent
            setMessages(prev =>
                prev.map(msg =>
                    msg.messageId === tempMessage.messageId
                        ? { ...msg, temp: false, sent: true }
                        : msg
                )
            );

        } catch (error) {
            console.error('Failed to send message:', error);

            // Mark as failed
            setMessages(prev =>
                prev.map(msg =>
                    msg.messageId === tempMessage.messageId
                        ? { ...msg, error: true }
                        : msg
                )
            );

            // Remove failed message after 3 seconds
            setTimeout(() => {
                setMessages(prev =>
                    prev.filter(msg => msg.messageId !== tempMessage.messageId)
                );
            }, 3000);
        }
    }, [conversationId, currentUserId, otherUserId]);

    return { messages, loading, sendMessage };
}