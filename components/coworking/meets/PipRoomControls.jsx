"use client";
import { useEffect } from "react";
import { useLocalParticipant } from "@livekit/components-react";

export default function PipRoomControls({ micOn, camOn }) {
    const { localParticipant } = useLocalParticipant();

    useEffect(() => {
        if (!localParticipant) return;
        localParticipant.setMicrophoneEnabled(micOn).catch(() => { });
    }, [micOn, localParticipant]);

    useEffect(() => {
        if (!localParticipant) return;
        localParticipant.setCameraEnabled(camOn).catch(() => { });
    }, [camOn, localParticipant]);

    return null;
}