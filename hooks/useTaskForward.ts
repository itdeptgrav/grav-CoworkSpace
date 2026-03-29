/**
 * GRAV-CMS/hooks/useTaskForward.ts
 * Real-time task forwarding hook with Socket.io
 */
"use client";
import { useState, useEffect, useCallback } from "react";
import { getCoworkSocket } from "../lib/coworkSocket";
import { taskForwardApi } from "../lib/taskForwardApi";

export function useTaskList(employeeId: string, role: string) {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTasks = useCallback(async () => {
        if (!employeeId) return;
        try {
            setLoading(true);
            const data = await taskForwardApi.listTasksHierarchy();
            setTasks(data.tasks || []);
        } catch (_) { }
        finally { setLoading(false); }
    }, [employeeId]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    // Real-time updates via socket
    useEffect(() => {
        if (!employeeId) return;
        const socket = getCoworkSocket(employeeId);

        const handleNewTask = () => fetchTasks();
        const handleTaskUpdate = () => fetchTasks();
        const handleTaskReport = () => fetchTasks();
        const handleTaskConfirmed = () => fetchTasks();

        socket.on("new_task", handleNewTask);
        socket.on("task_updated", handleTaskUpdate);
        socket.on("task_report", handleTaskReport);
        socket.on("task_confirmed", handleTaskConfirmed);
        socket.on("task_thread_message", handleTaskUpdate);

        return () => {
            socket.off("new_task", handleNewTask);
            socket.off("task_updated", handleTaskUpdate);
            socket.off("task_report", handleTaskReport);
            socket.off("task_confirmed", handleTaskConfirmed);
            socket.off("task_thread_message", handleTaskUpdate);
        };
    }, [employeeId, fetchTasks]);

    return { tasks, loading, refetch: fetchTasks };
}

export function useTaskDetails(taskId: string, employeeId: string) {
    const [task, setTask] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchTask = useCallback(async () => {
        if (!taskId) return;
        try {
            setLoading(true);
            const data = await taskForwardApi.getTaskDetails(taskId);
            setTask(data.task);
        } catch (_) { }
        finally { setLoading(false); }
    }, [taskId]);

    useEffect(() => { fetchTask(); }, [fetchTask]);

    // Real-time updates
    useEffect(() => {
        if (!employeeId || !taskId) return;
        const socket = getCoworkSocket(employeeId);

        const handle = (data: any) => {
            if (data.taskId === taskId) fetchTask();
        };

        socket.on("task_updated", handle);
        socket.on("task_report", handle);
        socket.on("task_confirmed", handle);
        socket.on("task_thread_message", handle);

        return () => {
            socket.off("task_updated", handle);
            socket.off("task_report", handle);
            socket.off("task_confirmed", handle);
            socket.off("task_thread_message", handle);
        };
    }, [taskId, employeeId, fetchTask]);

    return { task, loading, refetch: fetchTask };
}