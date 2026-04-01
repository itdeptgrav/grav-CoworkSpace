// app/coworking/layout.js
// REPLACE your existing app/coworking/layout.js with this
"use client";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useCoworkAuth } from "../../hooks/useCoworkAuth";
import CoworkingShell from "../../components/coworking/layout/CoworkingShell";
import { GwSpinner } from "../../components/coworking/shared/CoworkShared";

function PageLoadingFallback() {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
            <GwSpinner size={36} />
        </div>
    );
}

export default function CoworkingLayout({ children }) {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const pathname = usePathname();

    // ── Bypass shell entirely for meeting room ──────────────────────────────
    // LiveKit VideoConference needs true full-screen with no sidebar/header.
    if (pathname?.includes("/cowork-meeting/")) {
        return <>{children}</>;
    }

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
                <GwSpinner size={48} />
            </div>
        );
    }

    if (!user) return children;

    const getPageTitle = () => {
        const path = pathname.split("/").pop();
        return {
            coworking: "Dashboard",
            tasks: "Tasks",
            "direct-messages": "Messages",
            "create-group": "Groups",
            "schedule-meet": "Meetings",
        }[path] || "CoWork Space";
    };

    return (
        <CoworkingShell role={role} employeeName={employeeName} employeeId={employeeId} title={getPageTitle()}>
            <Suspense fallback={<PageLoadingFallback />}>
                {children}
            </Suspense>
        </CoworkingShell>
    );
}