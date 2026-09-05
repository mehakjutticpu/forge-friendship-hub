import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  LayoutDashboard,
  Bell,
  CreditCard,
  Globe,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Shopify Research Tools" },
      { name: "description", content: "Manage your research workspace, alerts and billing." },
      { property: "og:title", content: "Settings — Shopify Research Tools" },
      {
        property: "og:description",
        content: "Manage your research workspace, alerts and billing.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link to="/" aria-label="Back" className="rounded-md p-1.5 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted"
          >
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Dashboard</p>
              <p className="text-xs text-muted-foreground">Usage, saved lists and account tools</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>

          {[
            { icon: Bell, title: "Alerts", desc: "Weekly keyword movement email" },
            { icon: Globe, title: "Market region", desc: "Worldwide" },
            { icon: CreditCard, title: "Billing", desc: "Free plan" },
            { icon: ShieldCheck, title: "Privacy", desc: "Data retention 30 days" },
          ].map((row) => (
            <div
              key={row.title}
              className="flex items-center gap-3 border-t border-border px-4 py-4"
            >
              <row.icon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.desc}</p>
              </div>
              <Switch defaultChecked={row.title === "Alerts"} aria-label={row.title} />
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">Version 4.2.1</p>
      </main>
    </div>
  );
}
