"use client";
import { useEffect, useRef, useCallback } from 'react';
import { getCoworkSocket } from '../lib/coworkSocket';
import { useQueryClient } from '@tanstack/react-query';

export function useCoworkSocket(employeeId, options = {}) {
    const {
        onNewMessage,
        onNewTask,
        onTaskUpdate,
        onNewMeeting,
        onNotification,
        onUserStatus,
        onTyping
    } = options;

    const socketRef = useRef(null);
    const queryClient = useQueryClient();
    const listenersAttached = useRef(false);

    // Initialize socket and set up event listeners
    useEffect(() => {
        if (!employeeId) return;

        const socket = getCoworkSocket(employeeId);
        socketRef.current = socket;

        // Only attach listeners once
        if (!listenersAttached.current) {
            console.log('🔌 Setting up socket listeners for employee:', employeeId);

            // Group messages
            socket.on('new_group_message', (data) => {
                console.log('📩 New group message received:', data);

                // Update cache immediately for all group members
                queryClient.setQueryData(['group-messages', data.groupId], (oldData = []) => {
                    return [...oldData, data.message];
                });

                queryClient.invalidateQueries(['groups']);

                if (onNewMessage) onNewMessage(data);
            });

            // Direct messages
            socket.on('new_direct_message', (data) => {
                console.log('💬 New direct message received:', data);

                queryClient.setQueryData(['direct-messages', data.conversationId], (oldData = []) => {
                    return [...oldData, data.message];
                });

                queryClient.invalidateQueries(['conversations']);

                if (onNewMessage) onNewMessage(data);
            });

            // Tasks
            socket.on('new_task', (data) => {
                console.log('📋 New task received:', data);
                queryClient.setQueryData(['tasks'], (oldData = []) => {
                    return [...oldData, data.task];
                });
                if (onNewTask) onNewTask(data);
            });

            socket.on('task_updated', (data) => {
                console.log('🔄 Task updated:', data);
                queryClient.setQueryData(['tasks'], (oldData = []) => {
                    return oldData.map(task =>
                        task.taskId === data.taskId ? { ...task, ...data.task } : task
                    );
                });
                if (onTaskUpdate) onTaskUpdate(data);
            });

            // Meetings
            socket.on('new_meet', (data) => {
                console.log('📅 New meeting received:', data);
                queryClient.invalidateQueries(['meets']);
                if (onNewMeeting) onNewMeeting(data);
            });

            // Notifications
            socket.on('new_notification', (data) => {
                console.log('🔔 New notification:', data);
                queryClient.invalidateQueries(['notifications']);
                if (onNotification) onNotification(data);
            });

            // User status
            socket.on('workspace-member-status', (data) => {
                queryClient.setQueryData(['user-status', data.memberId], data.isOnline);
                if (onUserStatus) onUserStatus(data);
            });

            // Typing indicators
            socket.on('typing_indicator', (data) => {
                if (onTyping) onTyping(data);
            });

            listenersAttached.current = true;
        }

        return () => {
            // Clean up typing indicators
            if (socketRef.current) {
                socketRef.current.off('typing_indicator');
            }
        };
    }, [employeeId, queryClient, onNewMessage, onNewTask, onTaskUpdate, onNewMeeting, onNotification, onUserStatus, onTyping]);

    // Function to emit typing indicator
    const emitTyping = useCallback((conversationId, isTyping) => {
        if (socketRef.current) {
            socketRef.current.emit('typing', { conversationId, isTyping });
        }
    }, []);

    // Function to join group room
    const joinGroup = useCallback((groupId) => {
        if (socketRef.current) {
            socketRef.current.emit('join_group', groupId);
        }
    }, []);

    // Function to leave group room
    const leaveGroup = useCallback((groupId) => {
        if (socketRef.current) {
            socketRef.current.emit('leave_group', groupId);
        }
    }, []);

    // Function to join DM room
    const joinDM = useCallback((conversationId) => {
        if (socketRef.current) {
            socketRef.current.emit('join_dm', conversationId);
        }
    }, []);

    // Function to leave DM room
    const leaveDM = useCallback((conversationId) => {
        if (socketRef.current) {
            socketRef.current.emit('leave_dm', conversationId);
        }
    }, []);

    return {
        socket: socketRef.current,
        emitTyping,
        joinGroup,
        leaveGroup,
        joinDM,
        leaveDM
    };
}