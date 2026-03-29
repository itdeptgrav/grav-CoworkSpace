// GRAV-CMS/hooks/useCoworkGroups.js
"use client";
import { useState, useEffect, useCallback } from 'react';
import { listGroups } from '../lib/coworkApi';

export function useCoworkGroups(employeeId, role) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchGroups = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listGroups();
            setGroups(data.groups || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching groups:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (employeeId) {
            fetchGroups();
        }
    }, [employeeId, fetchGroups]);

    // Listen for real-time updates via socket
    useEffect(() => {
        if (!employeeId) return;

        import('../lib/coworkSocket').then(({ getCoworkSocket }) => {
            const socket = getCoworkSocket(employeeId);

            socket.on('group_created', (data) => {
                fetchGroups();
            });

            socket.on('group_updated', (data) => {
                fetchGroups();
            });

            socket.on('new_group_message', (data) => {
                // Update last message in groups list
                setGroups(prev => prev.map(group =>
                    group.groupId === data.groupId
                        ? { ...group, lastMessage: data.message }
                        : group
                ));
            });

            return () => {
                socket.off('group_created');
                socket.off('group_updated');
                socket.off('new_group_message');
            };
        });
    }, [employeeId, fetchGroups]);

    return { groups, loading, error, refetch: fetchGroups };
}