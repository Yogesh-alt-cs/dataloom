import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, PasswordInput } from "@/components/AuthShell";
import { checkId } from "@/lib/account.functions";
import { ID_RE, normalizeId, register, setSession } from "@/lib/vault";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your DataLoom ID" },
      { name: "description", content: "Pick a unique DataLoom ID and password for your private, encrypted vault." },
      { property: "og:title", content: "Create your DataLoom ID" },
      { property: "og:description", content: "No email needed. Just an ID and a password." },
    ],
  }),
  component: Signup,
});

type Avail = { state: "idle" | "invalid" | "checking" | "ok" | "taken" | "error"; suggestions: string[] };

function Signup() {
  const nav = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ack, setAck] = useState(false);
  const [avail, setAvail] = useState<Avail>({ state: "idle", suggestions: [] });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const n = normalizeId(id);
    if (!n) return setAvail({ state: "idle", suggestions: [] });
    if (!ID_RE.test(n)) return setAvail({ state: "invalid", suggestions: [] });
    setAvail({ state: "checking", suggestions: [] });
    let live = true;
    const t = setTimeout(() => {
      checkId({ data: { id: n } })
        .then((r) => live && setAvail({ state: r.available ? "ok" : "taken", suggestions: r.suggestions }))
        .catch(() => live && setAvail({ state: "error", suggestions: [] }));
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (avail.state !== "ok") return setErr("Please choose an available ID.");
    if (pw.length < 10) return setErr("Password must be at least 10 characters.");
    if (pw !== pw2) return setErr("Passwords don't match.");
    if (!ack) return setErr("Please confirm you understand there is no password reset.");
    setBusy(true);
    try {
      const r = await register(id, pw);
      if ("error" in r) { setAvail({ state: "taken", suggestions: [] }); setErr(r.error); return; }
      setSession({ s: r, items: [] });
      nav({ to: "/app" });
    } catch (x) { setErr((x as Error).message || "Registration failed."); } finally { setBusy(false); }
  }

  const msg = {
    idle: ["Letters, numbers, _ or -. 3–32 characters.", "text-muted-foreground"],
    invalid: ["Use 3–32 letters, numbers, _ or -, starting with a letter or number.", "text-destructive"],
    checking: ["Checking availability…", "text-muted-foreground"],
    ok: ["✓ This ID is available.", "text-foreground"],
    taken: ["This ID is already taken by another user. Please choose a different ID.", "text-destructive"],
    error: ["Couldn't check right now. Try again shortly.", "text-destructive"],
  }[avail.state];

  return (
    <AuthShell title="Create your DataLoom ID">
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="id" className="text-sm font-medium">Choose your DataLoom ID</label>
          <Input id="id" autoFocus autoComplete="username" value={id} onChange={(e) => setId(e.target.value.replace(/\s/g, ""))} className="mt-1" />
          <p className={`mt-1 text-xs ${msg[1]}`} aria-live="polite">{msg[0]}</p>
          {avail.suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {avail.suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setId(s)} className="border border-foreground px-2 py-1 font-mono text-xs hover:bg-accent">{s}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="pw" className="text-sm font-medium">Create password</label>
          <div className="mt-1"><PasswordInput id="pw" placeholder="At least 10 characters" autoComplete="new-password" value={pw} onChange={setPw} /></div>
        </div>
        <div>
          <label htmlFor="pw2" className="text-sm font-medium">Confirm password</label>
          <div className="mt-1"><PasswordInput id="pw2" placeholder="Repeat password" autoComplete="new-password" value={pw2} onChange={setPw2} /></div>
          {pw2 && pw !== pw2 && <p className="mt-1 text-xs text-destructive">Passwords don't match.</p>}
        </div>
        <label className="flex gap-3 border-l-2 border-foreground bg-muted p-3 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
          <span>There is no password reset. If I forget my password, my notes and files are gone forever.</span>
        </label>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
        <p className="text-center text-sm text-muted-foreground">Already have an ID? <Link to="/login" className="text-foreground underline">Log in.</Link></p>
      </form>
    </AuthShell>
  );
}
