import { useEffect, useState } from "react";
import { getSignedUrl } from "@/lib/media";

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void getSignedUrl(bucket, path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [bucket, path]);
  return url;
}

export function SignedImage({
  bucket,
  path,
  alt,
  className,
}: {
  bucket: string;
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const url = useSignedUrl(bucket, path);
  if (!url) return <div className={`animate-pulse bg-muted ${className ?? ""}`} />;
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
