import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  LogOut,
  MessageSquarePlus,
  Search,
  Settings2,
  UserPlus,
  X,
  ArrowLeft,
  Copy,
  Camera,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { isGateUnlocked, lockGate } from "@/lib/gate-session";
import { useCall } from "@/hooks/useCall";
import { usePresence } from "@/hooks/usePresence";
import { useAppLock } from "@/hooks/useAppLock";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { CallOverlay } from "@/components/chat/CallOverlay";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { AvatarCropper } from "@/components/chat/AvatarCropper";
import { MediaViewer, type ViewerItem } from "@/components/chat/MediaViewer";
import { getNicknames } from "@/lib/chat-prefs";
import { useSignedUrl } from "@/components/SignedImage";
import { uploadFile } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/room")({
  head: () => ({
    meta: [
      { title: "Workspace — Shopify Research Tools" },
      { name: "description", content: "Private workspace area for this research account." },
      { property: "og:title", content: "Workspace — Shopify Research Tools" },
      { property: "og:description", content: "Private workspace area for this research account." },
    ],
  }),
  component: RoomPage,
});

type RequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
};

type Tab = "chats" | "add" | "me";

function RoomPage() {
  const navigate = useNavigate();
  const { session, profile, loading, refreshProfile, signOut } = useAuth();
  const call = useCall(session?.user.id);
  const onlineIds = usePresence(session?.user.id);

  const [tab, setTab] = useState<Tab>("chats");
  const [friends, setFriends] = useState<Profile[]>([]);
  const [incoming, setIncoming] = useState<{ req: RequestRow; profile: Profile }[]>([]);
  const [active, setActive] = useState<Profile | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});

  // Leaving the app re-locks the private area, so the access key is needed again.
  useAppLock(Boolean(session));

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: isGateUnlocked() ? "/auth" : "/" });
    }
  }, [session, loading]);

  useEffect(() => {
    if (!session) return;
    const sync = () => setNicknames(getNicknames(session.user.id));
    sync();
    window.addEventListener("srt-nicknames", sync);
    return () => window.removeEventListener("srt-nicknames", sync);
  }, [session?.user.id]);

  const nameOf = (p: Profile) => nicknames[p.id] || p.display_name || p.username;

  // Mark every incoming message as delivered while this user is online.
  useEffect(() => {
    if (!session) return;
    const me = session.user.id;
    const markAll = async () => {
      await supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .eq("receiver_id", me)
        .is("delivered_at", null);
    };
    void markAll();
    const channel = supabase
      .channel("delivery-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${me}` },
        () => void markAll(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  const loadRelations = useCallback(async () => {
    if (!session) return;
    const me = session.user.id;
    const { data } = await supabase
      .from("friend_requests")
      .select("*")
      .or(`sender_id.eq.${me},receiver_id.eq.${me}`);
    const rows = (data as RequestRow[]) ?? [];

    const acceptedIds = rows
      .filter((r) => r.status === "accepted")
      .map((r) => (r.sender_id === me ? r.receiver_id : r.sender_id));
    const pending = rows.filter((r) => r.status === "pending" && r.receiver_id === me);
    const pendingIds = pending.map((r) => r.sender_id);
    const allIds = [...new Set([...acceptedIds, ...pendingIds])];

    if (!allIds.length) {
      setFriends([]);
      setIncoming([]);
      return;
    }

    const { data: profiles } = await supabase.from("profiles").select("*").in("id", allIds);
    const map = new Map((profiles as Profile[]).map((p) => [p.id, p]));
    setFriends(acceptedIds.map((id) => map.get(id)).filter(Boolean) as Profile[]);
    setIncoming(
      pending
        .map((req) => ({ req, profile: map.get(req.sender_id) }))
        .filter((x) => x.profile) as { req: RequestRow; profile: Profile }[],
    );
  }, [session?.user.id]);

  useEffect(() => {
    void loadRelations();
    if (!session) return;
    const channel = supabase
      .channel("relations")
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        void loadRelations();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRelations, session?.user.id]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim().toLowerCase();
    if (!term || !session) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`username.ilike.%${term}%,uid.eq.${term}`)
      .neq("id", session.user.id)
      .limit(20);
    setResults((data as Profile[]) ?? []);
  };

  const sendRequest = async (target: Profile) => {
    if (!session) return;
    if (!target.allow_requests) {
      toast.error("This user is not accepting requests.");
      return;
    }
    const { error } = await supabase
      .from("friend_requests")
      .insert({ sender_id: session.user.id, receiver_id: target.id });
    if (error) {
      toast.error("Request already exists.");
      return;
    }
    setSentTo((p) => [...p, target.id]);
    toast.success("Request sent.");
  };

  const respond = async (req: RequestRow, accept: boolean) => {
    if (accept) {
      await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", req.id);
      toast.success("Request accepted.");
    } else {
      await supabase.from("friend_requests").delete().eq("id", req.id);
    }
    void loadRelations();
  };

  if (loading || !session || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const peerForCall = friends.find((f) => f.id === call.peerId) ?? active;

  return (
    <div className="h-[100dvh] overflow-hidden bg-background md:flex">
      <CallOverlay
        call={call}
        peerName={peerForCall ? nameOf(peerForCall) : "Unknown"}
        peerAvatar={peerForCall?.avatar_url}
      />

      {/* Sidebar */}
      <aside
        className={`flex h-full min-h-0 w-full flex-col border-r border-border bg-surface md:w-80 lg:w-96 ${
          active ? "hidden md:flex" : "flex"
        }`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <UserAvatar path={profile.avatar_url} name={profile.display_name || profile.username} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile.display_name || profile.username}</p>
            <p className="text-[11px] text-muted-foreground">ID {profile.uid}</p>
          </div>
          <button
            onClick={() => {
              void signOut();
              lockGate();
              void navigate({ to: "/" });
            }}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label="Exit"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="flex shrink-0 border-b border-border text-sm">
          {(
            [
              ["chats", "Chats", MessageSquarePlus],
              ["add", "Find", Search],
              ["me", "Profile", Settings2],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 ${
                tab === key
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "chats" && (
            <>
              {incoming.length > 0 && (
                <div className="border-b border-border bg-accent/40 px-3 py-2">
                  <p className="mb-2 text-xs font-medium text-accent-foreground">
                    Friend requests ({incoming.length})
                  </p>
                  {incoming.map(({ req, profile: p }) => (
                    <div key={req.id} className="flex items-center gap-2 py-1.5">
                      <UserAvatar path={p.avatar_url} name={p.display_name || p.username} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.display_name || p.username}</p>
                        <p className="text-[11px] text-muted-foreground">@{p.username}</p>
                      </div>
                      <button
                        onClick={() => void respond(req, true)}
                        className="rounded-full bg-primary p-1.5 text-primary-foreground"
                        aria-label="Accept"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void respond(req, false)}
                        className="rounded-full bg-muted p-1.5"
                        aria-label="Decline"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {friends.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No chats yet. Use Find to add someone by username or ID.
                </p>
              ) : (
                friends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setActive(f)}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted ${
                      active?.id === f.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        path={f.avatar_url}
                        name={nameOf(f)}
                        hidden={!f.show_avatar}
                      />
                      {onlineIds.includes(f.id) && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-emerald-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{nameOf(f)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {onlineIds.includes(f.id) ? (
                          <span className="text-emerald-600">online</span>
                        ) : (
                          `@${f.username}`
                        )}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </>
          )}

          {tab === "add" && (
            <div className="p-3">
              <form onSubmit={search} className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="username or ID"
                />
                <Button type="submit" size="icon" aria-label="Search">
                  <Search className="h-4 w-4" />
                </Button>
              </form>

              <div className="mt-4 space-y-1">
                {results.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                    <UserAvatar
                      path={r.avatar_url}
                      name={r.display_name || r.username}
                      hidden={!r.show_avatar}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.display_name || r.username}</p>
                      <p className="text-[11px] text-muted-foreground">
                        @{r.username} · ID {r.uid}
                      </p>
                    </div>
                    {friends.some((f) => f.id === r.id) ? (
                      <span className="text-[11px] text-muted-foreground">Friend</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={sentTo.includes(r.id)}
                        onClick={() => void sendRequest(r)}
                      >
                        <UserPlus className="mr-1 h-3.5 w-3.5" />
                        {sentTo.includes(r.id) ? "Sent" : "Add"}
                      </Button>
                    )}
                  </div>
                ))}
                {results.length === 0 && (
                  <p className="pt-6 text-center text-xs text-muted-foreground">
                    Search a friend by their username or 9-digit ID.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "me" && <ProfileEditor profile={profile} onSaved={refreshProfile} />}
        </div>
      </aside>

      {/* Chat area */}
      <main className={`h-full min-h-0 flex-1 ${active ? "block" : "hidden md:block"}`}>
        {active ? (
          <ChatWindow
            me={profile}
            peer={active}
            peerOnline={onlineIds.includes(active.id)}
            onBack={() => setActive(null)}
            onCall={(kind) => void call.startCall(active.id, kind)}
          />
        ) : (
          <div className="chat-canvas flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Select a chat to start messaging.
          </div>
        )}
      </main>
    </div>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [about, setAbout] = useState(profile.about ?? "");
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [viewer, setViewer] = useState<ViewerItem | null>(null);
  const myAvatarUrl = useSignedUrl("avatars", profile.avatar_url);

  const update = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", profile.id);
    if (error) toast.error(error.message);
    else await onSaved();
  };

  const saveCropped = async (blob: Blob) => {
    setBusy(true);
    try {
      const path = await uploadFile("avatars", profile.id, blob, "jpg");
      await update({ avatar_url: path });
      toast.success("Profile picture updated.");
      setCropFile(null);
    } catch {
      toast.error("Could not upload that picture.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 p-4">
      <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={saveCropped} />
      <MediaViewer item={viewer} onClose={() => setViewer(null)} />

      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (myAvatarUrl) setViewer({ url: myAvatarUrl, kind: "avatar", name: profile.username });
            }}
            className="rounded-full"
            aria-label="Open my photo"
          >
            <UserAvatar path={profile.avatar_url} name={profile.display_name || profile.username} size={88} />
          </button>
          <label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-primary p-1.5 text-primary-foreground">
            <Camera className="h-3.5 w-3.5" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCropFile(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="text-sm font-semibold">@{profile.username}</p>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(profile.uid);
            toast.success("ID copied.");
          }}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          ID {profile.uid} <Copy className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dn">Display name</Label>
        <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => update({ display_name: name })} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ab">About</Label>
        <Textarea id="ab" rows={2} value={about} onChange={(e) => setAbout(e.target.value)} onBlur={() => update({ about })} />
      </div>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Privacy</p>
        {(
          [
            ["show_avatar", "Show my profile photo"],
            ["show_last_seen", "Show last seen"],
            ["read_receipts", "Read receipts"],
            ["allow_requests", "Allow friend requests"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-sm">{label}</span>
            <Switch
              checked={Boolean(profile[key])}
              onCheckedChange={(v) => void update({ [key]: v })}
              aria-label={label}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Use Exit at the top to return to the research tool.
      </div>
    </div>
  );
}
