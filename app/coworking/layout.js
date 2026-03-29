// app/coworking/layout.js
"use client";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useCoworkAuth } from "../../hooks/useCoworkAuth";
import CoworkingShell from "../../components/coworking/layout/CoworkingShell";
import { GwSpinner } from "../../components/coworking/shared/CoworkShared";

// Loading component for page content
function PageLoadingFallback() {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "400px",
            width: "100%"
        }}>
            <GwSpinner size={36} />
        </div>
    );
}

export default function CoworkingLayout({ children }) {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const pathname = usePathname();

    // Don't render sidebar while auth is loading
    if (loading) {
        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh"
            }}>
                <GwSpinner size={48} />
            </div>
        );
    }

    // Don't render if no user (redirect handled by child components)
    if (!user) {
        return children;
    }

    // Extract page title from pathname or add your own logic
    const getPageTitle = () => {
        const path = pathname.split("/").pop();
        const titles = {
            "coworking": "Dashboard",
            "tasks": "Tasks",
            "direct-messages": "Messages",
            "create-group": "Groups",
            "schedule-meet": "Meetings",
            "meets": "Meetings"
        };
        return titles[path] || "CoWork Space";
    };

    return (
        <CoworkingShell
            role={role}
            employeeName={employeeName}
            employeeId={employeeId}
            title={getPageTitle()}
        >
            <Suspense fallback={<PageLoadingFallback />}>
                {children}
            </Suspense>
        </CoworkingShell>
    );
}