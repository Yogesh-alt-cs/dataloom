import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

// Server stores only: ciphertext, salt, and SHA-256 of a 256-bit PBKDF2-derived access token.
// The content key (other half of the derivation) never leaves the browser.
const sha = async (s: string) => {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(h)));
};
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const ip = () => getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export const ID_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const loginId = z.string().trim().toLowerCase().regex(ID_RE);
const token = z.string().min(40).max(100);
const b64 = z.string().max(100);

async function limit(bucket: string, max: number, minutes: number) {
  const db = await admin();
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await db.from("rate_events").select("id", { count: "exact", head: true }).eq("bucket", bucket).gte("at", since);
  if ((count ?? 0) >= max) throw new Error("Too many attempts. Please wait a few minutes and try again.");
  await db.from("rate_events").insert({ bucket });
}

async function taken(ids: string[]) {
  const { data } = await (await admin()).from("accounts").select("login_id").in("login_id", ids);
  return new Set((data ?? []).map((r) => r.login_id));
}

export const checkId = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: loginId }).parse(d))
  .handler(async ({ data }) => {
    await limit(`check:${ip()}`, 120, 5);
    const base = data.id.replace(/[_-]+$/, "").slice(0, 26);
    const cands = new Set<string>();
    while (cands.size < 12) {
      const n = Math.floor(Math.random() * 99) + 1;
      cands.add(Math.random() < 0.5 ? `${base}${n}` : `${base}_${n}`);
    }
    const t = await taken([data.id, ...cands]);
    return {
      available: !t.has(data.id),
      suggestions: t.has(data.id) ? [...cands].filter((c) => !t.has(c)).slice(0, 3) : [],
    };
  });

export const getLoginSalt = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: loginId }).parse(d))
  .handler(async ({ data }) => {
    await limit(`salt:${ip()}`, 60, 5);
    const { data: row } = await (await admin()).from("accounts").select("salt").eq("login_id", data.id).maybeSingle();
    // Unknown IDs get a stable fake salt so this endpoint doesn't reveal which IDs exist.
    return { salt: row?.salt ?? (await sha(`fake-salt:${data.id}`)).slice(0, 24) };
  });

export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: loginId, display: z.string().trim().max(32), token, salt: b64, iv: b64, ct: z.string().max(1000) }).parse(d))
  .handler(async ({ data }) => {
    await limit(`reg:${ip()}`, 10, 60);
    const { error } = await (await admin()).from("accounts").insert({
      login_id: data.id, display_id: data.display || data.id, salt: data.salt, auth_hash: await sha(data.token), iv: data.iv, ct: data.ct,
    });
    if (error?.code === "23505") return { ok: false as const, error: "This ID is already taken by another user. Please choose a different ID." };
    if (error) throw new Error("Registration failed. Please try again.");
    return { ok: true as const };
  });

export const loginAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: loginId, token }).parse(d))
  .handler(async ({ data }) => {
    await limit(`login:${data.id}`, 10, 15);
    await limit(`loginip:${ip()}`, 30, 15);
    const { data: row } = await (await admin()).from("accounts").select("display_id, iv, ct, auth_hash").eq("login_id", data.id).maybeSingle();
    if (!row || row.auth_hash !== (await sha(data.token))) throw new Error("Incorrect ID or password.");
    return { display: row.display_id, iv: row.iv, ct: row.ct };
  });

export const saveAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: loginId, token, iv: b64, ct: z.string().max(60_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: updated, error } = await db
      .from("accounts")
      .update({ iv: data.iv, ct: data.ct, updated_at: new Date().toISOString() })
      .eq("login_id", data.id)
      .eq("auth_hash", await sha(data.token))
      .select("login_id");
    if (error || !updated?.length) throw new Error("Save failed");
    return { ok: true };
  });
