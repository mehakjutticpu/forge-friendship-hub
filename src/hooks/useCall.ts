import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CallMedia = "audio" | "video";
export type CallStatus = "idle" | "calling" | "incoming" | "connected";

type Signal = {
  id: string;
  from_id: string;
  to_id: string;
  call_id: string;
  type: string;
  media: string;
  payload: unknown;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

export function useCall(userId: string | undefined) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [media, setMedia] = useState<CallMedia>("audio");
  const [peerId, setPeerId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const peerRef = useRef<string | null>(null);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const localStream = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localPreview, setLocalPreview] = useState<MediaStream | null>(null);

  const send = useCallback(
    async (type: string, payload: unknown, kind: CallMedia = media) => {
      if (!userId || !peerRef.current || !callIdRef.current) return;
      await supabase.from("call_signals").insert({
        from_id: userId,
        to_id: peerRef.current,
        call_id: callIdRef.current,
        type,
        media: kind,
        payload: payload as never,
      });
    },
    [userId, media],
  );

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    setLocalPreview(null);
    setRemoteStream(null);
    setStatus("idle");
    setPeerId(null);
    setMuted(false);
    setCamOff(false);
    peerRef.current = null;
    callIdRef.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
  }, []);

  const buildPc = useCallback(
    async (kind: CallMedia) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video",
      });
      localStream.current = stream;
      setLocalPreview(stream);

      const pc = new RTCPeerConnection(RTC_CONFIG);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const inbound = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => inbound.addTrack(t));
        setRemoteStream(inbound);
        setStatus("connected");
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) void send("ice", event.candidate.toJSON(), kind);
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) cleanup();
      };
      pcRef.current = pc;
      return pc;
    },
    [send, cleanup],
  );

  const startCall = useCallback(
    async (targetId: string, kind: CallMedia) => {
      if (!userId) return;
      callIdRef.current = crypto.randomUUID();
      peerRef.current = targetId;
      setPeerId(targetId);
      setMedia(kind);
      setStatus("calling");
      try {
        const pc = await buildPc(kind);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await send("offer", offer, kind);
      } catch {
        cleanup();
      }
    },
    [userId, buildPc, send, cleanup],
  );

  const acceptCall = useCallback(async () => {
    if (!pendingOffer.current) return;
    try {
      const pc = await buildPc(media);
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
      for (const cand of pendingIce.current) await pc.addIceCandidate(new RTCIceCandidate(cand));
      pendingIce.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await send("answer", answer, media);
      setStatus("connected");
    } catch {
      cleanup();
    }
  }, [buildPc, media, send, cleanup]);

  const endCall = useCallback(async () => {
    await send("end", null);
    cleanup();
  }, [send, cleanup]);

  const toggleMute = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOff(!track.enabled);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`calls-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_signals", filter: `to_id=eq.${userId}` },
        async ({ new: row }) => {
          const signal = row as Signal;
          if (signal.type === "offer") {
            if (pcRef.current) return;
            callIdRef.current = signal.call_id;
            peerRef.current = signal.from_id;
            setPeerId(signal.from_id);
            setMedia(signal.media === "video" ? "video" : "audio");
            pendingOffer.current = signal.payload as RTCSessionDescriptionInit;
            setStatus("incoming");
            return;
          }
          if (signal.call_id !== callIdRef.current) return;
          if (signal.type === "answer" && pcRef.current) {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit),
            );
            setStatus("connected");
          } else if (signal.type === "ice") {
            const cand = signal.payload as RTCIceCandidateInit;
            if (pcRef.current?.remoteDescription) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
            } else {
              pendingIce.current.push(cand);
            }
          } else if (signal.type === "end") {
            cleanup();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, cleanup]);

  return {
    status,
    media,
    peerId,
    remoteStream,
    localPreview,
    muted,
    camOff,
    startCall,
    acceptCall,
    endCall,
    rejectCall: endCall,
    toggleMute,
    toggleCam,
  };
}
