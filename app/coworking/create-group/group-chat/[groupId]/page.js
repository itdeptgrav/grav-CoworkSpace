"use client";
/**
 * GRAV-CMS/app/coworking/create-group/group-chat/[groupId]/page.js
 *
 * Thin wrapper — preserves the old `/coworking/create-group/group-chat/:id` URL.
 * Renders the GroupChatView component full-screen with a back button that
 * returns to the group list.
 *
 * All real chat logic lives in:
 *   components/coworking/messaging/GroupChatView.jsx
 */
import { useRouter, useParams } from "next/navigation";
import CoworkingShell from "../../../../../components/coworking/layout/CoworkingShell";
import GroupChatView from "../../../../../components/coworking/messaging/GroupChatView";

export default function GroupChatDeepLinkPage() {
  const router = useRouter();
  const { groupId } = useParams();

  return (
    <CoworkingShell>
      <div style={{
        height: "calc(100dvh - 108px)",
        maxWidth: 1200,
        margin: "0 auto",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid #E2E8F0",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
        background: "#fff",
      }}>
        <GroupChatView
          groupId={groupId}
          onBack={() => router.push("/coworking/create-group")}
        />
      </div>
      <style>{`
                /* Deep-link page always shows back button */
                .grp-back-btn { display: flex !important; }
                @media (max-width: 768px) {
                    div[style*="calc(100dvh - 108px)"] {
                        height: calc(100dvh - 56px) !important;
                        border-radius: 0 !important;
                        border: none !important;
                    }
                }
            `}</style>
    </CoworkingShell>
  );
}