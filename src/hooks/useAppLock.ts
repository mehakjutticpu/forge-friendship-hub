import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { lockGate } from "@/lib/gate-session";

/**
 * When the app is backgrounded (user leaves / switches away), lock the private
 * area again so the access key is required on return.
 */
export function useAppLock(enabled: boolean) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const onHidden = () => {
      if (document.visibilityState === "hidden") lockGate();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void navigate({ to: "/" });
      }
    };
    const handler = () => {
      onHidden();
      onVisible();
    };

    document.addEventListener("visibilitychange", handler);
    window.addEventListener("pagehide", lockGate);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("pagehide", lockGate);
    };
  }, [enabled, navigate]);
}
