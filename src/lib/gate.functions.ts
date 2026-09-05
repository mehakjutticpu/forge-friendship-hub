import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SALT = "srt-gate-v1::";

async function hash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(SALT + value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("gate_config")
    .select("password_hash")
    .eq("id", 1)
    .maybeSingle();
  return { isSet: Boolean(data?.password_hash) };
});

export const setGatePassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ password: z.string().min(4).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("gate_config")
      .select("password_hash")
      .eq("id", 1)
      .maybeSingle();

    if (existing?.password_hash) {
      return { ok: false as const, error: "Access key is already set." };
    }

    const password_hash = await hash(data.password);
    const { error } = await supabaseAdmin
      .from("gate_config")
      .upsert({ id: 1, password_hash, updated_at: new Date().toISOString() });

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const verifyGatePassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ password: z.string().min(1).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("gate_config")
      .select("password_hash")
      .eq("id", 1)
      .maybeSingle();

    if (!row?.password_hash) return { ok: false as const, error: "No access key has been set yet." };
    const attempt = await hash(data.password);
    if (attempt !== row.password_hash) return { ok: false as const, error: "Wrong access key." };
    return { ok: true as const };
  });
