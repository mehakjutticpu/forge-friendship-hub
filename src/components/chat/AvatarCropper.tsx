import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const BOX = 272;
const OUT = 512;

export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (blob: Blob) => void | Promise<void>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      setImg(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? Math.max(BOX / img.naturalWidth, BOX / img.naturalHeight) : 1;
  const s = base * zoom;

  const clamp = (next: { x: number; y: number }) => {
    if (!img) return next;
    const maxX = Math.max(0, (img.naturalWidth * s - BOX) / 2);
    const maxY = Math.max(0, (img.naturalHeight * s - BOX) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  useEffect(() => {
    setOffset((o) => clamp(o));
  }, [zoom, img]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const confirm = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d")!;
      const left = BOX / 2 - (img.naturalWidth * s) / 2 + offset.x;
      const top = BOX / 2 - (img.naturalHeight * s) / 2 + offset.y;
      const size = BOX / s;
      ctx.drawImage(img, -left / s, -top / s, size, size, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.92),
      );
      if (blob) await onDone(blob);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Crop photo</DialogTitle>
        </DialogHeader>

        <div
          className="relative mx-auto touch-none overflow-hidden rounded-full bg-muted"
          style={{ width: BOX, height: BOX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {src && img && (
            <img
              src={src}
              alt="Crop preview"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 select-none"
              style={{
                width: img.naturalWidth * s,
                height: img.naturalHeight * s,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Drag to move, slider se zoom karein.
        </p>
        <Slider
          value={[zoom]}
          min={1}
          max={4}
          step={0.01}
          onValueChange={([v]) => setZoom(v ?? 1)}
          aria-label="Zoom"
        />

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => void confirm()} disabled={busy || !img}>
            Set photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
