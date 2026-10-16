import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/dataloom-logo.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newVaultId } from "@/lib/vault";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DataLoom — Your thoughts. Your files. Your privacy." },
      { name: "description", content: "A private, encrypted notepad for notes, images and PDFs. No account needed." },
      { property: "og:title", content: "DataLoom — Private encrypted vault" },
      { property: "og:description", content: "Notes, images and PDFs encrypted in your browser before they're stored." },
    ],
  }),
  component: Home,
});

function Home() {
  const nav = useNavigate();
  const [open, setOpen] = useState("");
  return (
    <main className="min-h-screen paper-grain">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex items-center justify-between font-mono text-xs uppercase tracking-widest">
          <span>DataLoom / v1.0</span>
          <span className="text-muted-foreground">Encrypted in your browser</span>
        </header>
        <section className="grid items-center gap-12 py-16 md:grid-cols-[1fr_1.1fr]">
          <img src={logo} alt="DataLoom logo" className="w-full max-w-sm mix-blend-multiply" />
          <div>
            <h1 className="font-display text-6xl leading-[0.95] md:text-7xl">
              Your thoughts.<br />Your files.<br /><em>Your privacy.</em>
            </h1>
            <p className="mt-6 max-w-md text-muted-foreground">
              A quiet place for notes, images and PDFs. Everything is locked with your password before it's saved — we never see it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => nav({ to: "/v/$id", params: { id: newVaultId() }, search: { new: true } })}>
                Create your private vault
              </Button>
            </div>
            <form
              className="mt-6 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const id = open.trim().split("/v/").pop();
                if (id) nav({ to: "/v/$id", params: { id }, search: { new: false } });
              }}
            >
              <Input value={open} onChange={(e) => setOpen(e.target.value)} placeholder="Paste a vault address to open" />
              <Button variant="outline" type="submit">Open</Button>
            </form>
          </div>
        </section>
        <section className="grid gap-8 rule-ink pt-8 md:grid-cols-3">
          {[
            ["01", "No account", "Just a private address and a password."],
            ["02", "Locked first", "Notes and files are encrypted before saving."],
            ["03", "5 MB per file", "Images and PDFs up to 5 MB each."],
          ].map(([n, t, d]) => (
            <div key={n}>
              <div className="font-mono text-xs text-muted-foreground">{n}</div>
              <h3 className="mt-2 font-display text-2xl">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
