// GRAV-CMS/components/coworking/tasks/GroupTaskManager.jsx
"use client";
import { useState } from "react";
import { assignTask } from "../../../lib/coworkApi";

export default function GroupTaskManager({ groupId, employeeId, employeeName, role, onClose }) {
    const [taskData, setTaskData] = useState({
        title: '',
        description: '',
        dueDate: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!taskData.title.trim()) return;

        setIsSubmitting(true);
        try {
            // Get all group members - you'll need to fetch these from your API
            const groupMembers = await fetch(`/cowork/group/${groupId}/members`).then(res => res.json());

            await assignTask({
                title: taskData.title,
                description: taskData.description,
                dueDate: taskData.dueDate || null,
                assigneeIds: groupMembers.members || [],
                scopeType: 'group',
                scopeId: groupId,
                assignedBy: employeeId
            });

            // Send task creation message to group chat
            await fetch('/cowork/group/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groupId,
                    text: `📋 New task assigned: ${taskData.title}`,
                    type: 'task_created',
                    taskData: {
                        title: taskData.title,
                        description: taskData.description,
                        dueDate: taskData.dueDate,
                        assignedBy: employeeName
                    }
                })
            });

            setTaskData({ title: '', description: '', dueDate: '' });
            onClose();
        } catch (error) {
            console.error('Failed to assign task:', error);
            alert('Failed to assign task: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.panel}>
                <div style={styles.header}>
                    <h3 style={styles.title}>Assign Group Task</h3>
                    <button onClick={onClose} style={styles.closeButton}>✕</button>
                </div>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.field}>
                        <label style={styles.label}>Task Title *</label>
                        <input
                            type="text"
                            value={taskData.title}
                            onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                            placeholder="e.g., Complete project documentation"
                            style={styles.input}
                            required
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Description</label>
                        <textarea
                            value={taskData.description}
                            onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
                            placeholder="Add details about this task..."
                            style={styles.textarea}
                            rows={3}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Due Date (Optional)</label>
                        <input
                            type="date"
                            value={taskData.dueDate}
                            onChange={(e) => setTaskData({ ...taskData, dueDate: e.target.value })}
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.actions}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={styles.cancelButton}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !taskData.title.trim()}
                            style={{
                                ...styles.submitButton,
                                opacity: isSubmitting || !taskData.title.trim() ? 0.5 : 1
                            }}
                        >
                            {isSubmitting ? 'Assigning...' : 'Assign Task to Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        padding: '16px',
        borderBottom: '1px solid #e8eaed',
        background: '#fff'
    },
    panel: {
        background: '#f8f9fa',
        borderRadius: '8px',
        padding: '16px'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
    },
    title: {
        margin: 0,
        fontSize: '16px',
        fontWeight: 500,
        color: '#202124'
    },
    closeButton: {
        background: 'none',
        border: 'none',
        fontSize: '18px',
        cursor: 'pointer',
        color: '#5f6368'
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },
    label: {
        fontSize: '12px',
        fontWeight: 500,
        color: '#5f6368'
    },
    input: {
        padding: '8px 12px',
        border: '1px solid #dadce0',
        borderRadius: '4px',
        fontSize: '14px',
        outline: 'none'
    },
    textarea: {
        padding: '8px 12px',
        border: '1px solid #dadce0',
        borderRadius: '4px',
        fontSize: '14px',
        resize: 'vertical',
        fontFamily: 'inherit',
        outline: 'none'
    },
    actions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        marginTop: '8px'
    },
    cancelButton: {
        padding: '8px 16px',
        background: '#fff',
        border: '1px solid #dadce0',
        borderRadius: '4px',
        fontSize: '13px',
        color: '#5f6368',
        cursor: 'pointer'
    },
    submitButton: {
        padding: '8px 16px',
        background: '#1a73e8',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer'
    }
};