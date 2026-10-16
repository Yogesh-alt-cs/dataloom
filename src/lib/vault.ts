// Client-side encryption (AES-GCM, PBKDF2-derived key) + IndexedDB storage of ciphertext only.
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
async function get(id: string): Promise<{ salt: string; iv: string; ct: string } | undefined> {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction("vaults").objectStore("vaults").get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function derive(pw: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type Session = { id: string; key: CryptoKey; salt: string };

export const newVaultId = () => b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
export const vaultExists = async (id: string) => !!(await get(id));

export async function createVault(id: string, pw: string): Promise<Session> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const s = { id, key: await derive(pw, salt), salt: b64(salt) };
  await saveItems(s, []);
  return s;
}

export async function openVault(id: string, pw: string): Promise<{ s: Session; items: Item[] }> {
  const rec = await get(id);
  if (!rec) throw new Error("Vault not found on this device.");
  const key = await derive(pw, unb64(rec.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, key, unb64(rec.ct));
    return { s: { id, key, salt: rec.salt }, items: JSON.parse(dec.decode(pt)) };
  } catch {
    throw new Error("Unable to unlock this vault.");
  }
}

export async function saveItems(s: Session, items: Item[]) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, s.key, enc.encode(JSON.stringify(items)));
  await put(s.id, { salt: s.salt, iv: b64(iv), ct: b64(ct) });
}

export const fileToB64 = async (f: File) => b64(await f.arrayBuffer());
export const b64ToBlob = (d: string, mime: string) => new Blob([unb64(d)], { type: mime });
