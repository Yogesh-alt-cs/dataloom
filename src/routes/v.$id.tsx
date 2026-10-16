import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import mark from "@/assets/dataloom-mark.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_FILE, b64ToBlob, createVault, fileToB64, openVault, saveItems, vaultExists,
  type Item, type Session,
} from "@/lib/vault";

export const Route = createFileRoute("/v/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ new: s.new === true || s.new === "true" }),
  head: () => ({
    meta: [
      { title: "Your vault — DataLoom" },
      { name: "description", content: "Unlock your private, encrypted DataLoom vault." },
      { property: "og:title", content: "DataLoom vault" },
      { property: "og:description", content: "A private, encrypted vault for notes and files." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VaultPage,
});

function VaultPage() {
  const { id } = Route.useParams();
  const { new: isNew } = Route.useSearch();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  if (!session) return <Unlock id={id} isNew={isNew} onOpen={(s, it) => { setSession(s); setItems(it); }} />;
  return <Dashboard s={session} items={items} setItems={setItems} lock={() => setSession(null)} />;
}

function Unlock({ id, isNew, onOpen }: { id: string; isNew: boolean; onOpen: (s: Session, i: Item[]) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(isNew);
  useEffect(() => { vaultExists(id).then((e) => setCreating(!e && isNew)); }, [id, isNew]);

  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (creating) {
      if (pw.length < 10) return setErr("Use at least 10 characters.");
      if (pw !== pw2) return setErr("Passwords don't match.");
      if (!ack) return setErr("Please confirm you understand the warning.");
    }
    setBusy(true);
    try {
      if (creating) onOpen(await createVault(id, pw), []);
      else { const r = await openVault(id, pw); onOpen(r.s, r.items); }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center paper-grain px-6">
      <form onSubmit={go} className="w-full max-w-md border border-foreground bg-card p-8">
        <Link to="/"><img src={mark} alt="DataLoom" className="h-12 w-12 mix-blend-multiply" /></Link>
        <h1 className="mt-6 font-display text-4xl">{creating ? "Create your vault" : "Unlock vault"}</h1>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">/v/{id}</p>
        <div className="mt-6 space-y-3">
          <Input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {creating && <Input type="password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}
        </div>
        {creating && (
          <label className="mt-4 flex gap-3 border-l-2 border-foreground bg-muted p-3 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
            <span>There is no password reset. If I forget this password, my content is gone forever. I'll save this vault's address too.</span>
          </label>
        )}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <Button type="submit" className="mt-6 w-full" disabled={busy}>{busy ? "Working…" : creating ? "Create vault" : "Unlock"}</Button>
      </form>
    </main>
  );
}

function Dashboard({ s, items, setItems, lock }: { s: Session; items: Item[]; setItems: (i: Item[]) => void; lock: () => void }) {
  const [sel, setSel] = useState<string | null>(items[0]?.id ?? null);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = useMemo(() => items.find((i) => i.id === sel), [items, sel]);

  function commit(next: Item[], delay = 600) {
    setItems(next); setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveItems(s, next).then(() => setStatus("saved")).catch(() => setStatus("error")), delay);
  }
  const newNote = () => {
    const n: Item = { id: crypto.randomUUID(), kind: "note", title: "Untitled", body: "", updated: Date.now() };
    commit([n, ...items], 0); setSel(n.id);
  };
  async function upload(files: FileList | null) {
    if (!files) return; setMsg("");
    const add: Item[] = [];
    for (const f of Array.from(files)) {
      if (!/^image\/|application\/pdf/.test(f.type)) { setMsg(`${f.name}: only images and PDFs.`); continue; }
      if (f.size > MAX_FILE) { setMsg(`${f.name} is over 5 MB.`); continue; }
      add.push({ id: crypto.randomUUID(), kind: "file", name: f.name, mime: f.type, size: f.size, data: await fileToB64(f), updated: Date.now() });
    }
    if (add.length) { commit([...add, ...items], 0); setSel(add[0].id); }
  }
  const remove = (id: string) => { if (confirm("Delete this item?")) { commit(items.filter((i) => i.id !== id), 0); setSel(null); } };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-foreground px-4 py-3">
        <Link to="/" className="flex items-center gap-2"><img src={mark} alt="" className="h-8 w-8 mix-blend-multiply" /><span className="font-display text-2xl">DataLoom</span></Link>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase text-muted-foreground">
            {status === "saving" ? "Encrypting…" : status === "error" ? "Save failed" : "Encrypted · saved"}
          </span>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(location.href.split("?")[0])}>Copy address</Button>
          <Button size="sm" onClick={lock}>Lock</Button>
        </div>
      </header>
      <div className="grid flex-1 md:grid-cols-[280px_1fr]">
        <aside className="border-b border-foreground bg-sidebar md:border-b-0 md:border-r">
          <div className="flex gap-2 p-3">
            <Button size="sm" className="flex-1" onClick={newNote}>New note</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>Upload</Button>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>
          {msg && <p className="px-3 pb-2 text-xs text-destructive">{msg}</p>}
          <ul>
            {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">Empty vault. Write a note or upload an image or PDF (max 5 MB).</li>}
            {items.map((i) => (
              <li key={i.id}>
                <button onClick={() => setSel(i.id)} className={`w-full border-t border-border px-4 py-3 text-left transition-colors hover:bg-accent ${sel === i.id ? "bg-accent" : ""}`}>
                  <div className="truncate text-sm font-medium">{i.kind === "note" ? i.title || "Untitled" : i.name}</div>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">
                    {i.kind === "note" ? "note" : i.mime === "application/pdf" ? "pdf" : "image"} · {new Date(i.updated).toLocaleDateString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="p-6">
          {!current && <p className="font-display text-3xl text-muted-foreground">Select or create something.</p>}
          {current?.kind === "note" && (
            <div className="mx-auto flex h-full max-w-3xl flex-col">
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent font-display text-4xl outline-none" value={current.title}
                  onChange={(e) => commit(items.map((i) => (i.id === current.id ? { ...current, title: e.target.value, updated: Date.now() } : i)))} />
                <Button size="sm" variant="ghost" onClick={() => remove(current.id)}>Delete</Button>
              </div>
              <textarea className="mt-4 min-h-[60vh] flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed outline-none" placeholder="Start writing…"
                value={current.body}
                onChange={(e) => commit(items.map((i) => (i.id === current.id ? { ...current, body: e.target.value, updated: Date.now() } : i)))} />
            </div>
          )}
          {current?.kind === "file" && <FileView item={current} onDelete={() => remove(current.id)} />}
        </section>
      </div>
    </div>
  );
}

function FileView({ item, onDelete }: { item: Extract<Item, { kind: "file" }>; onDelete: () => void }) {
  const url = useMemo(() => URL.createObjectURL(b64ToBlob(item.data, item.mime)), [item]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl">{item.name}</h2>
          <p className="font-mono text-xs text-muted-foreground">{(item.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><a href={url} download={item.name}>Download</a></Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>Delete</Button>
        </div>
      </div>
      <div className="mt-6 border border-foreground bg-card">
        {item.mime === "application/pdf"
          ? <iframe src={url} title={item.name} className="h-[75vh] w-full" />
          : <img src={url} alt={item.name} className="mx-auto max-h-[75vh]" />}
      </div>
    </div>
  );
}
