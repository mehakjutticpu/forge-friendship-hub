import { useSignedUrl } from "@/components/SignedImage";

export function UserAvatar({
  path,
  name,
  size = 44,
  hidden,
}: {
  path?: string | null | undefined;
  name: string;
  size?: number | undefined;
  hidden?: boolean | undefined;
}) {
  const url = useSignedUrl("avatars", hidden ? null : path);
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-display text-sm font-bold text-accent-foreground"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt={name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.36 }}>{initials}</span>
      )}
    </div>
  );
}
