import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, PasswordInput } from "@/components/AuthShell";
import { login, setSession } from "@/lib/vault";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — DataLoom" },
      { name: "description", content: "Log in with your DataLoom ID and password to unlock your encrypted vault." },
      { property: "og:title", content: "Log in — DataLoom" },
      { property: "og:description", content: "Unlock your private, encrypted vault." },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(""); setBusy(true);
    try {
      setSession(await login(id, pw));
      nav({ to: "/app" });
    } catch (x) {
      const m = (x as Error).message;
      setErr(m.startsWith("Too many") ? m : "Incorrect ID or password.");
    } finally { setBusy(false); }
  }

  return (
    <AuthShell title="Log in">
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="id" className="text-sm font-medium">DataLoom ID</label>
          <Input id="id" autoFocus autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label htmlFor="pw" className="text-sm font-medium">Password</label>
          <div className="mt-1"><PasswordInput id="pw" placeholder="Password" autoComplete="current-password" value={pw} onChange={setPw} /></div>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy || !id || !pw}>{busy ? "Unlocking…" : "Log in"}</Button>
        <p className="text-center text-sm text-muted-foreground"><Link to="/signup" className="text-foreground underline">Create a new ID</Link></p>
      </form>
    </AuthShell>
  );
}
