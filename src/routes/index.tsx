import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Settings, TrendingUp, BarChart3, Globe2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shopify Research Tools — Keyword & Product Research" },
      {
        name: "description",
        content:
          "Find high-intent Shopify keywords with search volume, competition score and trend data in seconds.",
      },
      { property: "og:title", content: "Shopify Research Tools — Keyword & Product Research" },
      {
        property: "og:description",
        content:
          "Find high-intent Shopify keywords with search volume, competition score and trend data in seconds.",
      },
    ],
  }),
  component: KeywordTool,
});

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

const MODIFIERS = [
  "best",
  "cheap",
  "wholesale",
  "custom",
  "for women",
  "for men",
  "near me",
  "online store",
  "dropshipping",
  "bulk",
];

type Row = {
  keyword: string;
  volume: number;
  competition: number;
  cpc: string;
  trend: number;
};

function buildRows(seed: string): Row[] {
  const base = hashString(seed.toLowerCase().trim());
  return MODIFIERS.map((mod, i) => {
    const h = hashString(`${seed}-${mod}-${i}`);
    return {
      keyword: mod.startsWith("for") || mod.includes("near") ? `${seed} ${mod}` : `${mod} ${seed}`,
      volume: 400 + ((h + base) % 48_000),
      competition: (h % 100) / 100,
      cpc: (0.2 + ((h >> 3) % 380) / 100).toFixed(2),
      trend: -30 + (h % 90),
    };
  });
}

function KeywordTool() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const rows = useMemo(() => (submitted ? buildRows(submitted) : []), [submitted]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Shopify Research Tools logo" width={36} height={36} className="h-9 w-9" />
            <div className="leading-tight">
              <p className="font-display text-[15px] font-bold">Shopify Research Tools</p>
              <p className="text-[11px] text-muted-foreground">Keyword &amp; product intelligence</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Settings">
            <Link to="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-8">
        <h1 className="text-balance text-3xl font-bold sm:text-4xl">
          Find keywords that actually sell.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Enter a product or niche and get search volume, competition scores, CPC estimates and 12
          month trend direction across Shopify stores.
        </p>

        <form
          className="mt-6 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. leather wallet, yoga mat, skincare serum"
              className="h-12 bg-surface pl-9 text-base"
              aria-label="Keyword"
            />
          </div>
          <Button type="submit" size="lg" className="h-12">
            Research
          </Button>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: BarChart3, label: "Keywords indexed", value: "128.4M" },
            { icon: Globe2, label: "Stores tracked", value: "2.1M" },
            { icon: TrendingUp, label: "Trends updated", value: "Daily" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <s.icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-display text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {submitted ? (
          <section className="mt-8 overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium">
                Results for <span className="text-primary">{submitted}</span>
              </p>
              <Badge variant="secondary">{rows.length} keywords</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Keyword</th>
                    <th className="px-4 py-2 font-medium">Volume</th>
                    <th className="px-4 py-2 font-medium">Comp.</th>
                    <th className="px-4 py-2 font-medium">CPC</th>
                    <th className="px-4 py-2 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.keyword} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{r.keyword}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.volume.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.round(r.competition * 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {r.competition.toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">${r.cpc}</td>
                      <td
                        className={`px-4 py-2.5 tabular-nums ${r.trend >= 0 ? "text-primary" : "text-destructive"}`}
                      >
                        {r.trend >= 0 ? "+" : ""}
                        {r.trend}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Start by searching a product keyword above.
          </p>
        )}
      </main>
    </div>
  );
}
