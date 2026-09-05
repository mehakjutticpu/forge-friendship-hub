import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Shopify Research Tools" },
      { name: "description", content: "Your research usage, saved keyword lists and exports." },
      { property: "og:title", content: "Dashboard — Shopify Research Tools" },
      {
        property: "og:description",
        content: "Your research usage, saved keyword lists and exports.",
      },
    ],
  }),
  component: DashboardPage,
});

const STATS = [
  { label: "Searches this month", value: "184" },
  { label: "Saved lists", value: "12" },
  { label: "Exports", value: "5" },
  { label: "Credits left", value: "816" },
];

const BARS = [42, 61, 38, 74, 55, 88, 66, 91, 47, 70, 59, 80];

function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link to="/settings" aria-label="Back" className="rounded-md p-1.5 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">Dashboard</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <p className="font-display text-2xl font-bold">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-sm font-medium">Search activity</p>
          <div className="mt-4 flex h-32 items-end gap-1.5">
            {BARS.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/80"
                style={{ height: `${h}%` }}
                aria-hidden
              />
            ))}
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <p className="border-b border-border px-4 py-3 text-sm font-medium">Recent lists</p>
          {["Winter jackets", "Pet accessories", "Home fragrance", "Phone cases"].map((n, i) => (
            <div
              key={n}
              className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm last:border-0"
            >
              <span>{n}</span>
              <span className="text-xs text-muted-foreground">{(i + 2) * 7} keywords</span>
            </div>
          ))}
        </section>

        <div className="mt-10 flex flex-col items-center gap-1 pb-6">
          <p className="text-[11px] text-muted-foreground/70">Account tools</p>
          <Link
            to="/unlock"
            className="text-[11px] text-muted-foreground/50 underline-offset-2 hover:underline"
          >
            Sign Up
          </Link>
        </div>
      </main>
    </div>
  );
}
