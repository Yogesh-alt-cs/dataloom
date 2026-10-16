import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// The server only ever sees ciphertext and a hash of a password-derived access token.
const sha = async (s: string) => {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(h)));
};
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const id = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const getVaultSalt = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await (await admin()).from("vaults").select("salt").eq("id", data.id).maybeSingle();
    if (error) throw new Error("Sync unavailable");
    return { salt: row?.salt ?? null };
  });

export const fetchVault = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, token: z.string().min(20).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await (await admin()).from("vaults").select("iv, ct, auth_hash").eq("id", data.id).maybeSingle();
    if (!row || row.auth_hash !== (await sha(data.token))) throw new Error("Unable to unlock this vault.");
    return { iv: row.iv, ct: row.ct };
  });

export const pushVault = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id, token: z.string().min(20).max(200), salt: z.string().max(100), iv: z.string().max(100), ct: z.string().max(60_000_000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const hash = await sha(data.token);
    const { data: row } = await db.from("vaults").select("auth_hash").eq("id", data.id).maybeSingle();
    if (row && row.auth_hash !== hash) throw new Error("Not allowed");
    const { error } = await db.from("vaults").upsert({ id: data.id, salt: data.salt, iv: data.iv, ct: data.ct, auth_hash: hash, updated_at: new Date().toISOString() });
    if (error) throw new Error("Sync failed");
    return { ok: true };
  });
