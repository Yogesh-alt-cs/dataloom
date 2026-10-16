import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import mark from "@/assets/dataloom-mark.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_FILE, b64ToBlob, fileToB64, getSession, saveItems, setSession, type Item, type Session } from "@/lib/vault";

export const Route = createFileRoute("/app")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your vault — DataLoom" },
      { name: "description", content: "Your private, encrypted DataLoom notes and files." },
      { property: "og:title", content: "DataLoom vault" },
      { property: "og:description", content: "Private, encrypted notes and files." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const nav = useNavigate();
  const sess = getSession();
  useEffect(() => { if (!sess) nav({ to: "/login", replace: true }); }, [sess, nav]);
  if (!sess) return null;
  return <Dashboard s={sess.s} initial={sess.items} onLock={() => { setSession(null); nav({ to: "/login", replace: true }); }} />;
}

type Status = "saved" | "saving" | "error";

function Dashboard({ s, initial, onLock }: { s: Session; initial: Item[]; onLock: () => void }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [sel, setSel] = useState<string | null>(initial[0]?.id ?? null);
  const [status, setStatus] = useState<Status>("saved");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const focusNew = useRef(false);

  // Serialized saving: always persists the latest full list, never out of order.
  const latest = useRef(items);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(false);
  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return chain.current;
    dirty.current = false;
    const snap = latest.current;
    chain.current = chain.current
      .then(() => saveItems(s, snap))
      .then(() => { if (!dirty.current) setStatus("saved"); })
      .catch(() => { dirty.current = true; setStatus("error"); });
    return chain.current;
  };
  function commit(next: Item[], delay = 700) {
    latest.current = next; setItems(next); dirty.current = true; setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { flush(); e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });
  useEffect(() => { if (focusNew.current) { titleRef.current?.select(); focusNew.current = false; } }, [sel]);

  const current = useMemo(() => items.find((i) => i.id === sel), [items, sel]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => (i.kind === "note" ? `${i.title} ${i.body}` : i.name).toLowerCase().includes(t)) : items;
  }, [items, q]);

  const update = (id: string, patch: Partial<Item>) =>
    commit(latest.current.map((i) => (i.id === id ? ({ ...i, ...patch, updated: Date.now() } as Item) : i)));

  function newNote() {
    const n: Item = { id: crypto.randomUUID(), kind: "note", title: "Untitled", body: "", updated: Date.now() };
    focusNew.current = true; setQ("");
    commit([n, ...latest.current], 0);
    setSel(n.id);
  }
  function remove(id: string) {
    if (!confirm("Delete this item? This can't be undone.")) return;
    const next = latest.current.filter((i) => i.id !== id);
    commit(next, 0);
    setSel(next[0]?.id ?? null);
  }
  async function upload(files: FileList | null) {
    if (!files) return; setMsg("");
    const add: Item[] = [];
    for (const f of Array.from(files)) {
      if (!/^image\//.test(f.type) && f.type !== "application/pdf") { setMsg(`${f.name}: only images and PDFs are allowed.`); continue; }
      if (f.size > MAX_FILE) { setMsg(`${f.name} is larger than 5 MB.`); continue; }
      setUploading(`Encrypting ${f.name}…`);
      add.push({ id: crypto.randomUUID(), kind: "file", name: f.name, mime: f.type, size: f.size, data: await fileToB64(f), updated: Date.now() });
    }
    if (add.length) {
      setUploading(`Uploading ${add.length} file${add.length > 1 ? "s" : ""}…`);
      commit([...add, ...latest.current], 0);
      setSel(add[0]!.id);
      await flush();
    }
    setUploading(null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground px-4 py-3">
        <Link to="/" className="flex items-center gap-2"><img src={mark} alt="" className="h-8 w-8 mix-blend-multiply" /><span className="font-display text-2xl">DataLoom</span></Link>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase text-muted-foreground" aria-live="polite">
            {status === "saving" ? "Encrypting · saving…" : status === "error" ? "Save failed — will retry" : "Encrypted · synced"}
          </span>
          <span className="hidden border-l border-border pl-3 font-mono text-xs sm:inline" title="Your DataLoom ID">@{s.display}</span>
          <Button size="sm" onClick={async () => { await flush(); onLock(); }}>Lock</Button>
        </div>
      </header>
      <div className="grid flex-1 md:grid-cols-[280px_1fr]">
        <aside className="border-b border-foreground bg-sidebar md:border-b-0 md:border-r">
          <div className="flex gap-2 p-3">
            <Button size="sm" className="flex-1" onClick={newNote}>New note</Button>
            <Button size="sm" variant="outline" className="flex-1" disabled={!!uploading} onClick={() => fileRef.current?.click()}>Upload</Button>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="relative px-3 pb-3">
            <Search className="absolute left-5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-8" />
          </div>
          {uploading && <p className="px-3 pb-2 font-mono text-xs">{uploading}</p>}
          {msg && <p className="px-3 pb-2 text-xs text-destructive">{msg}</p>}
          <ul className="max-h-[40vh] overflow-y-auto md:max-h-none">
            {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">Empty vault. Write a note or upload an image or PDF (max 5 MB).</li>}
            {items.length > 0 && shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">No matches.</li>}
            {shown.map((i) => (
              <li key={i.id}>
                <button onClick={() => { flush(); setSel(i.id); }} className={`w-full border-t border-border px-4 py-3 text-left transition-colors hover:bg-accent ${sel === i.id ? "bg-accent" : ""}`}>
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
                <input ref={titleRef} aria-label="Note title" className="min-w-0 flex-1 bg-transparent font-display text-4xl outline-none" value={current.title}
                  onChange={(e) => update(current.id, { title: e.target.value })} />
                <Button size="sm" variant="ghost" onClick={newNote}><Plus className="h-4 w-4" /> New note</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(current.id)}>Delete</Button>
              </div>
              <textarea aria-label="Note body" className="mt-4 min-h-[60vh] flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed outline-none" placeholder="Start writing…"
                value={current.body} onChange={(e) => update(current.id, { body: e.target.value })} />
            </div>
          )}
          {current?.kind === "file" && <FileView key={current.id} item={current} onRename={(name) => update(current.id, { name })} onDelete={() => remove(current.id)} />}
        </section>
      </div>
    </div>
  );
}

function FileView({ item, onRename, onDelete }: { item: Extract<Item, { kind: "file" }>; onRename: (n: string) => void; onDelete: () => void }) {
  const url = useMemo(() => URL.createObjectURL(b64ToBlob(item.data, item.mime)), [item.data, item.mime]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input aria-label="File name" className="w-full bg-transparent font-display text-3xl outline-none" value={item.name}
            onChange={(e) => onRename(e.target.value)} onBlur={(e) => { if (!e.target.value.trim()) onRename("Untitled file"); }} />
          <p className="font-mono text-xs text-muted-foreground">{(item.size / 1024 / 1024).toFixed(2)} MB · click the name to rename</p>
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
