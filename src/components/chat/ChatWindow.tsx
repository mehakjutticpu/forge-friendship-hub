import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  CornerUpLeft,
  ImagePlus,
  Mic,
  MoreVertical,
  Phone,
  Send,
  Smile,
  Square,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/useAuth";
import { uploadFile } from "@/lib/media";
import { useSignedUrl } from "@/components/SignedImage";
import { UserAvatar } from "./UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  kind: string;
  media_url: string | null;
  read_at: string | null;
  delivered_at: string | null;
  reply_to: string | null;
  reactions: Record<string, string> | null;
  deleted_for_everyone: boolean;
  created_at: string;
};

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isOnline(peer: Profile) {
  if (!peer.show_last_seen || !peer.last_seen) return false;
  return Date.now() - new Date(peer.last_seen).getTime() < 75_000;
}

function MediaBubble({ path, kind }: { path: string | null; kind: string }) {
  const url = useSignedUrl("chat-media", path);
  if (!url) return <div className="h-40 w-52 animate-pulse rounded-lg bg-muted" />;
  if (kind === "image")
    return <img src={url} alt="Shared" loading="lazy" className="max-h-64 rounded-lg" />;
  if (kind === "video")
    return <video src={url} controls playsInline className="max-h-64 rounded-lg" />;
  return <audio src={url} controls className="w-52" />;
}

function previewOf(m: Message | undefined) {
  if (!m) return "Message";
  if (m.deleted_for_everyone) return "Deleted message";
  if (m.kind === "text") return m.content ?? "";
  if (m.kind === "image") return "📷 Photo";
  if (m.kind === "video") return "🎬 Video";
  return "🎤 Voice note";
}

