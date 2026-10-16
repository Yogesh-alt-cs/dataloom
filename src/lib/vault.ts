// Client-side encryption (AES-GCM, PBKDF2-derived). Only ciphertext reaches the server.
import { getLoginSalt, loginAccount, registerAccount, saveAccount } from "./account.functions";

export type Item =
  | { id: string; kind: "note"; title: string; body: string; updated: number }
  | { id: string; kind: "file"; name: string; mime: string; size: number; data: string; updated: number };

export const MAX_FILE = 5 * 1024 * 1024;
export const ID_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;
export const normalizeId = (s: string) => s.trim().toLowerCase();

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;

async function derive(pw: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  // 512 bits: first half = AES content key (stays in browser), second half = server access token.
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, base, 512));
  const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { key, token: b64(bits.slice(32)) };
}

export type Session = { id: string; display: string; key: CryptoKey; token: string };

async function seal(key: CryptoKey, items: Item[]) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(items)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function register(display: string, pw: string): Promise<Session | { error: string }> {
  const id = normalizeId(display);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const d = await derive(pw, salt);
  const r = await registerAccount({ data: { id, display: display.trim(), token: d.token, salt: b64(salt), ...(await seal(d.key, [])) } });
  if (!r.ok) return { error: r.error };
  return { id, display: display.trim(), ...d };
}

export async function login(rawId: string, pw: string): Promise<{ s: Session; items: Item[] }> {
  const id = normalizeId(rawId);
  if (!ID_RE.test(id)) throw new Error("Incorrect ID or password.");
  const { salt } = await getLoginSalt({ data: { id } });
  const d = await derive(pw, unb64(salt));
  const rec = await loginAccount({ data: { id, token: d.token } });
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, d.key, unb64(rec.ct));
  return { s: { id, display: rec.display, ...d }, items: JSON.parse(dec.decode(pt)) };
}

export async function saveItems(s: Session, items: Item[]) {
  await saveAccount({ data: { id: s.id, token: s.token, ...(await seal(s.key, items)) } });
}

// In-memory session only: the content key is never persisted to storage.
let current: { s: Session; items: Item[] } | null = null;
export const setSession = (v: typeof current) => { current = v; };
export const getSession = () => current;

export const fileToB64 = async (f: File) => b64(await f.arrayBuffer());
export const b64ToBlob = (d: string, mime: string) => new Blob([unb64(d)], { type: mime });
