import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import type { useCall } from "@/hooks/useCall";
import { UserAvatar } from "./UserAvatar";

type Props = {
  call: ReturnType<typeof useCall>;
  peerName: string;
  peerAvatar?: string | null | undefined;
};

export function CallOverlay({ call, peerName, peerAvatar }: Props) {
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideo.current && call.remoteStream) remoteVideo.current.srcObject = call.remoteStream;
    if (remoteAudio.current && call.remoteStream) remoteAudio.current.srcObject = call.remoteStream;
  }, [call.remoteStream]);

  useEffect(() => {
    if (localVideo.current && call.localPreview) localVideo.current.srcObject = call.localPreview;
  }, [call.localPreview]);

  if (call.status === "idle") return null;

  const isVideo = call.media === "video";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground/95 text-background">
      <audio ref={remoteAudio} autoPlay playsInline className="hidden" />

      <div className="relative flex flex-1 items-center justify-center">
        {isVideo && call.status === "connected" ? (
          <video ref={remoteVideo} autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <UserAvatar path={peerAvatar} name={peerName} size={96} />
            <p className="font-display text-xl font-bold">{peerName}</p>
            <p className="text-sm opacity-70">
              {call.status === "calling"
                ? "Calling…"
                : call.status === "incoming"
                  ? `Incoming ${call.media} call`
                  : "Connected"}
            </p>
          </div>
        )}

        {isVideo && call.localPreview && (
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            className="absolute bottom-4 right-4 h-40 w-28 rounded-xl border border-background/30 object-cover"
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-4 pb-10 pt-4">
        {call.status === "incoming" ? (
          <>
            <button
              onClick={() => void call.rejectCall()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              aria-label="Reject call"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              onClick={() => void call.acceptCall()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-label="Accept call"
            >
              <Phone className="h-6 w-6" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={call.toggleMute}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15"
              aria-label="Toggle microphone"
            >
              {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            {isVideo && (
              <button
                onClick={call.toggleCam}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15"
                aria-label="Toggle camera"
              >
                {call.camOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={() => void call.endCall()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              aria-label="End call"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
