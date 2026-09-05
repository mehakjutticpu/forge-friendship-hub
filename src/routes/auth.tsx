import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usernameToEmail, useAuth } from "@/hooks/useAuth";
import { isGateUnlocked } from "@/lib/gate-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Account tools — Shopify Research Tools" },
      { name: "description", content: "Sign in to the private workspace area." },
      { property: "og:title", content: "Account tools — Shopify Research Tools" },
      { property: "og:description", content: "Sign in to the private workspace area." },
    ],
  }),
  component: AuthPage,
});

function randomUid() {
  return String(Math.floor(100000000 + Math.random() * 899999999));
}

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [regUser, setRegUser] = useState("");
  const [regName, setRegName] = useState("");
  const [regPass, setRegPass] = useState("");

  useEffect(() => {
    if (!isGateUnlocked()) {
      void navigate({ to: "/" });
      return;
    }
    setChecked(true);
  }, []);

  useEffect(() => {
    if (session) void navigate({ to: "/room" });
  }, [session]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(loginUser),
      password: loginPass,
    });
    setBusy(false);
    if (error) {
      toast.error("Wrong username or password.");
      return;
    }
    void navigate({ to: "/room" });
  };

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = regUser.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      toast.error("Username: 3-20 letters, numbers, dot or underscore.");
      return;
    }
    if (regPass.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);

    const { data: taken } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (taken) {
      setBusy(false);
      toast.error("This username is already taken.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password: regPass,
    });
    if (error || !data.user) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create the account.");
      return;
    }

    let uid = randomUid();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error: insertError } = await supabase.from("profiles").insert({
        id: data.user.id,
        uid,
        username,
        display_name: regName.trim() || username,
      });
      if (!insertError) break;
      if (!insertError.message.includes("uid")) {
        setBusy(false);
        toast.error(insertError.message);
        return;
      }
      uid = randomUid();
    }

    setBusy(false);
    toast.success(`Account ready. Your ID is ${uid}`);
    void navigate({ to: "/room" });
  };

  if (!checked) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src={logo} alt="App logo" width={56} height={56} className="h-14 w-14" />
          <p className="font-display text-lg font-bold">Private Room</p>
          <p className="text-xs text-muted-foreground">Sign in with your username</p>
        </div>

        <Tabs defaultValue="login" className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Log in</TabsTrigger>
            <TabsTrigger value="register">Create ID</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={login} className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="lu">Username</Label>
                <Input id="lu" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp">Password</Label>
                <Input
                  id="lp"
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Log in
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={register} className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="ru">Username</Label>
                <Input
                  id="ru"
                  value={regUser}
                  onChange={(e) => setRegUser(e.target.value)}
                  placeholder="e.g. ali_khan"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rn">Display name</Label>
                <Input id="rn" value={regName} onChange={(e) => setRegName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp">Password</Label>
                <Input
                  id="rp"
                  type="password"
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Create ID
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
