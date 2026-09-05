import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Tracks which users are currently online via a shared realtime presence channel. */
export function usePresence(userId: string | undefined) {
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("presence-online", {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const state = channel.presenceState();
      setOnlineIds(Object.keys(state));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return onlineIds;
}
