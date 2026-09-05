import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, ArrowLeft } from "lucide-react";
import { getGateStatus, setGatePassword, verifyGatePassword } from "@/lib/gate.functions";
import { unlockGate } from "@/lib/gate-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Account access — Shopify Research Tools" },
      { name: "description", content: "Protected account tools for this research workspace." },
      { property: "og:title", content: "Account access — Shopify Research Tools" },
      {
        property: "og:description",
        content: "Protected account tools for this research workspace.",
      },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const navigate = useNavigate();
  const status = useServerFn(getGateStatus);
  const setKey = useServerFn(setGatePassword);
  const verifyKey = useServerFn(verifyGatePassword);

  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void status({}).then((r) => setIsSet(r.isSet));
  }, []);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isSet === false) {
        if (password.length < 4) {
          toast.error("Access key must be at least 4 characters.");
          return;
        }
        if (password !== confirm) {
          toast.error("Both keys do not match.");
          return;
        }
        const res = await setKey({ data: { password } });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        unlockGate();
        toast.success("Access key set.");
        void navigate({ to: "/auth" });
      } else {
        const res = await verifyKey({ data: { password } });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        unlockGate();
        void navigate({ to: "/auth" });
      }
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface px-4 py-3">
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <form
          onSubmit={handle}
          className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <h1 className="mt-4 text-center text-xl font-bold">
            {isSet === false ? "Set access key" : "Enter access key"}
          </h1>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {isSet === false
              ? "This key will be required every time to open the private room."
              : "Private area. Enter the key to continue."}
          </p>

          <div className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="key">Access key</Label>
              <Input
                id="key"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            {isSet === false && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm key</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
            )}
          </div>

          <Button type="submit" className="mt-5 w-full" disabled={busy || isSet === null}>
            {isSet === false ? "Set key & continue" : "Continue"}
          </Button>
        </form>
      </main>
    </div>
  );
}
