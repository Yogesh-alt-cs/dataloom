// Client-side encryption (AES-GCM, PBKDF2-derived key) + IndexedDB storage of ciphertext only.
import { fetchVault, getVaultSalt, pushVault } from "./vault.functions";

export type Item =
  | { id: string; kind: "note"; title: string; body: string; updated: number }
  | { id: string; kind: "file"; name: string; mime: string; size: number; data: string; updated: number };

export const MAX_FILE = 5 * 1024 * 1024;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("dataloom", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("vaults");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function put(id: string, v: unknown) {
  const d = await db();
  await new Promise((res, rej) => {
    const t = d.transaction("vaults", "readwrite");
    t.objectStore("vaults").put(v, id);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}
export async function getLocal(id: string): Promise<{ salt: string; iv: string; ct: string } | undefined> {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction("vaults").objectStore("vaults").get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function derive(pw: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  // 512 bits: first half = AES key (never leaves the browser), second half = server access token.
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, base, 512));
  const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { key, token: b64(bits.slice(32)) };
}

export type Session = { id: string; key: CryptoKey; token: string; salt: string };

export const newVaultId = () => b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
export const vaultExists = async (id: string) => !!(await getVaultSalt({ data: { id } })).salt;

export async function createVault(id: string, pw: string): Promise<Session> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const s = { id, ...(await derive(pw, salt)), salt: b64(salt) };
  await saveItems(s, []);
  return s;
}

export async function openVault(id: string, pw: string): Promise<{ s: Session; items: Item[] }> {
  const { salt } = await getVaultSalt({ data: { id } });
  if (!salt) throw new Error("No vault exists at this address.");
  const d = await derive(pw, unb64(salt));
  const rec = await fetchVault({ data: { id, token: d.token } });
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, d.key, unb64(rec.ct));
    const items: Item[] = JSON.parse(dec.decode(pt));
    await put(id, { salt, iv: rec.iv, ct: rec.ct });
    return { s: { id, ...d, salt }, items };
  } catch {
    throw new Error("Unable to unlock this vault.");
  }
}

export async function saveItems(s: Session, items: Item[]) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, s.key, enc.encode(JSON.stringify(items)));
  const rec = { salt: s.salt, iv: b64(iv), ct: b64(ct) };
  await put(s.id, rec); // local encrypted cache
  await pushVault({ data: { id: s.id, token: s.token, ...rec } });
}

export const fileToB64 = async (f: File) => b64(await f.arrayBuffer());
export const b64ToBlob = (d: string, mime: string) => new Blob([unb64(d)], { type: mime });
