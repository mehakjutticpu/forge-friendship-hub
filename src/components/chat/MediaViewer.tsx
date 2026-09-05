import { useState } from "react";
import { Download, X } from "lucide-react";
import { toast } from "sonner";

export type ViewerItem = { url: string; kind: "image" | "video" | "avatar"; name: string };

export async function downloadUrl(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    toast.success("Saved to your downloads.");
  } catch {
    toast.error("Could not save this file.");
  }
}

export function MediaViewer({ item, onClose }: { item: ViewerItem | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!item) return null;

  const ext = item.kind === "video" ? "mp4" : "jpg";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground/95">
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={onClose}
          className="rounded-full bg-background/15 p-2 text-background"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await downloadUrl(item.url, `${item.name}.${ext}`);
            setBusy(false);
          }}
          className="flex items-center gap-2 rounded-full bg-background/15 px-4 py-2 text-sm text-background"
        >
          <Download className="h-4 w-4" /> Save
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {item.kind === "video" ? (
          <video src={item.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          <img src={item.url} alt={item.name} className="max-h-full max-w-full rounded-lg object-contain" />
        )}
      </div>
    </div>
  );
}
