//GRAV - CMS / app / coworking / groups / page.js
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import { listGroups } from "../../../lib/coworkApi";
import { GwAvatar } from "../../../components/coworking/shared/CoworkShared";
import { getCoworkSocket } from "../../../lib/coworkSocket";

export default function GroupsPage() {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const router = useRouter();

    const [groups, setGroups] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(true);

    const fetchGroups = async () => {
        try {
            setLoadingGroups(true);
            const data = await listGroups();
            console.log("Fetched groups:", data.groups);
            setGroups(data.groups || []);
        } catch (err) {
            console.error("Error fetching groups:", err);
        } finally {
            setLoadingGroups(false);
        }
    };

    useEffect(() => {
        if (!loading && !user) {
            router.push("/coworking-login");
            return;
        }
        if (user) fetchGroups();
    }, [user, loading, router]);

    useEffect(() => {
        if (!employeeId) return;
        const socket = getCoworkSocket(employeeId);
        socket.on("group_created", () => fetchGroups());
        socket.on("group_updated", () => fetchGroups());
        return () => {
            socket.off("group_created");
            socket.off("group_updated");
        };
    }, [employeeId]);

    if (loading || !user) return null;

    return (
        <>
            <div className="cw-groups-page">
                <style>{`
                    .cw-groups-page {
                        padding: 24px;
                        max-width: 1200px;
                        margin: 0 auto;
                        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                    }
                    .cw-grp-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 24px;
                    }
                    .cw-grp-title {
                        font-size: 22px;
                        font-weight: 700;
                        color: #202124;
                        margin: 0;
                        letter-spacing: -0.02em;
                    }
                    .cw-grp-subtitle {
                        font-size: 13px;
                        color: #5F6368;
                        margin: 4px 0 0;
                    }
                    .cw-grp-loading {
                        text-align: center;
                        padding: 60px;
                        background: #fff;
                        border-radius: 12px;
                        border: 1px solid #E8EAED;
                        color: #5F6368;
                    }
                    .cw-grp-spinner {
                        width: 36px;
                        height: 36px;
                        border: 3px solid #F1F3F4;
                        border-top: 3px solid #1A73E8;
                        border-radius: 50%;
                        animation: cw-spin 0.8s linear infinite;
                        margin: 0 auto 16px;
                    }
                    @keyframes cw-spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .cw-grp-empty {
                        text-align: center;
                        padding: 80px 40px;
                        background: #fff;
                        border-radius: 16px;
                        border: 1px solid #E8EAED;
                    }
                    .cw-grp-empty-icon {
                        width: 64px;
                        height: 64px;
                        border-radius: 50%;
                        background: #F1F3F4;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 16px;
                    }
                    .cw-grp-empty-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #202124;
                        margin: 0 0 8px;
                    }
                    .cw-grp-empty-text {
                        font-size: 14px;
                        color: #5F6368;
                        margin: 0;
                        max-width: 360px;
                        margin: 0 auto;
                        line-height: 1.6;
                    }
                    .cw-grp-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                        gap: 16px;
                    }
                    .cw-grp-card {
                        background: #fff;
                        border-radius: 12px;
                        border: 1px solid #E8EAED;
                        overflow: hidden;
                        transition: all 0.2s ease;
                        cursor: pointer;
                    }
                    .cw-grp-card:hover {
                        box-shadow: 0 4px 16px rgba(60,64,67,0.12);
                        transform: translateY(-2px);
                        border-color: #DADCE0;
                    }
                    .cw-grp-card-body { padding: 20px; }
                    .cw-grp-card-header {
                        display: flex;
                        align-items: center;
                        gap: 14px;
                        margin-bottom: 12px;
                    }
                    .cw-grp-avatar {
                        width: 48px;
                        height: 48px;
                        background: #E8F0FE;
                        border-radius: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    }
                    .cw-grp-name {
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                        color: #202124;
                        letter-spacing: -0.01em;
                    }
                    .cw-grp-id {
                        font-size: 11px;
                        color: #5F6368;
                        font-family: 'IBM Plex Mono', monospace;
                        background: #F1F3F4;
                        padding: 2px 8px;
                        border-radius: 4px;
                        margin-top: 4px;
                        display: inline-block;
                    }
                    .cw-grp-desc {
                        font-size: 13px;
                        color: #5F6368;
                        margin-bottom: 14px;
                        line-height: 1.6;
                    }
                    .cw-grp-meta {
                        display: flex;
                        gap: 16px;
                        margin-bottom: 14px;
                        font-size: 12px;
                        color: #9AA0A6;
                    }
                    .cw-grp-meta-item {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .cw-grp-last-msg {
                        padding: 10px 14px;
                        background: #F8F9FA;
                        border-radius: 8px;
                        margin-bottom: 14px;
                        font-size: 12px;
                        border-left: 3px solid #1A73E8;
                    }
                    .cw-grp-last-sender {
                        font-weight: 600;
                        color: #202124;
                        margin-right: 4px;
                    }
                    .cw-grp-last-text { color: #5F6368; }
                    .cw-grp-chat-btn {
                        width: 100%;
                        padding: 10px 20px;
                        background: transparent;
                        border: 1.5px solid #DADCE0;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        color: #1A73E8;
                        cursor: pointer;
                        font-family: inherit;
                        transition: all 0.2s;
                    }
                    .cw-grp-chat-btn:hover {
                        background: #E8F0FE;
                        border-color: #1A73E8;
                    }
                    @media (max-width: 767px) {
                        .cw-groups-page { padding: 16px; }
                        .cw-grp-grid { grid-template-columns: 1fr; }
                    }
                `}</style>

                <div className="cw-grp-header">
                    <div>
                        <h1 className="cw-grp-title">My Groups</h1>
                        <p className="cw-grp-subtitle">
                            {groups.length} group{groups.length !== 1 ? 's' : ''} you're a member of
                        </p>
                    </div>
                </div>

                {loadingGroups ? (
                    <div className="cw-grp-loading">
                        <div className="cw-grp-spinner"></div>
                        <p>Loading your groups...</p>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="cw-grp-empty">
                        <div className="cw-grp-empty-icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <h3 className="cw-grp-empty-title">No groups yet</h3>
                        <p className="cw-grp-empty-text">
                            {role === 'ceo'
                                ? 'Create a group to start collaborating with your team.'
                                : "You haven\'t been added to any groups yet. Your administrator will add you."}
                        </p>
                    </div>
                ) : (
                    <div className="cw-grp-grid">
                        {groups.map(group => (
                            <div
                                key={group.groupId || group.id}
                                className="cw-grp-card"
                                onClick={() => router.push(`/coworking/create-group/group-chat/${group.groupId}`)}
                            >
                                <div className="cw-grp-card-body">
                                    <div className="cw-grp-card-header">
                                        <div className="cw-grp-avatar">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="cw-grp-name">{group.name}</h3>
                                            <span className="cw-grp-id">{group.groupId}</span>
                                        </div>
                                    </div>

                                    {group.description && (
                                        <p className="cw-grp-desc">{group.description}</p>
                                    )}

                                    <div className="cw-grp-meta">
                                        <span className="cw-grp-meta-item">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                            </svg>
                                            {group.memberCount || group.memberIds?.length || 0} members
                                        </span>
                                        <span className="cw-grp-meta-item">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                            Created {new Date(group.createdAt?.seconds * 1000 || group.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {group.lastMessage && (
                                        <div className="cw-grp-last-msg">
                                            <span className="cw-grp-last-sender">
                                                {group.lastMessage.senderName}:
                                            </span>
                                            <span className="cw-grp-last-text">
                                                {group.lastMessage.text}
                                            </span>
                                        </div>
                                    )}

                                    <button
                                        className="cw-grp-chat-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/coworking/create-group/group-chat/${group.groupId}`);
                                        }}
                                    >
                                        Open Chat
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}