export function ChatWindow({
  me,
  peer,
  onBack,
  onCall,
}: {
  me: Profile;
  peer: Profile;
  onBack: () => void;
  onCall: (kind: "audio" | "video") => void;
}) {
  const [peerLive, setPeerLive] = useState<Profile>(peer);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [clearedAt, setClearedAt] = useState<number>(0);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const localKey = `srt-thread-${me.id}-${peer.id}`;

  useEffect(() => {
    setPeerLive(peer);
    setReplyTo(null);
    try {
      const raw = localStorage.getItem(localKey);
      const saved = raw ? (JSON.parse(raw) as { hidden?: string[]; clearedAt?: number }) : {};
      setHidden(saved.hidden ?? []);
      setClearedAt(saved.clearedAt ?? 0);
    } catch {
      setHidden([]);
      setClearedAt(0);
    }
  }, [peer.id]);

  const persistLocal = (next: { hidden?: string[]; clearedAt?: number }) => {
    const merged = { hidden, clearedAt, ...next };
    localStorage.setItem(localKey, JSON.stringify(merged));
    if (next.hidden) setHidden(next.hidden);
    if (next.clearedAt !== undefined) setClearedAt(next.clearedAt);
  };

  // Keep peer presence/profile live
  useEffect(() => {
    const channel = supabase
      .channel(`peer-${peer.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${peer.id}` },
        ({ new: row }) => setPeerLive(row as Profile),
      )
      .subscribe();
    const tick = setInterval(() => setPeerLive((p) => ({ ...p })), 20_000);
    return () => {
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [peer.id]);

  const markDelivered = useCallback(
    async (list: Message[]) => {
      const ids = list.filter((m) => m.sender_id === peer.id && !m.delivered_at).map((m) => m.id);
      if (!ids.length) return;
      await supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .in("id", ids);
    },
    [peer.id],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${me.id},receiver_id.eq.${peer.id}),and(sender_id.eq.${peer.id},receiver_id.eq.${me.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(400);
      if (!active) return;
      const list = (data as Message[]) ?? [];
      setMessages(list);
      void markDelivered(list);
    };
    void load();

    const channel = supabase
      .channel(`chat-${me.id}-${peer.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        ({ eventType, new: row, old }) => {
          if (eventType === "DELETE") {
            const gone = old as { id?: string };
            if (gone?.id) setMessages((prev) => prev.filter((m) => m.id !== gone.id));
            return;
          }
          const msg = row as Message;
          const inThread =
            (msg.sender_id === me.id && msg.receiver_id === peer.id) ||
            (msg.sender_id === peer.id && msg.receiver_id === me.id);
          if (!inThread) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id))
              return prev.map((m) => (m.id === msg.id ? msg : m));
            return [...prev, msg];
          });
          if (msg.sender_id === peer.id && !msg.delivered_at) void markDelivered([msg]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [me.id, peer.id, markDelivered]);

  const visible = useMemo(
    () =>
      messages.filter(
        (m) => !hidden.includes(m.id) && new Date(m.created_at).getTime() > clearedAt,
      ),
    [messages, hidden, clearedAt],
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
    const unread = visible.filter((m) => m.sender_id === peer.id && !m.read_at);
    if (unread.length) {
      void supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in(
          "id",
          unread.map((m) => m.id),
        );
    }
  }, [visible.length, peer.id]);

  const insertMessage = async (payload: Partial<Message>) => {
    const { error } = await supabase.from("messages").insert({
      sender_id: me.id,
      receiver_id: peer.id,
      kind: "text",
      reply_to: replyTo?.id ?? null,
      ...payload,
    } as never);
    setReplyTo(null);
    if (error) toast.error(error.message);
  };

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    await insertMessage({ content: body, kind: "text" });
  };

  const sendFile = async (file: File) => {
    setSending(true);
    try {
      const kind = file.type.startsWith("video") ? "video" : "image";
      const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
      const path = await uploadFile("chat-media", me.id, file, ext);
      await insertMessage({ kind, media_url: path });
    } catch {
      toast.error("Could not send that file.");
    } finally {
      setSending(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        try {
          const path = await uploadFile("chat-media", me.id, blob, "webm");
          await insertMessage({ kind: "voice", media_url: path });
        } catch {
          toast.error("Could not send the voice note.");
        }
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      toast.error("Microphone permission is needed for voice notes.");
    }
  };

  const react = async (message: Message, emoji: string) => {
    setPickerFor(null);
    const current = { ...(message.reactions ?? {}) };
    if (current[me.id] === emoji) delete current[me.id];
    else current[me.id] = emoji;
    const { error } = await supabase
      .from("messages")
      .update({ reactions: current as never })
      .eq("id", message.id);
    if (error) toast.error("Could not add the reaction.");
  };

  const unsend = async (message: Message) => {
    const { error } = await supabase
      .from("messages")
      .update({ deleted_for_everyone: true, content: null, media_url: null })
      .eq("id", message.id);
    if (error) toast.error("Could not unsend.");
  };

  const deleteForMe = (message: Message) => {
    persistLocal({ hidden: [...hidden, message.id] });
  };

  const clearChat = () => {
    persistLocal({ clearedAt: Date.now(), hidden: [] });
    toast.success("Chat cleared on this device.");
  };

  const online = isOnline(peerLive);
  const status = online
    ? "online"
    : peerLive.show_last_seen && peerLive.last_seen
      ? `last seen ${new Date(peerLive.last_seen).toLocaleString([], {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "short",
        })}`
      : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Fixed header */}
      <header className="z-20 flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-2">
        <button onClick={onBack} className="rounded-md p-1.5 hover:bg-muted md:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => setShowProfile(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-0.5 text-left"
        >
          <UserAvatar
            path={peerLive.avatar_url}
            name={peerLive.display_name || peerLive.username}
            size={38}
            hidden={!peerLive.show_avatar}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {peerLive.display_name || peerLive.username}
            </p>
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              {online && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              {status}
            </p>
          </div>
        </button>
        <button onClick={() => onCall("audio")} className="rounded-md p-2 hover:bg-muted" aria-label="Voice call">
          <Phone className="h-[18px] w-[18px]" />
        </button>
        <button onClick={() => onCall("video")} className="rounded-md p-2 hover:bg-muted" aria-label="Video call">
          <Video className="h-[18px] w-[18px]" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-md p-2 hover:bg-muted" aria-label="Chat menu">
            <MoreVertical className="h-[18px] w-[18px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowProfile(true)}>View profile</DropdownMenuItem>
            <DropdownMenuItem onClick={clearChat}>Clear chat</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Scrollable messages */}
      <div className="chat-canvas min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-4">
        {visible.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            mine={m.sender_id === me.id}
            meId={me.id}
            quoted={m.reply_to ? messages.find((x) => x.id === m.reply_to) : undefined}
            pickerOpen={pickerFor === m.id}
            onOpenPicker={() => setPickerFor(pickerFor === m.id ? null : m.id)}
            onReact={(emoji) => void react(m, emoji)}
            onReply={() => setReplyTo(m)}
            onUnsend={() => void unsend(m)}
            onDeleteForMe={() => deleteForMe(m)}
          />
        ))}
        <div ref={bottom} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-surface">
        {replyTo && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
              <p className="text-[11px] font-medium text-primary">
                {replyTo.sender_id === me.id ? "You" : peerLive.display_name || peerLive.username}
              </p>
              <p className="truncate text-xs text-muted-foreground">{previewOf(replyTo)}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1" aria-label="Cancel reply">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={sendText} className="flex items-end gap-1.5 px-2 py-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void sendFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-full p-2.5 text-muted-foreground hover:bg-muted"
            aria-label="Send photo or video"
            disabled={sending}
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText(e);
              }
            }}
            rows={1}
            placeholder="Message"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          {text.trim() ? (
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full">
              <Send className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              variant={recording ? "destructive" : "default"}
              className="h-10 w-10 shrink-0 rounded-full"
              onClick={() => void toggleRecording()}
              aria-label={recording ? "Stop recording" : "Record voice note"}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
        </form>
      </div>

      <Sheet open={showProfile} onOpenChange={setShowProfile}>
        <SheetContent side="right" className="w-[86vw] sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Contact info</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col items-center gap-2 px-4">
            <UserAvatar
              path={peerLive.avatar_url}
              name={peerLive.display_name || peerLive.username}
              size={104}
              hidden={!peerLive.show_avatar}
            />
            <p className="mt-2 font-display text-lg font-bold">
              {peerLive.display_name || peerLive.username}
            </p>
            <p className="text-xs text-muted-foreground">@{peerLive.username}</p>
            <p className="text-xs text-muted-foreground">ID {peerLive.uid}</p>
            <p className="mt-1 text-xs text-primary">{status}</p>
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-center text-sm">
              {peerLive.about || "No about yet."}
            </p>
            <Button variant="outline" className="mt-6 w-full" onClick={clearChat}>
              <Trash2 className="mr-2 h-4 w-4" /> Clear chat
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MessageRow({
  message,
  mine,
  meId,
  quoted,
  pickerOpen,
  onOpenPicker,
  onReact,
  onReply,
  onUnsend,
  onDeleteForMe,
}: {
  message: Message;
  mine: boolean;
  meId: string;
  quoted: Message | undefined;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onUnsend: () => void;
  onDeleteForMe: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);

  const reactions = Object.entries(message.reactions ?? {});
  const grouped = reactions.reduce<Record<string, number>>((acc, [, emoji]) => {
    acc[emoji] = (acc[emoji] ?? 0) + 1;
    return acc;
  }, {});

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
    if (dx > 0) setOffset(Math.min(dx, 70));
  };
  const onTouchEnd = () => {
    if (offset > 45) onReply();
    setOffset(0);
    startX.current = null;
  };

  const tick = message.read_at ? (
    <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
  ) : message.delivered_at ? (
    <CheckCheck className="h-3.5 w-3.5 opacity-70" />
  ) : (
    <Check className="h-3.5 w-3.5 opacity-70" />
  );

  return (
    <div
      className={`group relative flex ${mine ? "justify-end" : "justify-start"}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDoubleClick={onOpenPicker}
    >
      {offset > 8 && (
        <CornerUpLeft className="absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <div
        className="max-w-[80%] transition-transform"
        style={{ transform: `translateX(${offset}px)` }}
      >
        <div
          className={`relative rounded-2xl px-2.5 py-1.5 shadow-sm ${
            mine
              ? "rounded-br-sm bg-bubble-out text-bubble-out-foreground"
              : "rounded-bl-sm bg-bubble-in text-bubble-in-foreground"
          }`}
        >
          {quoted && (
            <div className="mb-1 rounded-lg border-l-2 border-primary bg-background/40 px-2 py-1">
              <p className="text-[10px] font-medium text-primary">
                {quoted.sender_id === meId ? "You" : "Them"}
              </p>
              <p className="line-clamp-2 text-[11px] opacity-80">{previewOf(quoted)}</p>
            </div>
          )}

          {message.deleted_for_everyone ? (
            <p className="px-1 text-sm italic opacity-60">This message was deleted</p>
          ) : message.kind === "text" ? (
            <p className="whitespace-pre-wrap break-words px-1 text-sm">{message.content}</p>
          ) : (
            <MediaBubble path={message.media_url} kind={message.kind} />
          )}

          <div className="flex items-center justify-end gap-1 px-1 pt-0.5 text-[10px] opacity-80">
            <span>{timeOf(message.created_at)}</span>
            {mine && !message.deleted_for_everyone && tick}
            {mine && message.deleted_for_everyone && <Clock className="h-3 w-3 opacity-0" />}
          </div>

          {!message.deleted_for_everyone && (
            <div
              className={`absolute top-1/2 hidden -translate-y-1/2 gap-0.5 group-hover:flex ${
                mine ? "right-full mr-1" : "left-full ml-1"
              }`}
            >
              <button
                onClick={onReply}
                className="rounded-full bg-surface p-1.5 shadow-card"
                aria-label="Reply"
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onOpenPicker}
                className="rounded-full bg-surface p-1.5 shadow-card"
                aria-label="React"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded-full bg-surface p-1.5 shadow-card"
                  aria-label="Message options"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? "end" : "start"}>
                  <DropdownMenuItem onClick={onReply}>Reply</DropdownMenuItem>
                  <DropdownMenuItem onClick={onDeleteForMe}>Delete for me</DropdownMenuItem>
                  {mine && (
                    <DropdownMenuItem onClick={onUnsend} className="text-destructive">
                      Unsend for everyone
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {Object.keys(grouped).length > 0 && (
          <div className={`-mt-1 flex gap-1 ${mine ? "justify-end pr-2" : "justify-start pl-2"}`}>
            {Object.entries(grouped).map(([emoji, count]) => (
              <span
                key={emoji}
                className="rounded-full border border-border bg-surface px-1.5 text-[11px] shadow-sm"
              >
                {emoji} {count > 1 ? count : ""}
              </span>
            ))}
          </div>
        )}

        {pickerOpen && (
          <div
            className={`mt-1 flex gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-pop ${
              mine ? "ml-auto w-fit" : "w-fit"
            }`}
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="text-lg transition-transform hover:scale-125"
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
