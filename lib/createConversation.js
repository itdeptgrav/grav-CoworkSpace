// lib/createConversation.js
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./coworkFirebase";

export async function createOrGetConversation(employeeId1, employeeId2) {
    // Sort IDs to ensure consistent conversation ID
    const conversationId = [employeeId1, employeeId2].sort().join("_");

    const conversationRef = doc(db, "cowork_direct_messages", conversationId);

    await setDoc(conversationRef, {
        participants: {
            [employeeId1]: {
                lastRead: serverTimestamp(),
                unreadCount: 0
            },
            [employeeId2]: {
                lastRead: serverTimestamp(),
                unreadCount: 0
            }
        },
        createdAt: serverTimestamp(),
        lastMessage: "",
        lastMessageTime: serverTimestamp(),
        lastSenderId: null
    }, { merge: true });

    return conversationId;
}