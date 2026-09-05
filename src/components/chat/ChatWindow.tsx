import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Clock,
  CornerUpLeft,
  Download,
  ImagePlus,
  Mic,
  MoreVertical,
  Palette,
  Pencil,
  Phone,
  Play,
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
import { MediaViewer, downloadUrl, type ViewerItem } from "./MediaViewer";
import {
  CHAT_THEMES,
  getNicknames,
  getThreadPrefs,
  resolveTheme,
  saveThreadPrefs,
  setNickname,
  type ThreadPrefs,
} from "@/lib/chat-prefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  pending?: boolean;
};

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function previewOf(m: Message | undefined) {
  if (!m) return "Message";
  if (m.deleted_for_everyone) return "Deleted message";
  if (m.kind === "text") return m.content ?? "";
  if (m.kind === "image") return "📷 Photo";
  if (m.kind === "video") return "🎬 Video";
  return "🎤 Voice note";
}

function MediaBubble({
  path,
  kind,
  onOpen,
}: {
  path: string | null;
  kind: string;
  onOpen: (item: ViewerItem) => void;
}) {
  const url = useSignedUrl("chat-media", path);
  if (!url) return <div className="h-40 w-52 animate-pulse rounded-lg bg-muted" />;

  if (kind === "image")
    return (
      <button
        type="button"
        onClick={() => onOpen({ url, kind: "image", name: "photo" })}
        className="block"
      >
        <img src={url} alt="Shared photo" loading="lazy" className="max-h-64 rounded-lg" />
      </button>
    );

  if (kind === "video")
    return (
      <div className="relative">
        <video src={url} controls playsInline className="max-h-64 rounded-lg" />
        <button
          type="button"
          onClick={() => onOpen({ url, kind: "video", name: "video" })}
          className="absolute right-1.5 top-1.5 rounded-full bg-foreground/60 p-1.5 text-background"
          aria-label="Open video"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      </div>
    );

  return (
    <div className="flex items-center gap-2">
      <audio src={url} controls className="w-48" />
      <button
        type="button"
        onClick={() => void downloadUrl(url, "voice-note.webm")}
        className="rounded-full p-1.5 opacity-70 hover:opacity-100"
        aria-label="Save voice note"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ChatWindow({
  me,
  peer,
  peerOnline,
  onBack,
  onCall,
}: {
  me: Profile;
  peer: Profile;
  peerOnline: boolean;
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
  const [showThemes, setShowThemes] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [clearedAt, setClearedAt] = useState<number>(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [viewer, setViewer] = useState<ViewerItem | null>(null);
  const [prefs, setPrefs] = useState<ThreadPrefs>({ themeId: "default", fontScale: 1 });
  const [nickname, setNick] = useState("");

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localKey = `srt-thread-${me.id}-${peer.id}`;
  const theme = useMemo(() => resolveTheme(prefs), [prefs]);
  const displayName = nickname || peerLive.display_name || peerLive.username;

  useEffect(() => {
    setPeerLive(peer);
    setReplyTo(null);
    setSelected([]);
    setPeerTyping(false);
    setPrefs(getThreadPrefs(me.id, peer.id));
    setNick(getNicknames(me.id)[peer.id] ?? "");
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

  const updatePrefs = (patch: Partial<ThreadPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveThreadPrefs(me.id, peer.id, next);
  };

  // Keep peer profile live
  useEffect(() => {
    const channel = supabase
      .channel(`peer-${peer.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${peer.id}` },
        ({ new: row }) => setPeerLive(row as Profile),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [peer.id]);

  // Typing indicator channel
  useEffect(() => {
    const key = [me.id, peer.id].sort().join("--");
    const channel = supabase.channel(`typing-${key}`, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { from: string; on: boolean };
        if (p.from !== peer.id) return;
        setPeerTyping(p.on);
      })
      .subscribe();
    typingChannel.current = channel;
    return () => {
      typingChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [me.id, peer.id]);

  const emitTyping = (on: boolean) => {
    void typingChannel.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: me.id, on },
    });
  };

  const onTextChange = (value: string) => {
    setText(value);
    emitTyping(value.trim().length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 2500);
  };

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

  // Scroll only the message list (never the page) so the header stays put.
  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
    const unread = visible.filter((m) => m.sender_id === peer.id && !m.read_at && !m.pending);
    if (unread.length) {
      void supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in(
          "id",
          unread.map((m) => m.id),
        );
    }
  }, [visible.length, peerTyping, peer.id, scrollToBottom]);

  const insertMessage = async (payload: Partial<Message>) => {
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: me.id,
      receiver_id: peer.id,
      content: payload.content ?? null,
      kind: payload.kind ?? "text",
      media_url: payload.media_url ?? null,
      read_at: null,
      delivered_at: null,
      reply_to: replyTo?.id ?? null,
      reactions: {},
      deleted_for_everyone: false,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    emitTyping(false);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: me.id,
        receiver_id: peer.id,
        kind: "text",
        reply_to: reply,
        ...payload,
      } as never)
      .select()
      .maybeSingle();

    if (error || !data) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error(error?.message ?? "Message could not be sent.");
      return;
    }
    const saved = data as Message;
    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
      return [...withoutTemp, saved];
    });
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
    if (message.pending) return;
    const current = { ...(message.reactions ?? {}) };
    if (current[me.id] === emoji) delete current[me.id];
    else current[me.id] = emoji;
    const { error } = await supabase
      .from("messages")
      .update({ reactions: current as never })
      .eq("id", message.id);
    if (error) toast.error("Could not add the reaction.");
  };

  // ----- selection + deleting -----
  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedMessages = visible.filter((m) => selected.includes(m.id));
  const allSelectedMine = selectedMessages.length > 0 && selectedMessages.every((m) => m.sender_id === me.id);

  const deleteForMe = (ids: string[]) => {
    persistLocal({ hidden: [...new Set([...hidden, ...ids])] });
    setSelected([]);
    toast.success(ids.length > 1 ? "Messages deleted for you." : "Message deleted for you.");
  };

  const deleteForEveryone = async (ids: string[]) => {
    const real = ids.filter((id) => !id.startsWith("tmp-"));
    if (!real.length) return;
    const { error } = await supabase
      .from("messages")
      .update({ deleted_for_everyone: true, content: null, media_url: null, reactions: {} as never })
      .in("id", real);
    setSelected([]);
    if (error) toast.error("Could not delete for everyone.");
    else toast.success("Deleted for everyone.");
  };

  const clearChat = () => {
    persistLocal({ clearedAt: Date.now(), hidden: [] });
    setSelected([]);
    toast.success("Chat cleared on this device.");
  };

  const online = peerOnline;
  const status = peerTyping
    ? "typing…"
    : online
      ? "online"
      : peerLive.show_last_seen && peerLive.last_seen
        ? `last seen ${new Date(peerLive.last_seen).toLocaleString([], {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          })}`
        : "";

  const avatarUrlForViewer = useSignedUrl(
    "avatars",
    showProfile && peerLive.show_avatar ? peerLive.avatar_url : null,
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={
        {
          "--chat-bg": theme.bg,
          "--bubble-out": theme.bubbleOut,
          "--bubble-out-foreground": theme.bubbleOutFg,
          "--bubble-in": theme.bubbleIn,
          "--bubble-in-foreground": theme.bubbleInFg,
        } as React.CSSProperties
      }
    >
      {/* Fixed header — stays visible while messages scroll */}
      {selected.length > 0 ? (
        <header className="z-20 flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-2.5">
          <button onClick={() => setSelected([])} className="rounded-md p-1.5 hover:bg-muted" aria-label="Cancel selection">
            <X className="h-5 w-5" />
          </button>
          <p className="flex-1 text-sm font-semibold">{selected.length} selected</p>
          <button
            onClick={() => deleteForMe(selected)}
            className="rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Delete for me
          </button>
          {allSelectedMine && (
            <button
              onClick={() => void deleteForEveryone(selected)}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-destructive hover:bg-muted"
            >
              Delete for everyone
            </button>
          )}
        </header>
      ) : (
        <header className="z-20 flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-2">
          <button onClick={onBack} className="rounded-md p-1.5 hover:bg-muted md:hidden" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowProfile(true)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-0.5 text-left"
          >
            <div className="relative shrink-0">
              <UserAvatar
                path={peerLive.avatar_url}
                name={displayName}
                size={38}
                hidden={!peerLive.show_avatar}
              />
              {online && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-emerald-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                {online && !peerTyping && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                <span className={peerTyping ? "text-primary" : undefined}>{status}</span>
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
              <DropdownMenuItem onClick={() => setShowThemes(true)}>Chat theme</DropdownMenuItem>
              <DropdownMenuItem onClick={clearChat}>Clear chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
      )}

      {/* Scrollable messages */}
      <div
        ref={listRef}
        className="chat-canvas min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-4"
        style={
          {
            fontSize: `${prefs.fontScale ?? 1}rem`,
            backgroundImage: theme.pattern ? undefined : "none",
          } as React.CSSProperties
        }
      >
        {visible.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            mine={m.sender_id === me.id}
            meId={me.id}
            peerName={displayName}
            quoted={m.reply_to ? messages.find((x) => x.id === m.reply_to) : undefined}
            pickerOpen={pickerFor === m.id}
            selectMode={selected.length > 0}
            isSelected={selected.includes(m.id)}
            onToggleSelect={() => toggleSelect(m.id)}
            onOpenPicker={() => setPickerFor(pickerFor === m.id ? null : m.id)}
            onReact={(emoji) => void react(m, emoji)}
            onReply={() => setReplyTo(m)}
            onDeleteEveryone={() => void deleteForEveryone([m.id])}
            onDeleteForMe={() => deleteForMe([m.id])}
            onOpenMedia={setViewer}
          />
        ))}

        {peerTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-bubble-in px-3 py-2.5 shadow-sm">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-bubble-in-foreground/60"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-surface">
        {replyTo && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
              <p className="text-[11px] font-medium text-primary">
                {replyTo.sender_id === me.id ? "You" : displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{previewOf(replyTo)}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1" aria-label="Cancel reply">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={sendText} className="flex items-end gap-1 px-2 py-2">
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
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
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
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className="rounded-full p-2.5 text-muted-foreground hover:bg-muted"
            aria-label="Take a photo"
            disabled={sending}
          >
            <Camera className="h-5 w-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onBlur={() => emitTyping(false)}
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

      <MediaViewer item={viewer} onClose={() => setViewer(null)} />

      {/* Contact info */}
      <Sheet open={showProfile} onOpenChange={setShowProfile}>
        <SheetContent side="right" className="w-[86vw] overflow-y-auto sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Contact info</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col items-center gap-2 px-4 pb-8">
            <button
              type="button"
              onClick={() => {
                if (avatarUrlForViewer)
                  setViewer({ url: avatarUrlForViewer, kind: "avatar", name: peerLive.username });
                else toast.info("This user has no photo to open.");
              }}
              className="rounded-full"
              aria-label="Open profile photo"
            >
              <UserAvatar
                path={peerLive.avatar_url}
                name={displayName}
                size={112}
                hidden={!peerLive.show_avatar}
              />
            </button>
            <p className="mt-2 font-display text-lg font-bold">{displayName}</p>
            <p className="text-xs text-muted-foreground">@{peerLive.username}</p>
            <p className="text-xs text-muted-foreground">ID {peerLive.uid}</p>
            <p className="mt-1 text-xs text-primary">{online ? "online" : status}</p>
            <p className="mt-4 w-full rounded-lg bg-muted px-3 py-2 text-center text-sm">
              {peerLive.about || "No about yet."}
            </p>

            <div className="mt-6 w-full space-y-1.5">
              <Label htmlFor="nick" className="flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Nickname
              </Label>
              <Input
                id="nick"
                value={nickname}
                placeholder={peerLive.display_name || peerLive.username}
                onChange={(e) => setNick(e.target.value)}
                onBlur={() => {
                  setNickname(me.id, peer.id, nickname);
                  toast.success(nickname.trim() ? "Nickname saved." : "Nickname removed.");
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Only you can see this nickname.
              </p>
            </div>

            <Button variant="outline" className="mt-5 w-full" onClick={() => setShowThemes(true)}>
              <Palette className="mr-2 h-4 w-4" /> Chat theme
            </Button>
            <Button variant="outline" className="mt-2 w-full" onClick={clearChat}>
              <Trash2 className="mr-2 h-4 w-4" /> Clear chat
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Theme picker */}
      <Sheet open={showThemes} onOpenChange={setShowThemes}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Chat theme for {displayName}</SheetTitle>
          </SheetHeader>

          <div className="grid grid-cols-3 gap-3 px-4 pt-5 sm:grid-cols-5">
            {CHAT_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => updatePrefs({ themeId: t.id, customBg: undefined, customOut: undefined })}
                className={`overflow-hidden rounded-xl border-2 text-left ${
                  prefs.themeId === t.id && !prefs.customBg ? "border-primary" : "border-border"
                }`}
              >
                <div className="space-y-1 p-2" style={{ background: t.bg }}>
                  <span
                    className="ml-auto block h-3 w-10 rounded-full"
                    style={{ background: t.bubbleOut }}
                  />
                  <span className="block h-3 w-8 rounded-full" style={{ background: t.bubbleIn }} />
                </div>
                <p className="truncate px-2 py-1 text-[11px] font-medium">{t.name}</p>
              </button>
            ))}
          </div>

          <div className="space-y-4 px-4 pb-8 pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Customize
            </p>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="bgc">Background colour</Label>
              <input
                id="bgc"
                type="color"
                className="h-9 w-14 rounded-md border border-border bg-transparent"
                onChange={(e) => updatePrefs({ customBg: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="bbc">My bubble colour</Label>
              <input
                id="bbc"
                type="color"
                className="h-9 w-14 rounded-md border border-border bg-transparent"
                onChange={(e) => updatePrefs({ customOut: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Text size</Label>
              <Slider
                value={[prefs.fontScale ?? 1]}
                min={0.85}
                max={1.3}
                step={0.05}
                onValueChange={([v]) => updatePrefs({ fontScale: v ?? 1 })}
                aria-label="Text size"
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => updatePrefs({ themeId: "default", customBg: undefined, customOut: undefined, fontScale: 1 })}
            >
              Reset theme
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
  peerName,
  quoted,
  pickerOpen,
  selectMode,
  isSelected,
  onToggleSelect,
  onOpenPicker,
  onReact,
  onReply,
  onDeleteEveryone,
  onDeleteForMe,
  onOpenMedia,
}: {
  message: Message;
  mine: boolean;
  meId: string;
  peerName: string;
  quoted: Message | undefined;
  pickerOpen: boolean;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenPicker: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDeleteEveryone: () => void;
  onDeleteForMe: () => void;
  onOpenMedia: (item: ViewerItem) => void;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reactions = Object.entries(message.reactions ?? {});
  const grouped = reactions.reduce<Record<string, number>>((acc, [, emoji]) => {
    acc[emoji] = (acc[emoji] ?? 0) + 1;
    return acc;
  }, {});

  const beginLongPress = () => {
    longPress.current = setTimeout(() => onToggleSelect(), 450);
  };
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? null;
    beginLongPress();
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
    if (Math.abs(dx) > 6) cancelLongPress();
    if (dx > 0 && !selectMode) setOffset(Math.min(dx, 70));
  };
  const onTouchEnd = () => {
    cancelLongPress();
    if (offset > 45) onReply();
    setOffset(0);
    startX.current = null;
  };

  const tick = message.pending ? (
    <Clock className="h-3 w-3 opacity-70" />
  ) : message.read_at ? (
    <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
  ) : message.delivered_at ? (
    <CheckCheck className="h-3.5 w-3.5 opacity-70" />
  ) : (
    <Check className="h-3.5 w-3.5 opacity-70" />
  );

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-lg px-1 transition-colors ${
        isSelected ? "bg-primary/15" : ""
      } ${mine ? "justify-end" : "justify-start"}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleSelect();
      }}
      onClick={() => {
        if (selectMode) onToggleSelect();
      }}
      onDoubleClick={() => {
        if (!selectMode) onOpenPicker();
      }}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="h-4 w-4 shrink-0 accent-current"
          aria-label="Select message"
        />
      )}
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
                {quoted.sender_id === meId ? "You" : peerName}
              </p>
              <p className="line-clamp-2 text-[11px] opacity-80">{previewOf(quoted)}</p>
            </div>
          )}

          {message.deleted_for_everyone ? (
            <p className="px-1 text-sm italic opacity-60">This message was deleted</p>
          ) : message.kind === "text" ? (
            <p className="whitespace-pre-wrap break-words px-1 text-sm">{message.content}</p>
          ) : (
            <MediaBubble path={message.media_url} kind={message.kind} onOpen={onOpenMedia} />
          )}

          <div className="flex items-center justify-end gap-1 px-1 pt-0.5 text-[10px] opacity-80">
            <span>{timeOf(message.created_at)}</span>
            {mine && !message.deleted_for_everyone && tick}
          </div>

          {!message.deleted_for_everyone && !selectMode && (
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
                  <DropdownMenuItem onClick={onToggleSelect}>Select messages</DropdownMenuItem>
                  <DropdownMenuItem onClick={onDeleteForMe}>Delete for me</DropdownMenuItem>
                  {mine && (
                    <DropdownMenuItem onClick={onDeleteEveryone} className="text-destructive">
                      Delete for everyone
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
