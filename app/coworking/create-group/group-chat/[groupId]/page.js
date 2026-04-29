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
 *
 * Note: app/coworking/layout.js already wraps every coworking page in
 * <CoworkingShell>, so we render only the chat view here.
 */
import { useRouter, useParams } from "next/navigation";
import GroupChatView from "../../../../../components/coworking/messaging/GroupChatView";

export default function GroupChatDeepLinkPage() {
  const router = useRouter();
  const { groupId } = useParams();

  return (
    <>
      <div className="grp-deeplink-wrap">
        <GroupChatView
          groupId={groupId}
          onBack={() => router.push("/coworking/create-group")}
        />
      </div>
      <style>{`
        /* Deep-link page always shows back button */
        .grp-back-btn { display: flex !important; }

        .grp-deeplink-wrap {
          height: 100%;
          max-width: 1200px;
          margin: 0 auto;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 3px rgba(15,23,42,0.04);
          background: #fff;
        }

        @media (max-width: 768px) {
          .grp-deeplink-wrap {
            border-radius: 0;
            border: none;
            box-shadow: none;
          }
        }
      `}</style>
    </>
  );
}